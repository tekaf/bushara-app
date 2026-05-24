import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

export const runtime = 'nodejs'
const ADMIN_SDK_USER_ERROR =
  'تعذر تحميل قائمة المراجعة بسبب مشكلة في إعدادات الخادم. يرجى التحقق من إعدادات Firebase Admin.'

const VISIBLE_WORKSHOP_STATUSES = [
  INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
  INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
  INVITE_WORKFLOW_STATUS.APPROVED,
  INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SENT,
] as const

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  if (!app) throw new Error('ADMIN_SDK_NOT_CONFIGURED')

  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  const email = decoded.email || (await auth.getUser(decoded.uid)).email || ''
  if (!isAdminEmailServer(email)) throw new Error('Unauthorized')
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      console.error('[ADMIN_REVIEW_QUEUE] firestore unavailable: admin sdk not configured')
      return NextResponse.json({ error: ADMIN_SDK_USER_ERROR }, { status: 500 })
    }

    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 50)
    const limit = Math.max(1, Math.min(200, limitRaw))
    const query = String(request.nextUrl.searchParams.get('q') || '').trim().toLowerCase()

    let snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
    try {
      snap = await adminDb
        .collection('invites')
        .where('workflowStatus', 'in', [...VISIBLE_WORKSHOP_STATUSES])
        .orderBy('workshopEnteredAt', 'desc')
        .limit(limit)
        .get()
    } catch {
      // Fallback when composite index is not yet created on the environment.
      try {
        snap = await adminDb
          .collection('invites')
          .where('workflowStatus', 'in', [...VISIBLE_WORKSHOP_STATUSES])
          .limit(limit)
          .get()
      } catch {
        // Final fallback without "in" constraints: filter in memory.
        snap = await adminDb.collection('invites').orderBy('updatedAt', 'desc').limit(300).get()
      }
    }

    const invitesRaw = await Promise.all(
      snap.docs.map(async (doc) => {
        const row = doc.data() as any
        if (!VISIBLE_WORKSHOP_STATUSES.includes(String(row?.workflowStatus || '') as any)) return null
        const internalSnap = await adminDb.collection('invitation_internal').doc(doc.id).get()
        const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
        const ownerId = String(row?.ownerId || '')
        let ownerName = ''
        if (ownerId) {
          const userSnap = await adminDb.collection('users').doc(ownerId).get()
          if (userSnap.exists) {
            const user = userSnap.data() as any
            ownerName = String(user?.name || '').trim()
          }
        }

        // Prefer internal admin preview, then fall back to legacy preview fields.
        const adminPreviewUrl = String(
          internal?.adminPreviewUrl || row?.previewUrl || row?.inviteImageUrl || row?.finalUrl || ''
        ).trim()

        return {
          id: doc.id,
          orderCode: String(row?.orderCode || row?.orderNumber || '').trim(),
          ownerName,
          ownerId,
          workflowStatus: row?.workflowStatus || '',
          reviewStatus: row?.reviewStatus || '',
          adminPreviewUrl,
          workshopEnteredAt: row?.workshopEnteredAt?.toDate?.()?.toISOString?.() || null,
        }
      })
    )

    // Keep newest first even when fallback query path is used without orderBy.
    const invites = invitesRaw
      .filter(Boolean)
      .filter((row: any) => {
        if (!query) return true
        const id = String(row?.id || '').toLowerCase()
        const orderCode = String(row?.orderCode || '').toLowerCase()
        return id.includes(query) || orderCode.includes(query)
      })
      .sort((a: any, b: any) => {
        const at = a.workshopEnteredAt ? Date.parse(a.workshopEnteredAt) : 0
        const bt = b.workshopEnteredAt ? Date.parse(b.workshopEnteredAt) : 0
        return bt - at
      })
      .slice(0, limit)

    return NextResponse.json({ ok: true, invites })
  } catch (error: any) {
    if (error?.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (error?.message === 'ADMIN_SDK_NOT_CONFIGURED') {
      console.error('[ADMIN_REVIEW_QUEUE] admin sdk not configured at verifyAdmin')
      return NextResponse.json({ error: ADMIN_SDK_USER_ERROR }, { status: 500 })
    }
    console.error('[ADMIN_REVIEW_QUEUE] unexpected error')
    return NextResponse.json({ error: 'Failed to load review queue' }, { status: 500 })
  }
}

