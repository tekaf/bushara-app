import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { normalizeAmountToHalalas } from '@/lib/moyasar/amount'
import {
  createMoyasarInvoice,
  getAppBaseUrl,
  getMoyasarInvitesCollection,
  isMoyasarPaymentEnabled,
} from '@/lib/moyasar/server'

export const runtime = 'nodejs'

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')

  const decoded = await getAuth(app).verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  return decoded.uid
}

export async function POST(request: NextRequest) {
  try {
    if (!isMoyasarPaymentEnabled()) {
      return NextResponse.json(
        {
          error:
            'بوابة Moyasar غير مفعّلة. تأكد من MOYASAR_SECRET_KEY و NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY.',
        },
        { status: 503 }
      )
    }

    const uid = await verifyUser(request)
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const body = await request.json().catch(() => ({}))
    const invitationId = String(body?.invitationId || body?.inviteId || '').trim()
    const amountRaw = Number(body?.amount)

    if (!invitationId) {
      return NextResponse.json({ error: 'invitationId مطلوب' }, { status: 400 })
    }
    if (!Number.isFinite(amountRaw) || amountRaw <= 0) {
      return NextResponse.json({ error: 'amount غير صالح' }, { status: 400 })
    }

    const invitesCollection = getMoyasarInvitesCollection()
    const inviteRef = adminDb.collection(invitesCollection).doc(invitationId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) {
      return NextResponse.json({ error: 'الدعوة غير موجودة' }, { status: 404 })
    }

    const invite = inviteSnap.data() as Record<string, unknown>
    if (String(invite?.ownerId || '') !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    if (invite?.paymentStatus === 'paid' || invite?.paid === true) {
      return NextResponse.json({ error: 'تم دفع هذه الدعوة مسبقاً' }, { status: 409 })
    }

    const packagePriceSar = Number(invite?.packagePrice || 0)
    const amountHalalas = normalizeAmountToHalalas(amountRaw, packagePriceSar)
    if (amountHalalas < 100) {
      return NextResponse.json({ error: 'المبلغ أقل من الحد الأدنى للدفع' }, { status: 400 })
    }

    const appBaseUrl = getAppBaseUrl(request.nextUrl.origin)
    const webhookUrl = `${appBaseUrl}/api/webhooks/moyasar`
    const callbackUrl = `${appBaseUrl}/payment/callback?invitationId=${encodeURIComponent(invitationId)}`

    console.info('[MOYASAR_CREATE_START]', {
      invitationId,
      amountRaw,
      amountHalalas,
      userId: uid,
      invitesCollection,
    })

    const invoice = await createMoyasarInvoice({
      amount: amountHalalas,
      currency: 'SAR',
      description: `دعوة بشارة - ${invitationId}`,
      callback_url: webhookUrl,
      success_url: callbackUrl,
      back_url: `${appBaseUrl}/checkout?payment=cancelled&invitationId=${encodeURIComponent(invitationId)}`,
      metadata: {
        invitationId,
        userId: uid,
      },
    })

    await inviteRef.set(
      {
        paymentStatus: 'pending',
        paymentProvider: 'moyasar',
        moyasarInvoiceId: invoice.id,
        moyasarPaymentUrl: invoice.url,
        paymentAmountHalalas: amountHalalas,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    console.info('[MOYASAR_CREATE_SUCCESS]', {
      invitationId,
      invoiceId: invoice.id,
      amountHalalas,
      payment_url: invoice.url,
    })

    return NextResponse.json({
      payment_url: invoice.url,
      invoiceId: invoice.id,
      invitationId,
      amountHalalas,
      currency: 'SAR',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'حدث خطأ أثناء إنشاء الدفع'
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (message === 'Admin SDK not configured') {
      return NextResponse.json({ error: message }, { status: 500 })
    }

    console.error('[MOYASAR_CREATE_ERROR]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
