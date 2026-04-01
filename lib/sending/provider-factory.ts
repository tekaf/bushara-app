import type { WhatsAppProviderService } from '@/lib/sending/provider-service'
import { MetaWhatsAppProviderService } from '@/lib/sending/adapters/meta-whatsapp-provider'
import { MockWhatsAppProviderService } from '@/lib/sending/adapters/mock-whatsapp-provider'

type ProviderFactoryOptions = {
  provider?: string
}

/**
 * PR-02 scope: construct provider adapter only.
 * No worker/dispatch wiring here.
 */
export function createWhatsAppProviderService(
  options: ProviderFactoryOptions = {}
): WhatsAppProviderService {
  const provider = String(options.provider || process.env.WHATSAPP_PROVIDER || 'meta')
    .trim()
    .toLowerCase()

  if (provider === 'meta' || provider === 'meta-whatsapp-cloud') {
    return new MetaWhatsAppProviderService({
      accessToken: process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_META_ACCESS_TOKEN || '',
      phoneNumberId:
        process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_META_PHONE_NUMBER_ID || '',
      apiVersion: process.env.WHATSAPP_API_VERSION || process.env.WHATSAPP_META_API_VERSION || 'v22.0',
      graphBaseUrl: process.env.WHATSAPP_META_GRAPH_BASE_URL || 'https://graph.facebook.com',
      requestTimeoutMs: Number(process.env.WHATSAPP_META_TIMEOUT_MS || 20_000),
    })
  }

  if (provider === 'mock' || provider === 'test-mock') {
    return new MockWhatsAppProviderService()
  }

  throw new Error(`Unsupported WhatsApp provider: ${provider}`)
}

