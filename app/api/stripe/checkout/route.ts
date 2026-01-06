import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-06-20.acacia',
})

export async function POST(request: NextRequest) {
  try {
    const { packageId, userId, inviteId } = await request.json()

    // Package prices (in SAR - convert to halalas for Stripe)
    const packagePrices: Record<string, number> = {
      '50': 99 * 100,
      '100': 179 * 100,
      '150': 249 * 100,
      '200': 319 * 100,
      '250': 389 * 100,
      '300': 459 * 100,
      '350': 529 * 100,
      '400': 599 * 100,
      '450': 669 * 100,
    }

    const amount = packagePrices[packageId] || 0

    if (!amount) {
      return NextResponse.json(
        { error: 'الباقة غير موجودة' },
        { status: 400 }
      )
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'sar',
            product_data: {
              name: `باقة ${packageId} ضيف`,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${request.nextUrl.origin}/dashboard?payment=success`,
      cancel_url: `${request.nextUrl.origin}/packages?payment=cancelled`,
      metadata: {
        userId,
        packageId,
        inviteId: inviteId || '',
      },
    })

    return NextResponse.json({ sessionId: session.id })
  } catch (error: any) {
    console.error('Stripe error:', error)
    return NextResponse.json(
      { error: error.message || 'حدث خطأ أثناء إنشاء جلسة الدفع' },
      { status: 500 }
    )
  }
}

