export type InviteSendWorkflowStatus =
  | 'approved'
  | 'ready_for_scheduling'
  | 'scheduled'
  | 'sending'
  | 'partially_sent'
  | 'sent'

export type GuestSendStatus =
  | 'pending'
  | 'scheduled'
  | 'send_pending'
  | 'sent'
  | 'failed'
  | 'pending_manual'
  | 'ready_manual'
  | 'manual_opened'
  | 'manually_sent'
  | 'manual_retry_needed'
  | 'blocked_missing_rsvp_token'
  | 'blocked_missing_message_context'
  | 'blocked_invalid_phone'
  | 'blocked_duplicate'
  | 'blocked_orphan'
  | 'relation_failed'

export type SendJobStatus =
  | 'scheduled'
  | 'dispatching'
  | 'processing'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'orphan_blocked'
  | 'cancelled'

export type SendLogStatus = 'accepted' | 'failed' | 'skipped'

export type InviteSendStatusSummary = {
  total: number
  pending: number
  sent: number
  failed: number
}

export type DispatchMode = 'api' | 'manual'
export type ApiHealthStatus = 'passed' | 'failed' | ''
export type DispatchStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'sending'
  | 'completed'
  | 'failed'
  | 'orphan_blocked'
  | 'relation_invalid'
  | 'orphan_detected'

export const DEFAULT_INVITE_SEND_STATUS_SUMMARY: InviteSendStatusSummary = {
  total: 0,
  pending: 0,
  sent: 0,
  failed: 0,
}

