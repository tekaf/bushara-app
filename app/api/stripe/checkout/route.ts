import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { PACKAGE_PRICE_MAP } from '@/lib/pricing/packages'
import { getStripeServerClient, isStripeConfigured } from '@/lib/stripe/server'

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')
  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')
  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  return decoded.uid
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

    const uid = await verifyUser(request)
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }
    const { packageId, userId, inviteId } = await request.json()
    const ownerId = String(userId || '').trim() || uid
    if (ownerId !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const userSnap = await adminDb.collection('users').doc(uid).get()
    const userData = userSnap.exists ? (userSnap.data() as any) : {}
    const phoneVerified = Boolean(userData?.phoneVerified)
    const phoneNumber = String(userData?.phoneNumber || '').trim()
    if (!phoneVerified || !phoneNumber) {
      return NextResponse.json(
        { error: 'يرجى تأكيد رقم الجوال قبل المتابعة للدفع' },
        { status: 409 }
      )
    }

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
      success_url: `${request.nextUrl.origin}/checkout?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${request.nextUrl.origin}/checkout?stripe=cancelled`,
      metadata: {
        kind: 'invite_checkout',
        userId: uid,
        packageId,
        inviteId: inviteId || '',
        phoneVerified: 'true',
        phoneNumber,
      },
    })

    return NextResponse.json({ sessionId: session.id })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    console.error('Stripe error:', error)
    return NextResponse.json(
      { error: error.message || 'حدث خطأ أثناء إنشاء جلسة الدفع' },
      { status: 500 }
    )
  }
}

