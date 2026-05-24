import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp } from '@/lib/firebase/admin'
import { getStripeServerClient, isStripeConfigured } from '@/lib/stripe/server'

export const runtime = 'nodejs'

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')
  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')
  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  return decoded.uid
}

export async function POST(request: NextRequest) {
  try {
    if (!isStripeConfigured()) {
      return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
    }
    const stripe = getStripeServerClient()
    if (!stripe) return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })

    const uid = await verifyUser(request)
    const body = await request.json().catch(() => ({}))
    const sessionId = String(body?.sessionId || '').trim()
    if (!sessionId) return NextResponse.json({ error: 'Missing sessionId' }, { status: 400 })

    const session = await stripe.checkout.sessions.retrieve(sessionId)
    const ownerUid = String(session?.metadata?.userId || '').trim()
    if (!ownerUid || ownerUid !== uid) {
      return NextResponse.json({ error: 'Session does not belong to user' }, { status: 403 })
    }
    if (session.mode !== 'payment' || session.payment_status !== 'paid') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 409 })
    }

    return NextResponse.json({
      ok: true,
      sessionId,
      packageId: String(session?.metadata?.packageId || ''),
      inviteId: String(session?.metadata?.inviteId || ''),
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to verify session' }, { status })
  }
}
