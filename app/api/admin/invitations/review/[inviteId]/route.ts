import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'
import { ensurePaidInviteWorkshopReady } from '@/lib/admin/ensure-workshop-ready'

export const runtime = 'nodejs'

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')

  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  const email = decoded.email || (await auth.getUser(decoded.uid)).email || ''
  if (!isAdminEmailServer(email)) throw new Error('Unauthorized')
  return decoded.uid
}

function buildAlenAssistant(invite: any) {
  const findings: string[] = []
  const suggestions: string[] = []
  const dateRaw = String(invite?.date || '')
  const preview = String(invite?.adminPreviewUrl || invite?.inviteImageUrl || invite?.finalUrl || invite?.previewUrl || '')
  const selectedOccasion = String(invite?.selectedOccasion || invite?.occasionType || '').trim().toLowerCase()
  const invitationType = String(invite?.invitationType || '').trim().toLowerCase()
  const isAnnouncementOnly = selectedOccasion === 'engagement' && invitationType === 'announcement'

  if (!String(invite?.groomName || '').trim()) findings.push('اسم صاحب المناسبة غير موجود')
  if (!String(invite?.brideName || '').trim()) findings.push('اسم صاحبة المناسبة غير موجود')
  if (!isAnnouncementOnly && !String(invite?.locationName || '').trim()) findings.push('الموقع غير محدد')
  if (!dateRaw) findings.push('تاريخ المناسبة غير محدد')

  if (dateRaw) {
    const date = new Date(`${dateRaw}T00:00:00`)
    if (!Number.isNaN(date.getTime()) && date.getTime() < Date.now() - 24 * 60 * 60 * 1000) {
      findings.push('تاريخ المناسبة في الماضي')
    }
  }
  if (!preview) findings.push('لا يوجد adminPreviewUrl للدعوة')

  if (!findings.length) suggestions.push('لا توجد ملاحظات حرجة، يمكن الاعتماد بعد المراجعة البصرية.')
  if (findings.some((f) => f.includes('غير موجود') || f.includes('غير محدد'))) {
    suggestions.push('تحقق من البيانات الأساسية قبل الاعتماد النهائي.')
  }

  return {
    status: findings.length ? 'needs_attention' : 'ok',
    findings,
    suggestions,
  }
}

export async function GET(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)

    const ready = await ensurePaidInviteWorkshopReady(adminDb, inviteId, {
      origin: request.nextUrl.origin,
      repairPreview: false,
    })
    const invite = ready.invite as any

    let reviewSnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
    try {
      reviewSnap = await adminDb
        .collection('invitation_reviews')
        .where('inviteId', '==', inviteId)
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()
    } catch {
      // Fallback for environments where the composite index is not created yet.
      reviewSnap = await adminDb
        .collection('invitation_reviews')
        .where('inviteId', '==', inviteId)
        .limit(20)
        .get()
    }
    const reviews = reviewSnap.docs.map((doc) => {
      const row = doc.data() as any
      return {
        id: doc.id,
        action: row?.action || '',
        notes: row?.notes || '',
        createdBy: row?.createdBy || '',
        actorRole: row?.actorRole || '',
        createdAt: row?.createdAt?.toDate?.()?.toISOString?.() || null,
      }
    })

    const ownerId = String(invite?.ownerId || '')
    let customer: any = null
    if (ownerId) {
      const userSnap = await adminDb.collection('users').doc(ownerId).get()
      if (userSnap.exists) {
        const row = userSnap.data() as any
        customer = {
          uid: ownerId,
          name: row?.name || '',
          email: row?.email || '',
          phone: row?.phone || row?.phoneNumber || '',
        }
      }
    }

    const adminPreviewUrl = String(
      ready.adminPreviewUrl ||
        invite?.previewUrl ||
        invite?.inviteImageUrl ||
        invite?.finalUrl ||
        ''
    ).trim()

    return NextResponse.json({
      ok: true,
      deployTag: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
      previewMode: process.env.VERCEL === '1' ? 'browser_upload' : 'server_render',
      invite: {
        id: inviteSnap.id,
        title: invite?.title || '',
        orderCode: invite?.orderCode || invite?.orderNumber || '',
        orderNumber: invite?.orderNumber || invite?.orderCode || '',
        selectedOccasion: invite?.selectedOccasion || invite?.occasionType || '',
        groomName: invite?.groomName || '',
        brideName: invite?.brideName || '',
        date: invite?.date || '',
        time: invite?.time || '',
        locationName: invite?.locationName || '',
        designId: invite?.designId || '',
        paymentStatus: invite?.paymentStatus || '',
        packageName:
          invite?.packageName ||
          invite?.selectedPackageName ||
          invite?.packageLabel ||
          invite?.selectedPackage ||
          '',
        paidAmount:
          invite?.paidAmount ||
          invite?.paymentAmount ||
          invite?.totalPrice ||
          invite?.price ||
          '',
        phone: invite?.phone || invite?.phoneNumber || '',
        workflowStatus: invite?.workflowStatus || '',
        dispatchMode: invite?.dispatchMode || 'manual',
        dispatchStatus: invite?.dispatchStatus || 'pending',
        reviewStatus: invite?.reviewStatus || '',
        adminPreviewUrl,
        workshopEnteredAt: invite?.workshopEnteredAt?.toDate?.()?.toISOString?.() || null,
      },
      customer,
      alen: buildAlenAssistant({ ...invite, adminPreviewUrl }),
      reviews,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load review details' }, { status })
  }
}

