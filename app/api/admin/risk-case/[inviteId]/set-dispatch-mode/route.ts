import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { setDispatchModeWithHealthCheck } from '@/lib/dispatch/mode-control'

export const runtime = 'nodejs'

async function getAdminSession(request: NextRequest) {
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
  return { uid: decoded.uid, adminDb }
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const { uid, adminDb } = await getAdminSession(request)
    const inviteId = String(params?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })
    const body = await request.json().catch(() => ({}))
    const mode = String(body?.mode || '')
      .trim()
      .toLowerCase()
    if (mode !== 'api' && mode !== 'manual') {
      return NextResponse.json({ error: 'mode must be api or manual' }, { status: 400 })
    }

    const result = await setDispatchModeWithHealthCheck({
      adminDb,
      inviteId,
      mode,
      adminId: uid,
      appOrigin: request.nextUrl.origin,
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, decision: result.decision || 'blocked', inviteId, orderCode: result.orderCode || '' },
        { status: result.status || 500 }
      )
    }
    return NextResponse.json(result)
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to set dispatch mode' }, { status })
  }
}
