import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { markInvitationPaidFromMoyasar } from '@/lib/moyasar/mark-invite-paid'
import { resolveInvitationIdFromPayment } from '@/lib/moyasar/resolve-invitation'
import { getAppBaseUrl, isMoyasarWebhookConfigured } from '@/lib/moyasar/server'
import { enterPaidInviteWorkshop } from '@/lib/workshop/enter-paid-invite'
import type { MoyasarPayment, MoyasarWebhookEvent } from '@/lib/moyasar/types'
import { isMoyasarWebhookAuthentic } from '@/lib/moyasar/verify-webhook'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Allows Moyasar / monitoring to confirm the route exists (webhook deliveries use POST). */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      endpoint: '/api/webhooks/moyasar',
      methods: ['POST', 'GET'],
      webhookConfigured: isMoyasarWebhookConfigured(),
    },
    { status: 200 }
  )
}

function extractPaidPayment(payload: Record<string, unknown>): {
  payment: MoyasarPayment | null
  eventType: string
} {
  const wrapped = payload as unknown as MoyasarWebhookEvent
  if (wrapped?.data?.id && wrapped?.data?.status) {
    return { payment: wrapped.data, eventType: String(wrapped.type || '') }
  }

  const payments = Array.isArray(payload?.payments) ? (payload.payments as MoyasarPayment[]) : []
  const latestPaid = [...payments].reverse().find((row) => String(row?.status || '').toLowerCase() === 'paid')
  if (latestPaid?.id) {
    return { payment: latestPaid, eventType: 'invoice_paid' }
  }

  if (String(payload?.status || '').toLowerCase() === 'paid' && payload?.id) {
    const asPayment = payload as unknown as MoyasarPayment
    if (asPayment.id) {
      return { payment: asPayment, eventType: 'invoice_paid' }
    }
  }

  return { payment: null, eventType: '' }
}

export async function POST(req: NextRequest) {
  if (!isMoyasarWebhookConfigured()) {
    return NextResponse.json({ error: 'Moyasar webhook is not configured' }, { status: 503 })
  }

  const rawBody = await req.text()
  const signatureHeader = req.headers.get('x-moyasar-signature')

  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const { payment, eventType: rawEventType } = extractPaidPayment(payload)

  console.info('[MOYASAR_WEBHOOK_RECEIVED]', {
    eventId: payload?.id,
    eventType: rawEventType || payload?.type,
    paymentId: payment?.id,
    paymentStatus: payment?.status,
  })

  if (!isMoyasarWebhookAuthentic(rawBody, signatureHeader, payload as unknown as MoyasarWebhookEvent)) {
    console.error('[MOYASAR_WEBHOOK_RECEIVED] verification failed')
    return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 })
  }

  const paymentStatus = String(payment?.status || '').toLowerCase()
  const eventType = String(rawEventType || payload?.type || '').toLowerCase()

  const isPaidEvent =
    paymentStatus === 'paid' || eventType === 'payment_paid' || eventType === 'invoice_paid'

  if (!isPaidEvent || !payment?.id) {
    return NextResponse.json({ received: true, ignored: true }, { status: 200 })
  }

  const adminDb = getAdminFirestore()
  if (!adminDb) {
    return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
  }

  const invitationId = await resolveInvitationIdFromPayment(adminDb, payment)
  if (!invitationId) {
    console.warn('[MOYASAR_WEBHOOK_RECEIVED] missing invitationId — ack 200 to avoid retry storm', {
      paymentId: payment.id,
    })
    return NextResponse.json(
      { received: true, ignored: true, reason: 'missing_invitation_id' },
      { status: 200 }
    )
  }

  try {
    const result = await markInvitationPaidFromMoyasar(adminDb, invitationId, payment)

    let workshopResult: Awaited<ReturnType<typeof enterPaidInviteWorkshop>> | null = null
    try {
      workshopResult = await enterPaidInviteWorkshop(adminDb, invitationId, {
        origin: getAppBaseUrl(req.nextUrl.origin),
      })
    } catch (workshopError: unknown) {
      const workshopMessage =
        workshopError instanceof Error ? workshopError.message : 'workshop_enter_failed'
      console.error('[MOYASAR_WORKSHOP_ENTER]', { invitationId, error: workshopMessage })
    }

    console.info('[MOYASAR_PAYMENT_PAID]', {
      invitationId,
      paymentId: payment.id,
      alreadyPaid: result.alreadyPaid,
      workshopEntered: workshopResult?.entered ?? false,
      emailDelivered: workshopResult?.emailDelivered ?? false,
    })
    return NextResponse.json(
      {
        received: true,
        invitationId,
        alreadyPaid: result.alreadyPaid,
        workshopEntered: workshopResult?.entered ?? false,
      },
      { status: 200 }
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Webhook handler failed'
    console.error('[MOYASAR_WEBHOOK_RECEIVED] handler error', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
