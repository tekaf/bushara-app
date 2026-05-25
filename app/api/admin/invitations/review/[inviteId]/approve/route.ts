import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import {
  INVITE_REVIEW_STATUS,
  INVITE_WORKFLOW_STATUS,
  getWorkflowTransitionError,
} from '@/lib/invitations/workflow'
import { sanitizeForFirestore, type SnapshotTemplateType } from '@/lib/workshop/snapshot'
import type { FinalInvitationSnapshot } from '@/lib/workshop/snapshot'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'
import { ensurePaidInviteWorkshopReady } from '@/lib/admin/ensure-workshop-ready'
import { isPaidInvite } from '@/lib/admin/workshop-queue'
import { renderFinalPngToStorage } from '@/lib/render/final-png'

export const runtime = 'nodejs'

const APPROVAL_ALLOWED_STATUSES = new Set<string>([
  INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
  INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
  INVITE_WORKFLOW_STATUS.APPROVED,
  INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SENT,
])

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')

  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  const email = decoded.email || (await auth.getUser(decoded.uid)).email || ''
  if (!isAdminEmailServer(email)) throw new Error('Unauthorized')
  return decoded.uid
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const notes = String(body?.notes || '').trim()

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)

    const ready = await ensurePaidInviteWorkshopReady(adminDb, inviteId, {
      origin: request.nextUrl.origin,
    })
    const invite = ready.invite as any
    const currentWorkflow = String(ready.workflowStatus || invite?.workflowStatus || '')
    if (!APPROVAL_ALLOWED_STATUSES.has(currentWorkflow)) {
      const paidHint =
        currentWorkflow === INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT && isPaidInvite(invite)
          ? ' Payment is marked paid but workshop transition failed.'
          : ''
      return NextResponse.json(
        { error: `Approval is not allowed for workflow status: ${currentWorkflow || 'unknown'}.${paidHint}` },
        { status: 409 }
      )
    }
    const alreadyApproved = currentWorkflow === INVITE_WORKFLOW_STATUS.APPROVED
    const transitionError = getWorkflowTransitionError(
      currentWorkflow,
      INVITE_WORKFLOW_STATUS.APPROVED
    )
    if (transitionError && !alreadyApproved && currentWorkflow === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW) {
      return NextResponse.json({ error: transitionError }, { status: 409 })
    }
    const internalRef = adminDb.collection('invitation_internal').doc(inviteId)
    const internal = ready.internal as any
    const snapshot = (internal?.finalInvitationSnapshot || null) as FinalInvitationSnapshot | null
    if (!snapshot?.templateId || !snapshot?.fields) {
      return NextResponse.json({ error: 'Snapshot is missing. Open workshop first.' }, { status: 409 })
    }

    const templateType = (snapshot?.templateType || 'A') as SnapshotTemplateType
    const approvedPreviewUrl = await renderFinalPngToStorage({
      templateId: snapshot.templateId,
      variant: snapshot.variant || 'whatsapp_1080x1920',
      fields: (snapshot.fields || {}) as Record<string, unknown>,
      renderOptions: {
        layoutB: (snapshot.renderOptions as any)?.layoutB,
        blockStyleOverrides: (snapshot.renderOptions as any)?.blockStyleOverrides || {},
        blockPositionOverrides: (snapshot.renderOptions as any)?.blockPositionOverrides || {},
      },
      assetBaseUrl: request.nextUrl.origin,
    })
    await internalRef.set(
      {
        adminPreviewUrl: approvedPreviewUrl,
        finalInvitationSnapshot: sanitizeForFirestore({
          ...snapshot,
          templateType,
          updatedAt: new Date().toISOString(),
        }),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await inviteRef.set(
      {
        workflowStatus: INVITE_WORKFLOW_STATUS.APPROVED,
        reviewStatus: INVITE_REVIEW_STATUS.APPROVED,
        workshopApprovedAt: FieldValue.serverTimestamp(),
        workshopReviewedBy: adminUid,
        workshopReturnReason: FieldValue.delete(),
        // Expose preview to user only after approval.
        ...(approvedPreviewUrl
          ? {
              previewUrl: approvedPreviewUrl,
              inviteImageUrl: approvedPreviewUrl,
            }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await adminDb.collection('invitation_reviews').add({
      inviteId,
      action: 'approved',
      notes: notes || 'Approved from admin workshop review',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
      actorRole: 'admin',
    })

    return NextResponse.json({ ok: true, workflowStatus: INVITE_WORKFLOW_STATUS.APPROVED })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to approve invite' }, { status })
  }
}

