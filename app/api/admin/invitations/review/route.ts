import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

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
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 50)
    const limit = Math.max(1, Math.min(200, limitRaw))

    let snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
    try {
      snap = await adminDb
        .collection('invites')
        .where('workflowStatus', '==', INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW)
        .orderBy('workshopEnteredAt', 'desc')
        .limit(limit)
        .get()
    } catch {
      // Fallback when composite index is not yet created on the environment.
      snap = await adminDb
        .collection('invites')
        .where('workflowStatus', '==', INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW)
        .limit(limit)
        .get()
    }

    const invitesRaw = await Promise.all(
      snap.docs.map(async (doc) => {
        const row = doc.data() as any
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
    const invites = invitesRaw.sort((a, b) => {
      const at = a.workshopEnteredAt ? Date.parse(a.workshopEnteredAt) : 0
      const bt = b.workshopEnteredAt ? Date.parse(b.workshopEnteredAt) : 0
      return bt - at
    })

    return NextResponse.json({ ok: true, invites })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load review queue' }, { status })
  }
}

