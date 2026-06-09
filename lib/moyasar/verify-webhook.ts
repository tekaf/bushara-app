import 'server-only'
import { createHmac, timingSafeEqual } from 'crypto'
import type { MoyasarWebhookEvent } from '@/lib/moyasar/types'
import { getMoyasarWebhookSecret, isMoyasarWebhookConfigured } from '@/lib/moyasar/server'

function safeEqualString(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export function verifyMoyasarWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = getMoyasarWebhookSecret()
  if (!secret || !signatureHeader) return false

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  const received = String(signatureHeader).trim()

  try {
    return safeEqualString(expected, received)
  } catch {
    return false
  }
}

export function verifyMoyasarWebhookSecretToken(secretToken: string | undefined | null): boolean {
  const secret = getMoyasarWebhookSecret()
  if (!secret || !secretToken) return false
  return safeEqualString(secret, String(secretToken).trim())
}

export function isMoyasarWebhookAuthentic(
  rawBody: string,
  signatureHeader: string | null,
  payload: MoyasarWebhookEvent
): boolean {
  if (!isMoyasarWebhookConfigured()) return false

  if (signatureHeader && verifyMoyasarWebhookSignature(rawBody, signatureHeader)) {
    return true
  }

  if (verifyMoyasarWebhookSecretToken(payload?.secret_token)) {
    return true
  }

  return false
}

export { isMoyasarWebhookConfigured }
