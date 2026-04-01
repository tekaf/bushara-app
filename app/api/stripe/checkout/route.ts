import { NextRequest, NextResponse } from 'next/server'
import { PACKAGE_PRICE_MAP } from '@/lib/pricing/packages'
import { getStripeServerClient, isStripeConfigured } from '@/lib/stripe/server'


export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json(
        { error: 'الدفع الإلكتروني غير مفعّل حالياً. يرجى ضبط مفاتيح Stripe في بيئة الخادم.' },
        { status: 503 }
      )
    }
    const stripe = getStripeServerClient()
    if (!stripe) {
      return NextResponse.json(
        { error: 'تعذر تهيئة بوابة الدفع حالياً. حاول مرة أخرى لاحقاً.' },
        { status: 503 }
      )
    }

    const { packageId, userId, inviteId } = await request.json()

    const amount = (PACKAGE_PRICE_MAP[packageId] || 0) * 100

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

