import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const runtime = 'nodejs'

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  if (!app || !adminDb) throw new Error('Admin SDK not configured')

  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  const email = decoded.email || (await auth.getUser(decoded.uid)).email || ''
  if (!isAdminEmailServer(email)) throw new Error('Unauthorized')
  return { adminDb }
}

function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()?.toISOString?.() || null
  const d = new Date(value)
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

export async function GET(request: NextRequest) {
  try {
    const { adminDb } = await verifyAdmin(request)
    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 40)
    const limit = Math.max(1, Math.min(100, limitRaw))

    let snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
    try {
      snap = await adminDb.collection('invites').orderBy('updatedAt', 'desc').limit(limit).get()
    } catch {
      snap = await adminDb.collection('invites').limit(limit).get()
    }

    const invites = snap.docs
      .map((doc) => {
        const row = doc.data() as any
        return {
          id: doc.id,
          title: String(row?.title || ''),
          workflowStatus: String(row?.workflowStatus || row?.status || ''),
          paymentStatus: String(row?.paymentStatus || ''),
          ownerId: String(row?.ownerId || ''),
          updatedAt: toIso(row?.updatedAt) || toIso(row?.createdAt),
        }
      })
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())

    return NextResponse.json({ ok: true, invites })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load invitations' }, { status })
  }
}

