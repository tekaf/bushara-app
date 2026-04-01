export type InviteSendWorkflowStatus =
  | 'approved'
  | 'ready_for_scheduling'
  | 'scheduled'
  | 'sending'
  | 'partially_sent'
  | 'sent'

export type GuestSendStatus = 'pending' | 'scheduled' | 'send_pending' | 'sent' | 'failed'

export type SendJobStatus =
  | 'scheduled'
  | 'dispatching'
  | 'processing'
  | 'completed'
  | 'partially_completed'
  | 'failed'
  | 'cancelled'

export type SendLogStatus = 'accepted' | 'failed' | 'skipped'

export type InviteSendStatusSummary = {
  total: number
  pending: number
  sent: number
  failed: number
}

export const DEFAULT_INVITE_SEND_STATUS_SUMMARY: InviteSendStatusSummary = {
  total: 0,
  pending: 0,
  sent: 0,
  failed: 0,
}

