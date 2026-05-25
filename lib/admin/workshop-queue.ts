import { INVITE_REVIEW_STATUS, INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

export const VISIBLE_WORKSHOP_STATUSES = [
  INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
  INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
  INVITE_WORKFLOW_STATUS.APPROVED,
  INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SENT,
] as const

export function isPaidInvite(row: Record<string, unknown>): boolean {
  const paymentStatus = String(row?.paymentStatus || '').toLowerCase()
  const status = String(row?.status || '').toLowerCase()
  if (paymentStatus === 'paid' || status === 'paid') return true
  if (row?.inviteLockedAfterPayment === true) return true
  return false
}

/** Show invite in admin workshop queue. */
export function isVisibleInWorkshopQueue(row: Record<string, unknown>): boolean {
  const workflowStatus = String(row?.workflowStatus || '').trim()
  if (VISIBLE_WORKSHOP_STATUSES.includes(workflowStatus as (typeof VISIBLE_WORKSHOP_STATUSES)[number])) {
    return true
  }
  // Paid but stuck before workshop enter (legacy / bypass flow).
  if (workflowStatus === INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT && isPaidInvite(row)) {
    return true
  }
  if (isPaidInvite(row) && String(row?.reviewStatus || '') === INVITE_REVIEW_STATUS.PENDING) {
    return true
  }
  return false
}

export function resolveAdminPreviewUrl(
  row: Record<string, unknown>,
  internal: Record<string, unknown>
): string {
  return String(
    internal?.adminPreviewUrl ||
      row?.adminPreviewUrl ||
      row?.inviteImageUrl ||
      row?.previewUrl ||
      row?.finalUrl ||
      ''
  ).trim()
}
