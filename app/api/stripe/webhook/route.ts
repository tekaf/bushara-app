import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { doc, setDoc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20.acacia',
})

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
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json(
      { error: `Webhook Error: ${err.message}` },
      { status: 400 }
    )
  }

  // Handle the event
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session

    try {
      // Create payment record
      const paymentData = {
        userId: session.metadata?.userId || '',
        inviteId: session.metadata?.inviteId || '',
        packageId: session.metadata?.packageId || '',
        amount: (session.amount_total || 0) / 100,
        currency: session.currency || 'sar',
        provider: 'stripe' as const,
        providerSessionId: session.id,
        status: 'paid' as const,
        createdAt: new Date(),
      }

      await setDoc(doc(db, 'payments', session.id), paymentData)

      // Update user's package if needed
      if (session.metadata?.userId) {
        // You can add logic here to update user's active package
      }
    } catch (error) {
      console.error('Error processing payment:', error)
      return NextResponse.json(
        { error: 'Error processing payment' },
        { status: 500 }
      )
    }
  }

  return NextResponse.json({ received: true })
}

