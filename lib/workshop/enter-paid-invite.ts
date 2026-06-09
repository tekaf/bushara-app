import 'server-only'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { resolveAdminPreviewUrl } from '@/lib/admin/workshop-queue'
import {
  INVITE_REVIEW_STATUS,
  INVITE_WORKFLOW_STATUS,
  getWorkflowTransitionError,
} from '@/lib/invitations/workflow'
import { sendWorkshopReviewEmail } from '@/lib/notifications/admin-workshop-email'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'

type EnterPaidInviteWorkshopOptions = {
  origin: string
  actorUid?: string
}

type EnterPaidInviteWorkshopResult = {
  entered: boolean
  alreadyInWorkshop: boolean
  emailDelivered: boolean
  adminPreviewUrl: string
}

function normalizeOccasion(value: string): string {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'wedding') return 'زواج أو ملكه'
  if (key === 'engagement') return 'خطبة'
  if (key === 'special') return 'مناسبة خاصة'
  return value || '-'
}

/**
 * Moves a paid invite into workshop review and notifies admins.
 * Safe to call from payment webhooks (idempotent).
 */
export async function enterPaidInviteWorkshop(
  adminDb: Firestore,
  inviteId: string,
  options: EnterPaidInviteWorkshopOptions
): Promise<EnterPaidInviteWorkshopResult> {
  const origin = String(options.origin || '').trim().replace(/\/$/, '')
  const inviteRef = adminDb.collection('invites').doc(inviteId)
  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) {
    throw new Error(`Invite not found: ${inviteId}`)
  }

  const invite = inviteSnap.data() as Record<string, unknown>
  const paymentStatus = String(invite?.paymentStatus || '').toLowerCase()
  const isPaid =
    paymentStatus === 'paid' || invite?.paid === true || String(invite?.status || '').toLowerCase() === 'paid'
  if (!isPaid) {
    throw new Error('Invite is not marked as paid')
  }

  const currentWorkflow = String(invite?.workflowStatus || '')
  const alreadyInWorkshop = currentWorkflow === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW
  const transitionError = getWorkflowTransitionError(currentWorkflow, INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW)
  if (!alreadyInWorkshop && transitionError && currentWorkflow !== INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT) {
    throw new Error(transitionError)
  }

  const internalSnap = await adminDb.collection('invitation_internal').doc(inviteId).get()
  const internal = internalSnap.exists ? (internalSnap.data() as Record<string, unknown>) : {}
  const adminPreviewUrl = resolveAdminPreviewUrl(invite, internal)

  const orderFoundation = await ensureInviteOrderFoundation(adminDb, inviteId)
  const ownerId = String(invite?.ownerId || '').trim()
  const actorUid = String(options.actorUid || ownerId || 'system').trim()

  let customerName = 'مستخدم بشاره'
  if (ownerId) {
    const userSnap = await adminDb.collection('users').doc(ownerId).get()
    const userData = userSnap.exists ? (userSnap.data() as Record<string, unknown>) : {}
    customerName =
      String(userData?.name || '').trim() ||
      String(userData?.email || '').split('@')[0] ||
      customerName
  }

  const phoneNumber = String(
    invite?.customerPhoneLocal || invite?.customerPhoneE164 || ''
  ).trim()
  const orderNumber = String(orderFoundation.orderCode || invite?.orderCode || invite?.orderNumber || '').trim()
  const occasionType = normalizeOccasion(String(invite?.selectedOccasion || invite?.occasionType || ''))
  const packageGuests = Number(invite?.packageGuests || 0)
  const packageLabel = packageGuests > 0 ? `${packageGuests} ضيف` : '-'
  const amountSar = Number(invite?.packagePrice || 0)
  const reviewUrl = `${origin}/admin/invitations/review/${encodeURIComponent(inviteId)}`

  if (adminPreviewUrl) {
    await adminDb.collection('invitation_internal').doc(inviteId).set(
      {
        adminPreviewUrl,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  }

  if (!alreadyInWorkshop) {
    await inviteRef.set(
      {
        paymentStatus: 'paid',
        status: 'paid',
        orderStatus: 'pending_review',
        workflowStatus: INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
        reviewStatus: INVITE_REVIEW_STATUS.PENDING,
        adminPreviewUrl: FieldValue.delete(),
        previewUrl: FieldValue.delete(),
        finalUrl: FieldValue.delete(),
        inviteImageUrl: FieldValue.delete(),
        workshopEnteredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await adminDb.collection('invitation_reviews').add({
      inviteId,
      orderCode: orderNumber,
      action: 'entered_workshop',
      notes: 'Payment confirmed via Moyasar. Invitation entered workshop confirmation.',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: actorUid,
      actorRole: 'system',
    })
  }

  let mailDelivered = false
  let mailError = ''
  let recipients: string[] = []

  if (
    adminPreviewUrl &&
    (!alreadyInWorkshop || String(invite?.adminNotificationStatus || '') !== 'delivered')
  ) {
    try {
      const mailResult = await sendWorkshopReviewEmail({
        inviteId,
        orderNumber,
        customerName,
        phoneNumber,
        occasionType,
        packageLabel,
        amountSar,
        reviewUrl,
      })
      mailDelivered = mailResult.delivered
      recipients = mailResult.recipients || []
    } catch (mailErr: unknown) {
      mailDelivered = false
      mailError = mailErr instanceof Error ? mailErr.message : 'email_send_failed'
    }

    await adminDb.collection('admin_notifications').add({
      type: 'workshop_review_required',
      inviteId,
      orderCode: orderNumber,
      orderNumber,
      customerName,
      occasionType,
      reviewUrl,
      emailDelivered: mailDelivered,
      recipients,
      error: mailError || '',
      createdAt: FieldValue.serverTimestamp(),
    })
  } else if (!adminPreviewUrl) {
    mailError = 'missing_admin_preview'
    console.warn('[WORKSHOP][ENTER_PAID] missing preview — workshop entered without admin email', {
      inviteId,
    })
  } else {
    mailDelivered = true
  }

  await inviteRef.set(
    {
      adminNotificationStatus: adminPreviewUrl ? (mailDelivered ? 'delivered' : 'failed') : 'pending',
      adminNotificationError: mailDelivered
        ? FieldValue.delete()
        : mailError || (adminPreviewUrl ? 'email_send_failed' : 'missing_admin_preview'),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  return {
    entered: !alreadyInWorkshop,
    alreadyInWorkshop,
    emailDelivered: mailDelivered,
    adminPreviewUrl,
  }
}
