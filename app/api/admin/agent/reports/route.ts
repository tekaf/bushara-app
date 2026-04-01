import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const runtime = 'nodejs'

async function verifyUser(request: NextRequest): Promise<boolean> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return false
  const app = getAdminApp()
  if (!app) return false
  const decoded = await getAuth(app).verifyIdToken(token)
  return Boolean(decoded?.uid && isAdminEmailServer(decoded.email))
}

export async function GET(request: NextRequest) {
  try {
    const ok = await verifyUser(request)
    if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 10)
    const limit = Math.max(1, Math.min(30, limitRaw))

    const snap = await adminDb
      .collection('agent_reports')
      .orderBy('createdAt', 'desc')
      .limit(limit)
      .get()

    const reports = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
    return NextResponse.json({ ok: true, reports })
  } catch (error: any) {
    console.error('❌ [AGENT][REPORTS] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to load reports' },
      { status: 500 }
    )
  }
}
