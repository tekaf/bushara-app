import { createWhatsAppProviderService } from '@/lib/sending/provider-factory'

type ApiHealthCheckItem = {
  key: string
  ok: boolean
  details: string
}

export type WhatsAppApiHealthCheckResult = {
  ok: boolean
  status: 'passed' | 'failed'
  reason: string
  checks: ApiHealthCheckItem[]
  checkedAtIso: string
}

function exists(value: string) {
  return Boolean(String(value || '').trim())
}

export function runWhatsAppApiHealthCheck(): WhatsAppApiHealthCheckResult {
  const checks: ApiHealthCheckItem[] = []
  const provider = String(process.env.WHATSAPP_PROVIDER || 'meta')
    .trim()
    .toLowerCase()

  checks.push({
    key: 'provider_configured',
    ok: exists(provider),
    details: provider || 'missing provider',
  })

  if (provider === 'meta' || provider === 'meta-whatsapp-cloud') {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN || process.env.WHATSAPP_META_ACCESS_TOKEN || ''
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.WHATSAPP_META_PHONE_NUMBER_ID || ''
    checks.push({
      key: 'meta_access_token',
      ok: exists(accessToken),
      details: exists(accessToken) ? 'configured' : 'missing',
    })
    checks.push({
      key: 'meta_phone_number_id',
      ok: exists(phoneNumberId),
      details: exists(phoneNumberId) ? 'configured' : 'missing',
    })
  }

  const templateName = String(process.env.WHATSAPP_TEMPLATE_NAME || 'bashara_invitation_v1').trim()
  checks.push({
    key: 'template_name',
    ok: exists(templateName),
    details: templateName || 'missing',
  })

  let adapterReady = false
  let adapterError = ''
  try {
    createWhatsAppProviderService({ provider })
    adapterReady = true
  } catch (error: any) {
    adapterReady = false
    adapterError = error?.message || 'adapter init failed'
  }
  checks.push({
    key: 'provider_adapter_ready',
    ok: adapterReady,
    details: adapterReady ? 'ready' : adapterError,
  })

  const failed = checks.filter((item) => !item.ok)
  const reason = failed.length ? failed.map((item) => `${item.key}: ${item.details}`).join(' | ') : ''
  return {
    ok: failed.length === 0,
    status: failed.length === 0 ? 'passed' : 'failed',
    reason,
    checks,
    checkedAtIso: new Date().toISOString(),
  }
}
