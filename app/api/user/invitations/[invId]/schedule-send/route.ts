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

function canMoveToScheduled(currentWorkflowStatus: string | undefined | null) {
  const current = String(currentWorkflowStatus || '').trim()
  if (current === INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING) {
    return { ok: true as const, path: ['ready_for_scheduling', 'scheduled'] as const }
  }

  if (current === INVITE_WORKFLOW_STATUS.APPROVED) {
    const toReadyErr = getWorkflowTransitionError(current, INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING)
    if (toReadyErr) return { ok: false as const, reason: toReadyErr }
    const toScheduledErr = getWorkflowTransitionError(
      INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
      INVITE_WORKFLOW_STATUS.SCHEDULED
    )
    if (toScheduledErr) return { ok: false as const, reason: toScheduledErr }
    return { ok: true as const, path: ['approved', 'ready_for_scheduling', 'scheduled'] as const }
  }

  return {
    ok: false as const,
    reason:
      getWorkflowTransitionError(current, INVITE_WORKFLOW_STATUS.SCHEDULED) ||
      `Invalid workflowStatus for scheduling: ${current || 'unknown'}`,
  }
}

export async function POST(request: NextRequest, { params }: { params: { invId: string } }) {
  try {
    const { uid, adminDb } = await getSession(request)
    const inviteId = String(params?.invId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const scheduledSendAt = parseScheduledAt(body?.scheduledSendAt)
    const timezone = String(body?.timezone || 'Asia/Riyadh').trim() || 'Asia/Riyadh'
    if (!scheduledSendAt) {
      return NextResponse.json({ error: 'Invalid scheduledSendAt. Provide a valid ISO datetime.' }, { status: 400 })
    }
    if (scheduledSendAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: 'scheduledSendAt must be in the future.' }, { status: 409 })
    }

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const guestsRef = inviteRef.collection('guests')

    const result = await adminDb.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef)
      if (!inviteSnap.exists) {
        return { ok: false as const, status: 404, error: 'Invite not found' }
      }
      const invite = inviteSnap.data() as any
      if (String(invite?.ownerId || '') !== uid) {
        return { ok: false as const, status: 403, error: 'Forbidden' }
      }
      if (!isInvitePaid(invite)) {
        return { ok: false as const, status: 409, error: 'Cannot schedule send before payment is confirmed.' }
      }

      const workflowCheck = canMoveToScheduled(String(invite?.workflowStatus || ''))
      if (!workflowCheck.ok) {
        return { ok: false as const, status: 409, error: workflowCheck.reason }
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
          error: 'A send job is already active for this invitation. Cancel/reschedule is required first.',
        }
      }

      const guestsSnap = await tx.get(guestsRef)
      const validGuests = guestsSnap.docs.filter((doc) => {
        const row = doc.data() as any
        const phone = String(row?.phoneE164 || row?.phone || '').trim()
        if (!phone) return false
        const sendStatus = String(row?.sendStatus || 'pending')
        return sendStatus !== 'sent'
      })
      if (validGuests.length === 0) {
        return {
          ok: false as const,
          status: 409,
          error: 'No valid guests available for scheduling.',
        }
      }

      const jobRef = adminDb.collection('send_jobs').doc()
      tx.set(jobRef, {
        inviteId,
        scheduledAt: scheduledSendAt,
        status: 'scheduled',
        attempt: 0,
        createdByUid: uid,
        timezone,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      })

      for (const guestDoc of validGuests) {
        tx.set(
          guestsRef.doc(guestDoc.id),
          {
            sendStatus: 'scheduled',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }

      tx.set(
        inviteRef,
        {
          workflowStatus: INVITE_WORKFLOW_STATUS.SCHEDULED,
          scheduledSendAt,
          timezone,
          sendStatusSummary: {
            total: guestsSnap.size,
            pending: validGuests.length,
            sent: 0,
            failed: 0,
          },
          lastSendAt: null,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      return {
        ok: true as const,
        status: 200,
        inviteId,
        jobId: jobRef.id,
        workflowPath: workflowCheck.path,
        validGuestsCount: validGuests.length,
      }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      inviteId: result.inviteId,
      jobId: result.jobId,
      workflowStatus: INVITE_WORKFLOW_STATUS.SCHEDULED,
      workflowPath: result.workflowPath,
      validGuestsCount: result.validGuestsCount,
      scheduledSendAt: scheduledSendAt.toISOString(),
      timezone,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to schedule send job' }, { status })
  }
}

