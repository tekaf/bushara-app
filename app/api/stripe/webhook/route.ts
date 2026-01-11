import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

// Disable body parsing - we need raw body for signature verification
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  console.log('WEBHOOK HIT')
  console.log('has signature?', !!req.headers.get('stripe-signature'))

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
    console.log('event type:', event.type)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json(
      { error: 'Webhook Error' },
      { status: 400 }
    )
  }

  try {
    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      console.log('✅ Checkout completed:', session.id)
      // لا تسوي شي ثاني الآن
    }

    // Return 200 for successful webhook processing
    return NextResponse.json({ received: true }, { status: 200 })
  } catch (err) {
    console.error('Webhook handler failed:', err)
    return NextResponse.json(
      { error: 'Error processing payment' },
      { status: 500 }
    )
  }
}
