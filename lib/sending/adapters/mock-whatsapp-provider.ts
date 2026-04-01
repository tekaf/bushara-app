import type {
  WhatsAppProviderNormalizedError,
  WhatsAppProviderSendResult,
  WhatsAppProviderService,
  WhatsAppSendContext,
  WhatsAppSendPayload,
} from '@/lib/sending/provider-service'

type MockProviderError = {
  kind: 'transient' | 'permanent' | 'throttled' | 'unknown'
  code: string
  message: string
}

const MOCK_PROVIDER_NAME = 'mock-whatsapp-provider'

function buildError(error: MockProviderError): Error & { mockProviderError: MockProviderError } {
  const e = new Error(error.message) as Error & { mockProviderError: MockProviderError }
  e.mockProviderError = error
  return e
}

/**
 * Deterministic test adapter:
 * - ...0001 => accepted
 * - ...0002 => permanent error
 * - ...0003 => transient on attempts 1-2, accepted on attempt 3
 * - ...0004 => throttled on attempts 1-2, accepted on attempt 3
 * - other numbers => accepted
 */
export class MockWhatsAppProviderService implements WhatsAppProviderService {
  readonly providerName = MOCK_PROVIDER_NAME

  normalizeError(error: unknown): WhatsAppProviderNormalizedError {
    const mock = (error as any)?.mockProviderError as MockProviderError | undefined
    if (mock) {
      return {
        kind: mock.kind,
        code: mock.code,
        message: mock.message,
        rawError: error,
      }
    }
    if (error instanceof Error) {
      return {
        kind: 'unknown',
        message: error.message || 'Unknown mock provider error',
        rawError: error,
      }
    }
    return {
      kind: 'unknown',
      message: 'Unknown mock provider error',
      rawError: error,
    }
  }

  async sendMessage(
    payload: WhatsAppSendPayload,
    context: WhatsAppSendContext
  ): Promise<WhatsAppProviderSendResult> {
    const to = String(payload.to || '').trim()
    if (!to) throw buildError({ kind: 'permanent', code: 'MISSING_TO', message: 'Missing recipient number.' })

    if (to.endsWith('0002')) {
      throw buildError({
        kind: 'permanent',
        code: 'INVALID_RECIPIENT',
        message: 'Recipient is invalid (mock permanent).',
      })
    }

    if (to.endsWith('0003') && context.attempt < 3) {
      throw buildError({
        kind: 'transient',
        code: 'MOCK_TRANSIENT',
        message: `Transient mock failure on attempt ${context.attempt}.`,
      })
    }

    if (to.endsWith('0004') && context.attempt < 3) {
      throw buildError({
        kind: 'throttled',
        code: 'MOCK_THROTTLED',
        message: `Throttled mock failure on attempt ${context.attempt}.`,
      })
    }

    return {
      accepted: true,
      providerMessageId: `mock-${to}-${context.attempt}`,
      providerStatus: 'accepted',
      rawResponse: {
        provider: MOCK_PROVIDER_NAME,
        to,
        attempt: context.attempt,
      },
    }
  }
}

