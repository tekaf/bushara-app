import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'

type RecoverStalledJobsInput = {
  maxJobs?: number
  nowMs?: number
}

type RecoverStalledJobsResult = {
  scanned: number
  recovered: number
  recoveredDispatching: number
  recoveredProcessing: number
  skippedActiveLock: number
}

function toMillis(value: any): number | null {
  if (!value) return null
  if (typeof value?.toMillis === 'function') return Number(value.toMillis())
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value).getTime()
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export async function recoverStalledSendJobs(
  adminDb: Firestore,
  input: RecoverStalledJobsInput = {}
): Promise<RecoverStalledJobsResult> {
  const maxJobs = Math.max(1, Math.min(500, Number(input.maxJobs || process.env.SEND_RECOVERY_MAX_JOBS || 100)))
  const nowMs = Number(input.nowMs || Date.now())
  const result: RecoverStalledJobsResult = {
    scanned: 0,
    recovered: 0,
    recoveredDispatching: 0,
    recoveredProcessing: 0,
    skippedActiveLock: 0,
  }

  const stalledSnap = await adminDb
    .collection('send_jobs')
    .where('status', 'in', ['dispatching', 'processing'])
    .limit(maxJobs)
    .get()

  result.scanned = stalledSnap.size

  for (const doc of stalledSnap.docs) {
    const jobId = doc.id
    const row = doc.data() as any
    const status = String(row?.status || '')
    const lockOwner = String(row?.lockOwner || '')
    const lockExpiresAtMs = toMillis(row?.lockExpiresAt)
    const lockIsActive = Boolean(lockOwner) && lockExpiresAtMs !== null && lockExpiresAtMs > nowMs

    if (lockIsActive) {
      result.skippedActiveLock += 1
      continue
    }

    const jobRef = adminDb.collection('send_jobs').doc(jobId)
    const reclaimed = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef)
      if (!snap.exists) return null
      const latest = snap.data() as any
      const latestStatus = String(latest?.status || '')
      if (latestStatus !== 'dispatching' && latestStatus !== 'processing') return null

      const latestOwner = String(latest?.lockOwner || '')
      const latestExpiresMs = toMillis(latest?.lockExpiresAt)
      const latestLockActive = Boolean(latestOwner) && latestExpiresMs !== null && latestExpiresMs > nowMs
      if (latestLockActive) return null

      tx.set(
        jobRef,
        {
          status: 'scheduled',
          recoveryReason: latestStatus === 'processing' ? 'stalled_processing_lock_expired' : 'stalled_dispatch_lock_expired',
          recoveryCount: FieldValue.increment(1),
          recoveredAt: FieldValue.serverTimestamp(),
          lockOwner: FieldValue.delete(),
          lockedAt: FieldValue.delete(),
          lockExpiresAt: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      return {
        inviteId: String(latest?.inviteId || '').trim(),
        previousStatus: latestStatus,
      }
    })

    if (!reclaimed) continue

    result.recovered += 1
    if (reclaimed.previousStatus === 'dispatching') result.recoveredDispatching += 1
    if (reclaimed.previousStatus === 'processing') result.recoveredProcessing += 1

    if (reclaimed.previousStatus === 'processing' && reclaimed.inviteId) {
      // If worker crashed mid-attempt, "send_pending" guests might stay stuck forever.
      // Move them to failed so they can be retried safely without duplicate processing.
      const inviteRef = adminDb.collection('invites').doc(reclaimed.inviteId)
      const pendingSnap = await inviteRef.collection('guests').where('sendStatus', '==', 'send_pending').limit(500).get()
      if (!pendingSnap.empty) {
        const batch = adminDb.batch()
        pendingSnap.docs.forEach((g) => {
          batch.set(
            g.ref,
            {
              sendStatus: 'failed',
              lastSendError: 'Recovered from stalled processing job; eligible for retry.',
              updatedAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          )
        })
        await batch.commit()
      }
    }
  }

  return result
}

