import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { buildRiskCasePayload } from '@/lib/risk-case/payload'

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

export async function GET(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const { uid, adminDb } = await getAdminSession(request)
    const inviteId = String(params?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })
    const forceRegenerate =
      ['1', 'true', 'yes'].includes(String(request.nextUrl.searchParams.get('force') || '').toLowerCase())

    const result = await buildRiskCasePayload({
      adminDb,
      inviteId,
      actorId: uid,
      source: 'risk_case_ui_get',
      appOrigin: request.nextUrl.origin,
      allowPrepareIfMissing: true,
      forceRegenerate,
    })
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, decision: result.decision, inviteId, orderCode: result.orderCode || '' },
        { status: result.status || 500 }
      )
    }
    return NextResponse.json(result.payload)
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load risk case' }, { status })
  }
}
