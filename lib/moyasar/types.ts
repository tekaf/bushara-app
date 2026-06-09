export type MoyasarPaymentStatus =
  | 'initiated'
  | 'paid'
  | 'authorized'
  | 'failed'
  | 'refunded'
  | 'captured'
  | 'voided'
  | 'verified'

export type MoyasarInvoiceStatus =
  | 'initiated'
  | 'paid'
  | 'failed'
  | 'refunded'
  | 'canceled'
  | 'on_hold'
  | 'expired'
  | 'voided'

export interface MoyasarMetadata {
  invitationId?: string
  userId?: string
  [key: string]: string | undefined
}

export interface MoyasarPaymentSource {
  type?: string
  transaction_url?: string
  [key: string]: unknown
}

export interface MoyasarPayment {
  id: string
  status: MoyasarPaymentStatus
  amount: number
  currency: string
  description?: string
  callback_url?: string
  invoice_id?: string
  metadata?: MoyasarMetadata
  source?: MoyasarPaymentSource
  created_at?: string
  updated_at?: string
}

export interface MoyasarInvoice {
  id: string
  status: MoyasarInvoiceStatus
  amount: number
  currency: string
  description: string
  url: string
  callback_url?: string
  success_url?: string
  back_url?: string
  metadata?: MoyasarMetadata
  created_at?: string
  updated_at?: string
}

export interface MoyasarWebhookEvent {
  id: string
  type: string
  created_at?: string
  secret_token?: string
  account_name?: string
  live?: boolean
  data: MoyasarPayment
}

export interface CreateMoyasarInvoiceInput {
  amount: number
  currency?: string
  description: string
  callback_url?: string
  success_url?: string
  back_url?: string
  metadata?: MoyasarMetadata
}
