import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import type Stripe from 'stripe'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { getStripeServerClient, isStripeWebhookConfigured } from '@/lib/stripe/server'

// Disable body parsing - we need raw body for signature verification
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  if (!isStripeWebhookConfigured()) {
    return NextResponse.json({ error: 'Stripe webhook is not configured' }, { status: 503 })
  }
  const stripe = getStripeServerClient()
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe client not available' }, { status: 503 })
  }

  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json(
      { error: 'Missing stripe signature' },
      { status: 400 }
    )
  }

  // Get raw body as text (bodyParser is disabled)
  const body = await req.text()

  let event: Stripe.Event

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json(
      { error: 'Webhook Error' },
      { status: 400 }
    )
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const metadata = session.metadata || {}
      const adminDb = getAdminFirestore()

      if (adminDb && metadata?.kind === 'gift_package' && metadata?.giftId) {
        const giftRef = adminDb.collection('gift_codes').doc(String(metadata.giftId))
        await giftRef.set(
          {
            paymentStatus: 'paid',
            status: 'active',
            paidAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
            stripeCheckoutSessionId: session.id,
            stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
          },
          { merge: true }
        )
      }
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    console.error('Webhook handler failed:', err)
    return NextResponse.json(
      { error: 'Error processing payment' },
      { status: 500 }
    )
  }
}
