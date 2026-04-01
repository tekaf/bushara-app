import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { createHash, randomBytes } from 'crypto'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { getPackageTierBySize } from '@/lib/pricing/packages'
import { getStripeServerClient, isStripeConfigured } from '@/lib/stripe/server'

export const runtime = 'nodejs'

function hashCode(rawCode: string): string {
  return createHash('sha256').update(rawCode).digest('hex')
}

function generateGiftCode(length = 24): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i += 1) {
    code += alphabet[bytes[i] % alphabet.length]
  }
  return code
}

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

    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const app = getAdminApp()
    const adminDb = getAdminFirestore()
    if (!app || !adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const packageSize = String(body?.packageSize || '')
    const packageTier = getPackageTierBySize(packageSize)
    if (!packageTier) {
      return NextResponse.json({ error: 'الباقة غير موجودة' }, { status: 400 })
    }

    const giftCode = generateGiftCode(24)
    const codeHash = hashCode(giftCode)
    const now = new Date()

    const giftRef = adminDb.collection('gift_codes').doc()
    await giftRef.set({
      codeHash,
      codeLast4: giftCode.slice(-4),
      packageSize: packageTier.guests,
      packagePrice: packageTier.paidPrice,
      createdByUid: decoded.uid,
      paymentStatus: 'pending',
      createdAt: now,
      redeemedAt: null,
      redeemedByUid: null,
      status: 'disabled',
      expiresAt: null,
    })

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'sar',
            product_data: {
              name: `هدية بشارة - باقة ${packageTier.guests} ضيف`,
            },
            unit_amount: packageTier.paidPrice * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${request.nextUrl.origin}/packages?giftSuccess=1&giftSessionId={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.nextUrl.origin}/packages?giftCancelled=1`,
      metadata: {
        kind: 'gift_package',
        giftId: giftRef.id,
        giftCode,
        packageSize: String(packageTier.guests),
        packagePrice: String(packageTier.paidPrice),
        createdByUid: decoded.uid,
      },
    })

    await giftRef.set(
      {
        checkoutSessionId: session.id,
        checkoutUrl: session.url || null,
        stripePaymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null,
        updatedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({
      checkoutUrl: session.url,
      sessionId: session.id,
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'حدث خطأ أثناء بدء دفع الهدية' },
      { status: 500 }
    )
  }
}

