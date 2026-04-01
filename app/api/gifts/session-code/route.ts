import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { getStripeServerClient, isStripeConfigured } from '@/lib/stripe/server'

export const runtime = 'nodejs'

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
    const sessionId = String(body?.sessionId || '')
    if (!sessionId) {
      return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const metadata = session.metadata || {}
    if (metadata?.kind !== 'gift_package') {
      return NextResponse.json({ error: 'Invalid gift session' }, { status: 400 })
    }
    if (metadata?.createdByUid !== decoded.uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const giftId = String(metadata?.giftId || '')
    if (!giftId) {
      return NextResponse.json({ error: 'Gift not found' }, { status: 404 })
    }

    const giftSnap = await adminDb.collection('gift_codes').doc(giftId).get()
    if (!giftSnap.exists) {
      return NextResponse.json({ error: 'Gift not found' }, { status: 404 })
    }

    const giftData = giftSnap.data() as any
    const paymentReady = giftData?.paymentStatus === 'paid' && giftData?.status === 'active'
    if (!paymentReady) {
      return NextResponse.json({ ready: false, message: 'بانتظار تأكيد الدفع...' })
    }

    return NextResponse.json({
      ready: true,
      code: String(metadata?.giftCode || ''),
      packageSize: Number(giftData?.packageSize || metadata?.packageSize || 0),
      packagePrice: Number(giftData?.packagePrice || metadata?.packagePrice || 0),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'تعذر تحميل كود الهدية حالياً' },
      { status: 500 }
    )
  }
}

