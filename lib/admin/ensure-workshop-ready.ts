import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { isPaidInvite, resolveAdminPreviewUrl } from '@/lib/admin/workshop-queue'
import { INVITE_REVIEW_STATUS, INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'
import {
  sanitizeRenderFieldsByTemplateType,
  type FinalInvitationSnapshot,
  type SnapshotTemplateType,
} from '@/lib/workshop/snapshot'

export type EnsureWorkshopReadyOptions = {
  origin: string
  repairWorkflow?: boolean
  repairPreview?: boolean
}

export type EnsureWorkshopReadyResult = {
  invite: Record<string, unknown>
  internal: Record<string, unknown>
  adminPreviewUrl: string
  workflowStatus: string
  repairedWorkflow: boolean
  repairedPreview: boolean
}

async function renderSnapshotPreview(
  origin: string,
  snapshot: FinalInvitationSnapshot
): Promise<string | null> {
  const templateType = (snapshot?.templateType || 'A') as SnapshotTemplateType
  const strictFields = sanitizeRenderFieldsByTemplateType((snapshot?.fields || {}) as any, templateType)
  const renderResponse = await fetch(`${origin}/api/render/final`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      templateId: snapshot.templateId,
      variant: snapshot.variant || 'whatsapp_1080x1920',
      fields: strictFields,
      renderOptions: {
        layoutB: (snapshot.renderOptions as any)?.layoutB || undefined,
        blockStyleOverrides: (snapshot.renderOptions as any)?.blockStyleOverrides || {},
        blockPositionOverrides: (snapshot.renderOptions as any)?.blockPositionOverrides || {},
      },
    }),
  })
  const renderData = await renderResponse.json().catch(() => ({}))
  if (!renderResponse.ok || !renderData?.url) return null
  return String(renderData.url || '').trim()
}

/**
 * Promote paid invites stuck at awaiting_payment and ensure internal adminPreviewUrl exists.
 */
export async function ensurePaidInviteWorkshopReady(
  adminDb: Firestore,
  inviteId: string,
  options: EnsureWorkshopReadyOptions
): Promise<EnsureWorkshopReadyResult> {
  const { origin, repairWorkflow = true, repairPreview = true } = options

  const inviteRef = adminDb.collection('invites').doc(inviteId)
  const internalRef = adminDb.collection('invitation_internal').doc(inviteId)

  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) throw new Error('Invite not found')

  let invite = inviteSnap.data() as Record<string, unknown>
  let internalSnap = await internalRef.get()
  let internal = internalSnap.exists ? (internalSnap.data() as Record<string, unknown>) : {}

  let repairedWorkflow = false
  let repairedPreview = false

  if (repairWorkflow && isPaidInvite(invite)) {
    const workflowStatus = String(invite?.workflowStatus || '').trim()
    if (workflowStatus === INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT) {
      await inviteRef.set(
        {
          workflowStatus: INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
          reviewStatus: INVITE_REVIEW_STATUS.PENDING,
          paymentStatus: 'paid',
          status: 'paid',
          workshopEnteredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      repairedWorkflow = true
      const refreshed = await inviteRef.get()
      invite = refreshed.data() as Record<string, unknown>
    }
  }

  let adminPreviewUrl = resolveAdminPreviewUrl(invite, internal)

  if (repairPreview && !adminPreviewUrl) {
    const snapshot = (internal?.finalInvitationSnapshot || null) as FinalInvitationSnapshot | null
    if (snapshot?.templateId && snapshot?.fields) {
      const url = await renderSnapshotPreview(origin, snapshot)
      if (url) {
        await internalRef.set(
          {
            adminPreviewUrl: url,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
        adminPreviewUrl = url
        repairedPreview = true
        internalSnap = await internalRef.get()
        internal = internalSnap.exists ? (internalSnap.data() as Record<string, unknown>) : {}
      }
    }
  }

  return {
    invite,
    internal,
    adminPreviewUrl,
    workflowStatus: String(invite?.workflowStatus || ''),
    repairedWorkflow,
    repairedPreview,
  }
}
