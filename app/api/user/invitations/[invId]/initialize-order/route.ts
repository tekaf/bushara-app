import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'

export const runtime = 'nodejs'

async function getSession(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')
  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  if (!app || !adminDb) throw new Error('Admin SDK not configured')
  const decoded = await getAuth(app).verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  return { uid: decoded.uid, adminDb }
}

export async function POST(request: NextRequest, { params }: { params: { invId: string } }) {
  try {
    const { uid, adminDb } = await getSession(request)
    const inviteId = String(params?.invId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = inviteSnap.data() as any
    if (String(invite?.ownerId || '') !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const result = await ensureInviteOrderFoundation(adminDb, inviteId)

    return NextResponse.json({
      ok: true,
      inviteId,
      orderCode: result.orderCode,
      dispatchMode: result.dispatchMode,
      dispatchStatus: result.dispatchStatus,
      guestsTagged: result.guestsTagged,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to initialize order foundation' }, { status })
  }
}
