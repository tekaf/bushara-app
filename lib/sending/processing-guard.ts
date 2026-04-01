import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'

type AcquireLockInput = {
  jobId: string
  lockOwner: string
  lockTtlMs?: number
}

type ReleaseLockInput = {
  jobId: string
  lockOwner: string
}

type IdempotencyInput = {
  key: string
  inviteId: string
  guestId?: string
  jobId?: string
  metadata?: Record<string, unknown>
}

export function buildGuestSendIdempotencyKey(input: {
  inviteId: string
  guestId: string
  jobId: string
  attempt: number
}) {
  return `invite:${input.inviteId}:guest:${input.guestId}:job:${input.jobId}:attempt:${input.attempt}`
}

function sanitizeId(value: string) {
  return value.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 500)
}

export async function acquireSendJobLock(
  adminDb: Firestore,
  input: AcquireLockInput
): Promise<{ acquired: boolean; reason?: string; lockExpiresAt?: Date }> {
  const lockTtlMs = Math.max(5_000, Number(input.lockTtlMs || 60_000))
  const jobRef = adminDb.collection('send_jobs').doc(input.jobId)
  const now = new Date()
  const lockExpiresAt = new Date(now.getTime() + lockTtlMs)

  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef)
    if (!snap.exists) return { acquired: false, reason: 'job_not_found' }
    const row = snap.data() as any
    const currentOwner = String(row?.lockOwner || '')
    const expiresAtDate = row?.lockExpiresAt?.toDate?.() || null
    const lockActive = Boolean(currentOwner) && expiresAtDate instanceof Date && expiresAtDate.getTime() > now.getTime()

    if (lockActive && currentOwner !== input.lockOwner) {
      return { acquired: false, reason: 'already_locked' }
    }

    tx.set(
      jobRef,
      {
        lockOwner: input.lockOwner,
        lockedAt: now,
        lockExpiresAt,
        updatedAt: now,
      },
      { merge: true }
    )

    return { acquired: true, lockExpiresAt }
  })
}

export async function releaseSendJobLock(adminDb: Firestore, input: ReleaseLockInput) {
  const jobRef = adminDb.collection('send_jobs').doc(input.jobId)
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(jobRef)
    if (!snap.exists) return { released: false, reason: 'job_not_found' }
    const row = snap.data() as any
    if (String(row?.lockOwner || '') !== input.lockOwner) {
      return { released: false, reason: 'not_lock_owner' }
    }

    tx.set(
      jobRef,
      {
        lockOwner: FieldValue.delete(),
        lockedAt: FieldValue.delete(),
        lockExpiresAt: FieldValue.delete(),
        updatedAt: new Date(),
      },
      { merge: true }
    )
    return { released: true }
  })
}

export async function claimSendIdempotency(
  adminDb: Firestore,
  input: IdempotencyInput
): Promise<{ claimed: boolean; reason?: string }> {
  const id = sanitizeId(input.key)
  const ref = adminDb.collection('send_idempotency').doc(id)
  const now = new Date()

  try {
    await ref.create({
      key: input.key,
      inviteId: input.inviteId,
      guestId: input.guestId || null,
      jobId: input.jobId || null,
      metadata: input.metadata || {},
      createdAt: now,
    })
    return { claimed: true }
  } catch (error: any) {
    if (String(error?.code || '').includes('already-exists') || String(error?.message || '').includes('already exists')) {
      return { claimed: false, reason: 'duplicate' }
    }
    throw error
  }
}

