import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature || !webhookSecret) {
    return NextResponse.json(
      { error: 'Missing signature or webhook secret' },
      { status: 400 }
    )
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err?.message)
    return NextResponse.json(
      { error: `Webhook Error: ${err?.message}` },
      { status: 400 }
    )
  }

  // Handle events
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    try {
      const paymentData = {
        userId: session.metadata?.userId || '',
        inviteId: session.metadata?.inviteId || '',
        packageId: session.metadata?.packageId || '',
        amount: (session.amount_total || 0) / 100,
        currency: session.currency || 'sar',
        provider: 'stripe',
        providerSessionId: session.id,
        status: 'paid',
        createdAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'payments', session.id), paymentData, { merge: true })
    } catch (error) {
      console.error('Error processing payment:', error)
      return NextResponse.json({ error: 'Error processing payment' }, { status: 500 })
    }
  }

  return NextResponse.json({ received: true })
}
