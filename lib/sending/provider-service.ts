export type WhatsAppSendContext = {
  inviteId: string
  guestId: string
  jobId: string
  attempt: number
  idempotencyKey: string
}

export type WhatsAppSendPayload = {
  to: string
  body: string
  mediaUrl?: string
  template?: {
    name: string
    languageCode?: string
    headerImageUrl?: string
    bodyVariables?: string[]
    buttonDynamicValue?: string
  }
  metadata?: Record<string, unknown>
}

export type WhatsAppProviderMessageStatus =
  | 'accepted'
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'unknown'

export type WhatsAppProviderSendResult = {
  accepted: boolean
  providerMessageId?: string
  providerStatus: WhatsAppProviderMessageStatus
  rawResponse?: Record<string, unknown>
}

export type WhatsAppProviderErrorKind = 'transient' | 'permanent' | 'throttled' | 'unknown'

export type WhatsAppProviderNormalizedError = {
  kind: WhatsAppProviderErrorKind
  code?: string
  message: string
  retryAfterMs?: number
  rawError?: unknown
}

export type WhatsAppProviderMessageStatusResult = {
  providerMessageId: string
  status: WhatsAppProviderMessageStatus
  rawResponse?: Record<string, unknown>
}

/**
 * PR-01 only: unified provider interface.
 * Adapters (PR-02) will implement this contract later.
 */
export interface WhatsAppProviderService {
  readonly providerName: string

  /**
   * Send a WhatsApp message through the provider.
   * Must not include job/worker logic; provider call only.
   */
  sendMessage(
    payload: WhatsAppSendPayload,
    context: WhatsAppSendContext
  ): Promise<WhatsAppProviderSendResult>

  /**
   * Normalize provider-specific errors for retry policy decisions.
   */
  normalizeError(error: unknown): WhatsAppProviderNormalizedError

  /**
   * Optional status lookup, useful for future delivery lifecycle.
   */
  getMessageStatus?(
    providerMessageId: string,
    context?: Partial<WhatsAppSendContext>
  ): Promise<WhatsAppProviderMessageStatusResult>
}

