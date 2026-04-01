import { NextRequest, NextResponse } from 'next/server'
import { readWhatsAppConfig } from '@/lib/whatsapp/config'
import { extractIncomingWhatsAppMessages } from '@/lib/whatsapp/webhook'

export const runtime = 'nodejs'

function toSafeString(value: string | null): string {
  return String(value || '').trim()
}

function maskPhone(input: string): string {
  const value = String(input || '').trim()
  if (!value) return ''
  if (value.length <= 4) return '*'.repeat(value.length)
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`
}

export async function GET(request: NextRequest) {
  const mode = toSafeString(request.nextUrl.searchParams.get('hub.mode'))
  const token = toSafeString(request.nextUrl.searchParams.get('hub.verify_token'))
  const challenge = toSafeString(request.nextUrl.searchParams.get('hub.challenge'))
  const config = readWhatsAppConfig()

  if (mode !== 'subscribe') {
    return NextResponse.json({ ok: false, error: 'Invalid webhook mode.' }, { status: 400 })
  }

  if (!config.webhookVerifyToken) {
    console.error('[WHATSAPP][WEBHOOK] missing verify token env var')
    return NextResponse.json(
      { ok: false, error: 'Webhook verify token is not configured.' },
      { status: 500 }
    )
  }

  if (token !== config.webhookVerifyToken) {
    console.warn('[WHATSAPP][WEBHOOK] verification failed due to invalid token')
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  }

  return new NextResponse(challenge || '', {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
  })
}

export async function POST(request: NextRequest) {
  let payload: unknown = {}

  try {
    payload = await request.json()
  } catch (error: unknown) {
    console.warn('[WHATSAPP][WEBHOOK] invalid JSON payload', {
      error: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ ok: true, received: true, processedCount: 0 }, { status: 200 })
  }

  try {
    const messages = extractIncomingWhatsAppMessages(payload)

    // Future extension point: persist these normalized messages into Firestore.
    for (const item of messages) {
      console.info('[WHATSAPP][WEBHOOK][MESSAGE]', {
        senderNumber: maskPhone(item.senderNumber),
        profileName: item.profileName || null,
        messageText: item.messageText,
        messageId: item.messageId || null,
        timestamp: item.timestamp || null,
      })
    }

    return NextResponse.json(
      {
        ok: true,
        received: true,
        processedCount: messages.length,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    console.error('[WHATSAPP][WEBHOOK] failed to process payload', {
      error: error instanceof Error ? error.message : String(error),
    })

    // Always ack webhook requests to avoid infinite provider retries on malformed payloads.
    return NextResponse.json({ ok: true, received: true, processedCount: 0 }, { status: 200 })
  }
}

