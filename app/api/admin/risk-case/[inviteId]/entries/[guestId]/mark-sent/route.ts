import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { runDispatchProtection } from '@/lib/dispatch/kernel'
import { applyRiskCaseMarkSentMutation } from '@/lib/risk-case/entry-actions'

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
  { params }: { params: { inviteId: string; guestId: string } }
) {
  try {
    const { uid, adminDb } = await getAdminSession(request)
    const inviteId = String(params?.inviteId || '').trim()
    const guestId = String(params?.guestId || '').trim()
    if (!inviteId || !guestId) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })

    const protection = await runDispatchProtection({
      adminDb,
      source: 'manual_dispatch',
      inviteId,
      checkGuestRelations: true,
      blockOnFailure: true,
    })
    if (!protection.valid) {
      return NextResponse.json(
        { error: protection.reason, decision: protection.decision, inviteId },
        { status: protection.decision === 'orphan_blocked' ? 404 : 409 }
      )
    }

    const result = await applyRiskCaseMarkSentMutation({
      adminDb,
      inviteId,
      guestId,
      actorId: uid,
      orderCode: String(protection.orderCode || ''),
      logTag: '[RISK_CASE_UI]',
    })

    if (result.type === 'invalid_status') {
      return NextResponse.json(
        { error: `Cannot mark as sent from status: ${result.oldStatus || 'unknown'}` },
        { status: 409 }
      )
    }

    return NextResponse.json({
      ok: true,
      inviteId,
      guestId,
      oldStatus: result.oldStatus,
      newStatus: result.newStatus,
      already_marked_sent: result.already_marked_sent,
      manualSendCount: result.manualSendCount,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to mark sent' }, { status })
  }
}
