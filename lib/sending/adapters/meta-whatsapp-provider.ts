import type {
  WhatsAppProviderMessageStatus,
  WhatsAppProviderNormalizedError,
  WhatsAppProviderSendResult,
  WhatsAppProviderService,
  WhatsAppSendContext,
  WhatsAppSendPayload,
} from '@/lib/sending/provider-service'

type MetaProviderConfig = {
  accessToken: string
  phoneNumberId: string
  apiVersion?: string
  graphBaseUrl?: string
  requestTimeoutMs?: number
}

type MetaApiError = {
  message?: string
  type?: string
  code?: number | string
  error_subcode?: number | string
  error_data?: {
    details?: string
  }
}

type MetaSendResponse = {
  messaging_product?: string
  contacts?: Array<{ input?: string; wa_id?: string }>
  messages?: Array<{ id?: string; message_status?: string }>
}

const META_PROVIDER_NAME = 'meta-whatsapp-cloud'
const DEFAULT_API_VERSION = 'v20.0'
const DEFAULT_GRAPH_BASE = 'https://graph.facebook.com'
const DEFAULT_TIMEOUT_MS = 20_000

const THROTTLED_CODES = new Set(['4', '17', '32', '613', '80007', '130429', '131056'])
const PERMANENT_CODES = new Set(['10', '100', '190', '131026', '131047', '131051'])
const TRANSIENT_CODES = new Set(['1', '2', '131000', '131016', '131021'])

function mapMetaMessageStatus(status: string | undefined): WhatsAppProviderMessageStatus {
  const value = String(status || '').toLowerCase()
  if (!value) return 'accepted'
  if (value === 'accepted') return 'accepted'
  if (value === 'queued') return 'queued'
  if (value === 'sent') return 'sent'
  if (value === 'delivered') return 'delivered'
  if (value === 'failed' || value === 'undeliverable') return 'failed'
  return 'unknown'
}

function classifyMetaError(
  httpStatus: number | undefined,
  err: MetaApiError | undefined
): WhatsAppProviderNormalizedError {
  const code = String(err?.code ?? '')
  const subcode = String(err?.error_subcode ?? '')
  const details = String(err?.error_data?.details || '').trim()
  const message = String(err?.message || '').trim() || 'Meta provider error'
  const codeForCheck = subcode || code

  if (THROTTLED_CODES.has(codeForCheck) || httpStatus === 429) {
    return {
      kind: 'throttled',
      code: codeForCheck || undefined,
      message: details || message,
      retryAfterMs: 30_000,
      rawError: err,
    }
  }

  if (PERMANENT_CODES.has(codeForCheck) || (httpStatus !== undefined && httpStatus >= 400 && httpStatus < 500)) {
    return {
      kind: 'permanent',
      code: codeForCheck || undefined,
      message: details || message,
      rawError: err,
    }
  }

  if (
    TRANSIENT_CODES.has(codeForCheck) ||
    (httpStatus !== undefined && httpStatus >= 500)
  ) {
    return {
      kind: 'transient',
      code: codeForCheck || undefined,
      message: details || message,
      rawError: err,
    }
  }

  return {
    kind: 'unknown',
    code: codeForCheck || undefined,
    message: details || message,
    rawError: err,
  }
}

class MetaProviderSendError extends Error {
  normalized: WhatsAppProviderNormalizedError

  constructor(normalized: WhatsAppProviderNormalizedError) {
    super(normalized.message)
    this.normalized = normalized
    this.name = 'MetaProviderSendError'
  }
}

export class MetaWhatsAppProviderService implements WhatsAppProviderService {
  readonly providerName = META_PROVIDER_NAME
  private readonly accessToken: string
  private readonly phoneNumberId: string
  private readonly apiVersion: string
  private readonly graphBaseUrl: string
  private readonly requestTimeoutMs: number

  constructor(config: MetaProviderConfig) {
    this.accessToken = String(config.accessToken || '').trim()
    this.phoneNumberId = String(config.phoneNumberId || '').trim()
    this.apiVersion = String(config.apiVersion || DEFAULT_API_VERSION).trim()
    this.graphBaseUrl = String(config.graphBaseUrl || DEFAULT_GRAPH_BASE).trim()
    this.requestTimeoutMs = Math.max(5_000, Number(config.requestTimeoutMs || DEFAULT_TIMEOUT_MS))

    if (!this.accessToken) throw new Error('Meta provider requires accessToken')
    if (!this.phoneNumberId) throw new Error('Meta provider requires phoneNumberId')
  }

  normalizeError(error: unknown): WhatsAppProviderNormalizedError {
    if (error instanceof MetaProviderSendError) return error.normalized
    if (error instanceof Error) {
      return {
        kind: 'unknown',
        message: error.message || 'Unknown provider error',
        rawError: error,
      }
    }
    return {
      kind: 'unknown',
      message: 'Unknown provider error',
      rawError: error,
    }
  }

  async sendMessage(
    payload: WhatsAppSendPayload,
    context: WhatsAppSendContext
  ): Promise<WhatsAppProviderSendResult> {
    const to = String(payload.to || '').trim()
    const body = String(payload.body || '').trim()
    const mediaUrl = String(payload.mediaUrl || '').trim()
    const templateName = String(payload.template?.name || '').trim()
    const templateLanguageCode = String(payload.template?.languageCode || 'ar').trim() || 'ar'
    const templateHeaderImageUrl = String(payload.template?.headerImageUrl || '').trim()
    const templateBodyVariables = Array.isArray(payload.template?.bodyVariables)
      ? payload.template?.bodyVariables.map((item) => String(item || ''))
      : []
    const templateButtonDynamicValue = String(payload.template?.buttonDynamicValue || '').trim()
    if (!to) throw new Error('Meta provider requires recipient phone')
    if (!templateName && !body && !mediaUrl) throw new Error('Meta provider requires template or body/media payload')

    const endpoint = `${this.graphBaseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs)

    const requestBody: Record<string, unknown> = templateName
      ? {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: templateLanguageCode,
            },
            components: [
              ...(templateHeaderImageUrl
                ? [
                    {
                      type: 'header',
                      parameters: [
                        {
                          type: 'image',
                          image: {
                            link: templateHeaderImageUrl,
                          },
                        },
                      ],
                    },
                  ]
                : []),
              ...(templateBodyVariables.length > 0
                ? [
                    {
                      type: 'body',
                      parameters: templateBodyVariables.map((value) => ({
                        type: 'text',
                        text: value,
                      })),
                    },
                  ]
                : []),
              ...(templateButtonDynamicValue
                ? [
                    {
                      type: 'button',
                      sub_type: 'url',
                      index: '0',
                      parameters: [
                        {
                          type: 'text',
                          text: templateButtonDynamicValue,
                        },
                      ],
                    },
                  ]
                : []),
            ],
          },
        }
      : {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          ...(mediaUrl
            ? {
                type: 'image',
                image: {
                  link: mediaUrl,
                  ...(body ? { caption: body } : {}),
                },
              }
            : {
                type: 'text',
                text: {
                  preview_url: false,
                  body,
                },
              }),
        }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': context.idempotencyKey,
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      })

      const data = (await response.json().catch(() => ({}))) as
        | MetaSendResponse
        | { error?: MetaApiError; [key: string]: unknown }

      if (!response.ok) {
        const normalized = classifyMetaError(
          response.status,
          (data as { error?: MetaApiError }).error
        )
        throw new MetaProviderSendError(normalized)
      }

      const sendData = data as MetaSendResponse
      const providerMessageId = String(sendData?.messages?.[0]?.id || '').trim()
      const providerStatus = mapMetaMessageStatus(sendData?.messages?.[0]?.message_status)

      return {
        accepted: Boolean(providerMessageId),
        providerMessageId: providerMessageId || undefined,
        providerStatus,
        rawResponse: sendData as Record<string, unknown>,
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new MetaProviderSendError({
          kind: 'transient',
          message: 'Meta provider request timeout',
          rawError: error,
        })
      }
      if (error instanceof MetaProviderSendError) throw error
      throw new MetaProviderSendError(this.normalizeError(error))
    } finally {
      clearTimeout(timeout)
    }
  }
}

