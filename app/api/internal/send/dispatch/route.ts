import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { acquireSendJobLock } from '@/lib/sending/processing-guard'
import { recoverStalledSendJobs } from '@/lib/sending/stalled-recovery'

export const runtime = 'nodejs'

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const authHeader = request.headers.get('authorization') || ''
  if (authHeader === `Bearer ${secret}`) return true
  const token = request.nextUrl.searchParams.get('token')
  return token === secret
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

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorizedCron(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const body = await request.json().catch(() => ({}))
    const maxJobs = Math.max(1, Math.min(200, Number(body?.maxJobs || process.env.SEND_DISPATCH_MAX_JOBS || 50)))
    const lockTtlMs = Math.max(5_000, Number(body?.lockTtlMs || process.env.SEND_JOB_LOCK_TTL_MS || 60_000))
    const dispatchRunId = `dispatch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    const recovery = await recoverStalledSendJobs(adminDb, {
      maxJobs: Number(body?.recoveryMaxJobs || process.env.SEND_RECOVERY_MAX_JOBS || 100),
      nowMs: now,
    })

    let scheduledSnap
    try {
      scheduledSnap = await adminDb
        .collection('send_jobs')
        .where('status', '==', 'scheduled')
        .where('scheduledAt', '<=', new Date(now))
        .orderBy('scheduledAt', 'asc')
        .limit(maxJobs)
        .get()
    } catch {
      // Fallback without composite index: pull scheduled jobs then filter due in memory.
      scheduledSnap = await adminDb.collection('send_jobs').where('status', '==', 'scheduled').limit(500).get()
    }

    const dueDocs = scheduledSnap.docs
      .filter((doc) => {
        const row = doc.data() as any
        const scheduledAt = toMillis(row?.scheduledAt)
        return scheduledAt !== null && scheduledAt <= now
      })
      .sort((a, b) => {
        const aTime = toMillis((a.data() as any)?.scheduledAt) ?? Number.MAX_SAFE_INTEGER
        const bTime = toMillis((b.data() as any)?.scheduledAt) ?? Number.MAX_SAFE_INTEGER
        return aTime - bTime
      })
      .slice(0, maxJobs)

    const picked: string[] = []
    const skippedLocked: string[] = []

    for (const doc of dueDocs) {
      const jobId = doc.id
      const lock = await acquireSendJobLock(adminDb, {
        jobId,
        lockOwner: dispatchRunId,
        lockTtlMs,
      })

      if (!lock.acquired) {
        skippedLocked.push(jobId)
        continue
      }

      await adminDb
        .collection('send_jobs')
        .doc(jobId)
        .set(
          {
            status: 'dispatching',
            dispatchRunId,
            dispatchPickedAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )

      picked.push(jobId)
    }

    return NextResponse.json({
      ok: true,
      dispatchRunId,
      recovery,
      dueCount: dueDocs.length,
      pickedCount: picked.length,
      skippedLockedCount: skippedLocked.length,
      pickedJobIds: picked,
      skippedLockedJobIds: skippedLocked,
      note: 'WK-01 only: jobs are picked and locked; no guest processing is executed here.',
    })
  } catch (error: any) {
    console.error('[SEND][DISPATCH] failed:', error)
    return NextResponse.json({ error: error?.message || 'Dispatch failed' }, { status: 500 })
  }
}

