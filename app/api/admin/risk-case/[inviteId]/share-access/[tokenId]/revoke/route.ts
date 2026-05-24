import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { revokeRiskCaseAccessLink } from '@/lib/risk-case/access-links'

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

export async function POST(
  request: NextRequest,
  { params }: { params: { inviteId: string; tokenId: string } }
) {
  try {
    const { uid, adminDb } = await getAdminSession(request)
    const inviteId = String(params?.inviteId || '').trim()
    const tokenId = String(params?.tokenId || '').trim()
    if (!inviteId || !tokenId) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })
    const result = await revokeRiskCaseAccessLink({
      adminDb,
      inviteId,
      tokenId,
      revokedByAdmin: uid,
    })
    console.info('[RISK_CASE_ACCESS]', {
      inviteId,
      tokenId,
      action: 'share_access_link_revoked',
      actorId: uid,
      alreadyRevoked: result.alreadyRevoked,
    })
    return NextResponse.json({ ok: true, inviteId, tokenId, alreadyRevoked: result.alreadyRevoked })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to revoke link' }, { status })
  }
}
