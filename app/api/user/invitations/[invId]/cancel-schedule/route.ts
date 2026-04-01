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

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const result = await adminDb.runTransaction(async (tx) => {
      const inviteSnap = await tx.get(inviteRef)
      if (!inviteSnap.exists) return { ok: false as const, status: 404, error: 'Invite not found' }

      const invite = inviteSnap.data() as any
      if (String(invite?.ownerId || '') !== uid) {
        return { ok: false as const, status: 403, error: 'Forbidden' }
      }

      const workflowStatus = String(invite?.workflowStatus || '').trim()
      if (
        workflowStatus === INVITE_WORKFLOW_STATUS.SENDING ||
        workflowStatus === INVITE_WORKFLOW_STATUS.PARTIALLY_SENT ||
        workflowStatus === INVITE_WORKFLOW_STATUS.SENT
      ) {
        return {
          ok: false as const,
          status: 409,
          error: `Cancellation is not allowed after sending started (workflowStatus=${workflowStatus}).`,
        }
      }

      const processingOrFinalJobsSnap = await tx.get(
        adminDb
          .collection('send_jobs')
          .where('inviteId', '==', inviteId)
          .where('status', 'in', ['processing', 'completed', 'partially_completed', 'failed'])
          .limit(1)
      )
      if (!processingOrFinalJobsSnap.empty) {
        return {
          ok: false as const,
          status: 409,
          error: 'Cancellation is not allowed after job processing has started or finished.',
        }
      }

      const cancellableJobsSnap = await tx.get(
        adminDb
          .collection('send_jobs')
          .where('inviteId', '==', inviteId)
          .where('status', 'in', ['scheduled', 'dispatching'])
      )
      if (cancellableJobsSnap.empty) {
        return {
          ok: false as const,
          status: 409,
          error: 'No cancellable scheduled job found for this invitation.',
        }
      }

      const transitionError = getWorkflowTransitionError(workflowStatus, INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING)
      if (transitionError) {
        return { ok: false as const, status: 409, error: transitionError }
      }

      const guestsSnap = await tx.get(inviteRef.collection('guests'))
      const guestRows = guestsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
      const scheduledGuests = guestRows.filter((g) => String(g.sendStatus || '') === 'scheduled')
      const summaryForAfterCancel = countInviteSendSummary(
        guestRows.map((g) => ({
          ...g,
          sendStatus: String(g.sendStatus || '') === 'scheduled' ? 'pending' : g.sendStatus,
        }))
      )

      cancellableJobsSnap.docs.forEach((jobDoc) => {
        tx.set(
          jobDoc.ref,
          {
            status: 'cancelled',
            cancelledAt: FieldValue.serverTimestamp(),
            cancelledByUid: uid,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      })

      for (const guest of scheduledGuests) {
        tx.set(
          inviteRef.collection('guests').doc(guest.id),
          {
            sendStatus: 'pending',
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }

      tx.set(
        inviteRef,
        {
          workflowStatus: INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
          scheduledSendAt: null,
          sendStatusSummary: summaryForAfterCancel,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      return {
        ok: true as const,
        status: 200,
        cancelledJobsCount: cancellableJobsSnap.size,
        revertedGuestsCount: scheduledGuests.length,
        workflowStatus: INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
      }
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({
      ok: true,
      inviteId,
      workflowStatus: result.workflowStatus,
      cancelledJobsCount: result.cancelledJobsCount,
      revertedGuestsCount: result.revertedGuestsCount,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to cancel schedule' }, { status })
  }
}

