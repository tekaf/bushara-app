export const INVITE_WORKFLOW_STATUS = {
  AWAITING_PAYMENT: 'awaiting_payment',
  IN_WORKSHOP_REVIEW: 'in_workshop_review',
  NEEDS_CUSTOMER_UPDATE: 'needs_customer_update',
  APPROVED: 'approved',
  READY_FOR_SCHEDULING: 'ready_for_scheduling',
  SCHEDULED: 'scheduled',
  SENDING: 'sending',
  PARTIALLY_SENT: 'partially_sent',
  SENT: 'sent',
} as const

export const INVITE_REVIEW_STATUS = {
  PENDING: 'pending',
  CHANGES_REQUESTED: 'changes_requested',
  APPROVED: 'approved',
} as const

export type InviteWorkflowStatus =
  (typeof INVITE_WORKFLOW_STATUS)[keyof typeof INVITE_WORKFLOW_STATUS]
export type InviteReviewStatus = (typeof INVITE_REVIEW_STATUS)[keyof typeof INVITE_REVIEW_STATUS]

const WORKFLOW_TRANSITIONS: Record<InviteWorkflowStatus, InviteWorkflowStatus[]> = {
  [INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT]: [INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW],
  [INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW]: [
    INVITE_WORKFLOW_STATUS.APPROVED,
    INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
  ],
  [INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE]: [INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW],
  [INVITE_WORKFLOW_STATUS.APPROVED]: [INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING],
  [INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING]: [
    INVITE_WORKFLOW_STATUS.SCHEDULED,
    INVITE_WORKFLOW_STATUS.APPROVED,
  ],
  [INVITE_WORKFLOW_STATUS.SCHEDULED]: [
    INVITE_WORKFLOW_STATUS.SENDING,
    INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  ],
  [INVITE_WORKFLOW_STATUS.SENDING]: [
    INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
    INVITE_WORKFLOW_STATUS.SENT,
  ],
  [INVITE_WORKFLOW_STATUS.PARTIALLY_SENT]: [INVITE_WORKFLOW_STATUS.SENT],
  [INVITE_WORKFLOW_STATUS.SENT]: [],
}

const WORKFLOW_SET = new Set<string>(Object.values(INVITE_WORKFLOW_STATUS))

export function normalizeWorkflowStatus(
  current: string | undefined | null
): InviteWorkflowStatus | null {
  const value = String(current || '').trim()
  if (!value || !WORKFLOW_SET.has(value)) return null
  return value as InviteWorkflowStatus
}

export function isValidWorkflowTransition(
  current: string | undefined | null,
  next: InviteWorkflowStatus
) {
  const normalized = normalizeWorkflowStatus(current)
  if (!normalized) {
    // Backward compatibility for legacy invites without explicit workflow status.
    return next === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW
  }
  return WORKFLOW_TRANSITIONS[normalized].includes(next)
}

export function getWorkflowTransitionError(
  current: string | undefined | null,
  next: InviteWorkflowStatus
) {
  const normalized = normalizeWorkflowStatus(current)
  if (!normalized) {
    if (next === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW) return null
    return `Invalid transition: unknown -> ${next}`
  }
  if (isValidWorkflowTransition(normalized, next)) return null
  return `Invalid transition: ${normalized} -> ${next}`
}

export function canProceedAfterWorkshop(workflowStatus: string | undefined | null) {
  return workflowStatus === INVITE_WORKFLOW_STATUS.APPROVED
}

