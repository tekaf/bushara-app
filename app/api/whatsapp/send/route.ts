import { NextRequest, NextResponse } from 'next/server'
import {
  readWhatsAppConfig,
  validateWhatsAppSendConfig,
} from '@/lib/whatsapp/config'
import {
  sendWhatsAppTextMessage,
  WhatsAppApiError,
} from '@/lib/whatsapp/cloud-api'

export const runtime = 'nodejs'

type SendBody = {
  to?: string
  message?: string
}

function maskPhone(input: string): string {
  const value = String(input || '').trim()
  if (!value) return ''
  if (value.length <= 4) return '*'.repeat(value.length)
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`
}

function validateSendBody(body: SendBody): string | null {
  const to = String(body?.to || '').trim()
  const message = String(body?.message || '').trim()

  if (!to) return 'Field "to" is required.'
  if (!message) return 'Field "message" is required.'
  if (to.length > 32) return 'Field "to" is too long.'
  if (message.length > 4096) return 'Field "message" is too long.'
  return null
}

export async function POST(request: NextRequest) {
  const config = readWhatsAppConfig()
  const missingConfig = validateWhatsAppSendConfig(config)

  if (missingConfig.length) {
    console.error('[WHATSAPP][SEND] missing config', { missing: missingConfig })
    return NextResponse.json(
      {
        ok: false,
        error: `Missing required WhatsApp env vars: ${missingConfig.join(', ')}`,
      },
      { status: 500 }
    )
  }

  const body = (await request.json().catch(() => ({}))) as SendBody
  const validationError = validateSendBody(body)
  if (validationError) {
    return NextResponse.json({ ok: false, error: validationError }, { status: 400 })
  }

  const to = String(body.to || '').trim()
  const message = String(body.message || '').trim()
  const maskedTo = maskPhone(to)

  try {
    const result = await sendWhatsAppTextMessage({ to, message })

    console.info('[WHATSAPP][SEND] success', {
      to: maskedTo,
      messageId: result.messageId || null,
      status: result.status || null,
    })

    return NextResponse.json({
      ok: true,
      messageId: result.messageId || null,
      status: result.status || 'accepted',
    })
  } catch (error: unknown) {
    if (error instanceof WhatsAppApiError) {
      console.error('[WHATSAPP][SEND] provider error', {
        to: maskedTo,
        statusCode: error.statusCode,
        providerCode: error.providerCode || null,
        providerType: error.providerType || null,
        details: error.details || null,
        message: error.message,
      })

      return NextResponse.json(
        {
          ok: false,
          error: error.message,
          providerCode: error.providerCode || null,
        },
        { status: error.statusCode >= 400 ? error.statusCode : 500 }
      )
    }

    console.error('[WHATSAPP][SEND] unexpected error', {
      to: maskedTo,
      error: error instanceof Error ? error.message : String(error),
    })

    return NextResponse.json(
      {
        ok: false,
        error: 'Unexpected error while sending WhatsApp message.',
      },
      { status: 500 }
    )
  }
}

