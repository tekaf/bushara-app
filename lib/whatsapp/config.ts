export const DEFAULT_WHATSAPP_API_VERSION = 'v22.0'
export const DEFAULT_WHATSAPP_GRAPH_BASE_URL = 'https://graph.facebook.com'

export type WhatsAppConfig = {
  accessToken: string
  phoneNumberId: string
  businessAccountId?: string
  webhookVerifyToken?: string
  apiVersion: string
  graphBaseUrl: string
}

function readTrimmed(value: string | undefined): string {
  return String(value || '').trim()
}

export function readWhatsAppConfig(): WhatsAppConfig {
  const accessToken = readTrimmed(
    process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_META_ACCESS_TOKEN
  )
  const phoneNumberId = readTrimmed(
    process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_META_PHONE_NUMBER_ID
  )
  const businessAccountId = readTrimmed(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID) || undefined
  const webhookVerifyToken = readTrimmed(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN) || undefined
  const apiVersion = readTrimmed(
    process.env.WHATSAPP_API_VERSION || process.env.WHATSAPP_META_API_VERSION
  ) || DEFAULT_WHATSAPP_API_VERSION
  const graphBaseUrl =
    readTrimmed(process.env.WHATSAPP_META_GRAPH_BASE_URL) || DEFAULT_WHATSAPP_GRAPH_BASE_URL

  return {
    accessToken,
    phoneNumberId,
    businessAccountId,
    webhookVerifyToken,
    apiVersion,
    graphBaseUrl,
  }
}

export function validateWhatsAppSendConfig(config: WhatsAppConfig): string[] {
  const missing: string[] = []
  if (!config.accessToken) missing.push('WHATSAPP_ACCESS_TOKEN')
  if (!config.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID')
  return missing
}

