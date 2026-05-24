import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import {
  createRiskCaseAccessLink,
  isValidEmail,
  listRiskCaseAccessLinks,
  type AccessLinkRecord,
} from '@/lib/risk-case/access-links'
import { sendRiskCaseAccessEmail } from '@/lib/notifications/risk-case-access-email'
import { buildRiskCasePayload } from '@/lib/risk-case/payload'

export const runtime = 'nodejs'

function resolvePublicBaseUrl(request: NextRequest) {
  const configured = String(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || '').trim()
  const origin = configured || request.nextUrl.origin
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)
  if (isProduction && isLocalOrigin) {
    throw new Error('Invalid public base URL in production: localhost is not allowed')
  }
  return origin
}

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
  return { uid: decoded.uid, email: String(email || '').trim().toLowerCase(), adminDb }
}

async function getInviteMeta(adminDb: FirebaseFirestore.Firestore, inviteId: string) {
  const inviteSnap = await adminDb.collection('invites').doc(inviteId).get()
  if (!inviteSnap.exists) return null
  const invite = inviteSnap.data() as any
  return {
    orderCode: String(invite?.orderCode || invite?.orderNumber || ''),
    occasionType: String(invite?.selectedOccasion || invite?.occasionType || invite?.title || ''),
    dispatchMode: String(invite?.dispatchMode || 'manual'),
  }
}

export async function GET(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const { adminDb } = await getAdminSession(request)
    const inviteId = String(params?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })
    const links = await listRiskCaseAccessLinks({ adminDb, inviteId, limit: 40 })
    return NextResponse.json({ ok: true, links })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to list access links' }, { status })
  }
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const { uid, adminDb } = await getAdminSession(request)
    const inviteId = String(params?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })
    const body = await request.json().catch(() => ({}))
    const email = String(body?.email || '').trim().toLowerCase()
    if (!isValidEmail(email)) return NextResponse.json({ error: 'Invalid email' }, { status: 400 })

    const payloadCheck = await buildRiskCasePayload({
      adminDb,
      inviteId,
      actorId: uid,
      source: 'risk_case_share_access',
      appOrigin: request.nextUrl.origin,
      allowPrepareIfMissing: false,
    })
    if (!payloadCheck.ok) {
      return NextResponse.json(
        { error: payloadCheck.error, decision: payloadCheck.decision || 'blocked' },
        { status: payloadCheck.status || 409 }
      )
    }
    if (String(payloadCheck.payload?.invite?.dispatchMode || '').toLowerCase() !== 'manual') {
      return NextResponse.json({ error: 'Dispatch mode must be manual' }, { status: 409 })
    }

    const meta = await getInviteMeta(adminDb, inviteId)
    if (!meta) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })

    const created = await createRiskCaseAccessLink({
      adminDb,
      inviteId,
      orderCode: meta.orderCode || payloadCheck.orderCode || '',
      allowedEmail: email,
      createdByAdmin: uid,
      expiresInHours: Number(process.env.RISK_CASE_ACCESS_LINK_EXP_HOURS || 48),
    })
    const publicBaseUrl = resolvePublicBaseUrl(request)
    const accessUrl = `${publicBaseUrl}${created.path}`

    let emailSent = false
    try {
      const sent = await sendRiskCaseAccessEmail({
        to: email,
        orderCode: meta.orderCode || payloadCheck.orderCode || '',
        occasionType: meta.occasionType || '-',
        accessUrl,
        expiresAtIso: created.expiresAtIso,
      })
      emailSent = Boolean(sent.delivered)
    } catch (emailError: any) {
      console.warn('[RISK_CASE_ACCESS]', {
        orderCode: meta.orderCode || payloadCheck.orderCode || '',
        inviteId,
        tokenId: created.tokenId,
        allowedEmail: email,
        action: 'share_access_email_failed',
        actorId: uid,
        reason: emailError?.message || 'unknown',
      })
    }

    console.info('[RISK_CASE_ACCESS]', {
      orderCode: meta.orderCode || payloadCheck.orderCode || '',
      inviteId,
      tokenId: created.tokenId,
      allowedEmail: email,
      action: 'share_access_link_created',
      actorId: uid,
      emailSent,
      expiresAt: created.expiresAtIso,
    })

    const links: AccessLinkRecord[] = await listRiskCaseAccessLinks({ adminDb, inviteId, limit: 20 })
    return NextResponse.json({
      ok: true,
      inviteId,
      orderCode: meta.orderCode || payloadCheck.orderCode || '',
      accessPath: created.path,
      accessUrl,
      expiresAt: created.expiresAtIso,
      tokenId: created.tokenId,
      emailSent,
      fallbackReason: emailSent ? '' : 'Email provider unavailable or failed; returning link in response.',
      links,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to create shared access link' }, { status })
  }
}
