import { readWhatsAppConfig } from '@/lib/whatsapp/config'

type WhatsAppTextMessageInput = {
  to: string
  message: string
}

type MetaGraphError = {
  message?: string
  type?: string
  code?: number | string
  error_subcode?: number | string
  fbtrace_id?: string
}

type MetaSendApiResponse = {
  messaging_product?: string
  contacts?: Array<{ input?: string; wa_id?: string }>
  messages?: Array<{ id?: string; message_status?: string }>
  error?: MetaGraphError
}

export type WhatsAppSendResult = {
  messageId?: string
  status?: string
  raw: MetaSendApiResponse
}

export class WhatsAppApiError extends Error {
  readonly statusCode: number
  readonly providerCode?: string
  readonly providerType?: string
  readonly details?: string

  constructor(input: {
    statusCode: number
    message: string
    providerCode?: string
    providerType?: string
    details?: string
  }) {
    super(input.message)
    this.name = 'WhatsAppApiError'
    this.statusCode = input.statusCode
    this.providerCode = input.providerCode
    this.providerType = input.providerType
    this.details = input.details
  }
}

export async function sendWhatsAppTextMessage(
  input: WhatsAppTextMessageInput
): Promise<WhatsAppSendResult> {
  const config = readWhatsAppConfig()
  const endpoint = `${config.graphBaseUrl}/${config.apiVersion}/${config.phoneNumberId}/messages`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20_000)

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: input.to,
    type: 'text',
    text: {
      preview_url: false,
      body: input.message,
    },
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })

    const data = (await response.json().catch(() => ({}))) as MetaSendApiResponse

    if (!response.ok) {
      const providerError = data?.error
      throw new WhatsAppApiError({
        statusCode: response.status,
        message:
          String(providerError?.message || '').trim() || 'WhatsApp Cloud API returned an error',
        providerCode: providerError?.code ? String(providerError.code) : undefined,
        providerType: providerError?.type,
        details: providerError?.fbtrace_id,
      })
    }

    return {
      messageId: String(data?.messages?.[0]?.id || '').trim() || undefined,
      status: String(data?.messages?.[0]?.message_status || '').trim() || undefined,
      raw: data,
    }
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new WhatsAppApiError({
        statusCode: 504,
        message: 'WhatsApp Cloud API request timed out',
      })
    }

    if (error instanceof WhatsAppApiError) throw error

    throw new WhatsAppApiError({
      statusCode: 500,
      message: error?.message || 'Unexpected WhatsApp Cloud API error',
    })
  } finally {
    clearTimeout(timeout)
  }
}

