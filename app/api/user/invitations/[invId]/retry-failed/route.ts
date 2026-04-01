import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { getWorkflowTransitionError, INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

export const runtime = 'nodejs'

async function getSession(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')
  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  if (!app || !adminDb) throw new Error('Admin SDK not configured')
  const decoded = await getAuth(app).verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  return { uid: decoded.uid, adminDb }
}

function parseScheduledAt(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  const parsed = new Date(String(value))
  if (!Number.isFinite(parsed.getTime())) return null
  return parsed
}

function isInvitePaid(invite: any) {
  return String(invite?.paymentStatus || '') === 'paid' || String(invite?.status || '') === 'paid'
}

function countInviteSendSummary(guestRows: any[]) {
  const summary = { total: guestRows.length, pending: 0, sent: 0, failed: 0 }
  for (const guest of guestRows) {
    const sendStatus = String(guest?.sendStatus || 'pending')
    if (sendStatus === 'sent') summary.sent += 1
    else if (sendStatus === 'failed') summary.failed += 1
    else summary.pending += 1
  }
  return summary
}

export async function POST(request: NextRequest, { params }: { params: { invId: string } }) {
  try {
    const { uid, adminDb } = await getSession(request)
    const inviteId = String(params?.invId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const allowOverLimitManual = body?.allowOverLimitManual === true
    const maxAttempts = Math.max(1, Number(process.env.SEND_MAX_ATTEMPTS || 3))
    const timezone = String(body?.timezone || 'Asia/Riyadh').trim() || 'Asia/Riyadh'
    const requestedScheduledAt = parseScheduledAt(body?.scheduledSendAt)
    if (body?.scheduledSendAt !== undefined && !requestedScheduledAt) {
      return NextResponse.json({ error: 'Invalid scheduledSendAt. Provide a valid ISO datetime.' }, { status: 400 })
    }
    const scheduledAt = requestedScheduledAt || new Date(Date.now() + 30_000)
    if (scheduledAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'scheduledSendAt must be in the future.' }, { status: 409 })
    }

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const result = await adminDb.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef)
      if (!inviteSnap.exists) return { ok: false as const, status: 404, error: 'Invite not found' }
      const invite = inviteSnap.data() as any
      if (String(invite?.ownerId || '') !== uid) {
        return { ok: false as const, status: 403, error: 'Forbidden' }
      }
      if (!isInvitePaid(invite)) {
        return { ok: false as const, status: 409, error: 'Cannot retry failed guests before payment is confirmed.' }
      }

      const workflowStatus = String(invite?.workflowStatus || '').trim()
      if (workflowStatus === INVITE_WORKFLOW_STATUS.SENDING) {
        return {
          ok: false as const,
          status: 409,
          error: 'Retry is not allowed while invitation is actively sending.',
        }
      }
      if (
        workflowStatus !== INVITE_WORKFLOW_STATUS.APPROVED &&
        workflowStatus !== INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING &&
        workflowStatus !== INVITE_WORKFLOW_STATUS.SCHEDULED &&
        workflowStatus !== INVITE_WORKFLOW_STATUS.PARTIALLY_SENT
      ) {
        return {
          ok: false as const,
          status: 409,
          error: `Retry is not allowed for workflowStatus=${workflowStatus || 'unknown'}.`,
        }
      }

      const activeJobsSnap = await tx.get(
        adminDb
          .collection('send_jobs')
          .where('inviteId', '==', inviteId)
          .where('status', 'in', ['scheduled', 'dispatching', 'processing'])
          .limit(1)
      )
      if (!activeJobsSnap.empty) {
        return {
          ok: false as const,
          status: 409,
          error: 'Retry is blocked while another send job is active.',
        }
      }

      const guestsSnap = await tx.get(inviteRef.collection('guests'))
      const guestRows = guestsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      const failedGuests = guestRows.filter((guest) => {
        const sendStatus = String(guest?.sendStatus || '')
        const phone = String(guest?.phoneE164 || guest?.phone || '').trim()
        return sendStatus === 'failed' && Boolean(phone)
      })
      if (failedGuests.length === 0) {
        return { ok: false as const, status: 409, error: 'No failed guests available for retry.' }
      }

      const retryEligibleGuests = failedGuests.filter((guest) => {
        const attempts = Number(guest?.sendAttemptCount || 0)
        if (allowOverLimitManual) return true
        return attempts < maxAttempts
      })

      const overLimitGuests = failedGuests.filter((guest) => Number(guest?.sendAttemptCount || 0) >= maxAttempts)
      if (retryEligibleGuests.length === 0) {
        if (overLimitGuests.length > 0 && !allowOverLimitManual) {
          return {
            ok: false as const,
            status: 409,
            error:
              `All failed guests reached maxAttempts (${maxAttempts}). ` +
              'Retry over the limit requires allowOverLimitManual=true.',
          }
        }
        return { ok: false as const, status: 409, error: 'No guests eligible for retry.' }
      }

      let nextWorkflowStatus = workflowStatus
      if (
        workflowStatus === INVITE_WORKFLOW_STATUS.APPROVED ||
        workflowStatus === INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING ||
        workflowStatus === INVITE_WORKFLOW_STATUS.SCHEDULED
      ) {
        const transitionError = getWorkflowTransitionError(workflowStatus, INVITE_WORKFLOW_STATUS.SCHEDULED)
        if (transitionError) {
          return { ok: false as const, status: 409, error: transitionError }
        }
        nextWorkflowStatus = INVITE_WORKFLOW_STATUS.SCHEDULED
      }

      const jobRef = adminDb.collection('send_jobs').doc()
      tx.set(jobRef, {
        inviteId,
        scheduledAt,
        status: 'scheduled',
        attempt: 0,
        timezone,
        createdByUid: uid,
        source: 'retry_failed_manual',
        maxAttempts,
        allowOverLimitManual,
        targetGuestCount: retryEligibleGuests.length,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      for (const guest of retryEligibleGuests) {
        tx.set(
          inviteRef.collection('guests').doc(guest.id),
          {
            sendStatus: 'scheduled',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }

      const summaryAfterRetry = countInviteSendSummary(
        guestRows.map((guest) => ({
          ...guest,
          sendStatus: retryEligibleGuests.some((g) => g.id === guest.id) ? 'scheduled' : guest.sendStatus,
        }))
      )

      tx.set(
        inviteRef,
        {
          workflowStatus: nextWorkflowStatus,
          scheduledSendAt: scheduledAt,
          timezone,
          sendStatusSummary: summaryAfterRetry,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      return {
        ok: true as const,
        status: 200,
        jobId: jobRef.id,
        retryGuestsCount: retryEligibleGuests.length,
        skippedOverLimitCount: allowOverLimitManual ? 0 : overLimitGuests.length,
        workflowStatus: nextWorkflowStatus,
      }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      inviteId,
      jobId: result.jobId,
      workflowStatus: result.workflowStatus,
      retryGuestsCount: result.retryGuestsCount,
      skippedOverLimitCount: result.skippedOverLimitCount,
      maxAttempts,
      allowOverLimitManual,
      scheduledSendAt: scheduledAt.toISOString(),
      timezone,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to retry failed guests' }, { status })
  }
}

