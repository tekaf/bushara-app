import 'server-only'
import type { CreateMoyasarInvoiceInput, MoyasarInvoice } from '@/lib/moyasar/types'

const MOYASAR_API_BASE = 'https://api.moyasar.com/v1'

export function getMoyasarSecretKey(): string {
  return String(process.env.MOYASAR_SECRET_KEY || '').trim()
}

export function getMoyasarWebhookSecret(): string {
  return String(process.env.MOYASAR_WEBHOOK_SECRET || '').trim()
}

export function isMoyasarConfigured(): boolean {
  return Boolean(getMoyasarSecretKey())
}

export function isMoyasarWebhookConfigured(): boolean {
  return Boolean(getMoyasarWebhookSecret())
}

export function getMoyasarInvitesCollection(): string {
  return String(process.env.MOYASAR_FIRESTORE_INVITES_COLLECTION || 'invites').trim() || 'invites'
}

/** Base URL for callbacks/webhooks (server). Falls back to request origin when unset. */
export function getAppBaseUrl(fallbackOrigin?: string): string {
  const configured = String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
  if (configured) return configured
  const fallback = String(fallbackOrigin || '').trim().replace(/\/$/, '')
  return fallback
}

export function isMoyasarPaymentEnabled(): boolean {
  return Boolean(getMoyasarSecretKey() && String(process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY || '').trim())
}

function getBasicAuthHeader(secretKey: string): string {
  const token = Buffer.from(`${secretKey}:`).toString('base64')
  return `Basic ${token}`
}

export async function createMoyasarInvoice(
  input: CreateMoyasarInvoiceInput
): Promise<MoyasarInvoice> {
  const secretKey = getMoyasarSecretKey()
  if (!secretKey) {
    throw new Error('MOYASAR_SECRET_KEY is not configured')
  }

  const response = await fetch(`${MOYASAR_API_BASE}/invoices`, {
    method: 'POST',
    headers: {
      Authorization: getBasicAuthHeader(secretKey),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      amount: input.amount,
      currency: input.currency || 'SAR',
      description: input.description,
      callback_url: input.callback_url,
      success_url: input.success_url,
      back_url: input.back_url,
      metadata: input.metadata,
    }),
  })

  const payload = (await response.json().catch(() => ({}))) as MoyasarInvoice & {
    message?: string
    errors?: Record<string, string[]>
  }

  if (!response.ok) {
    const details =
      payload?.message ||
      Object.values(payload?.errors || {})
        .flat()
        .join(', ') ||
      `Moyasar invoice creation failed (${response.status})`
    throw new Error(details)
  }

  if (!payload?.id || !payload?.url) {
    throw new Error('Moyasar invoice response is missing id or url')
  }

  return payload
}
