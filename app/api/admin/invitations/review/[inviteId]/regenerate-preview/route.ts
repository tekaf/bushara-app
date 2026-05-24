import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'
import type { FinalInvitationSnapshot } from '@/lib/workshop/snapshot'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'

export const runtime = 'nodejs'

const PREVIEW_REGENERATE_ALLOWED_STATUSES = new Set<string>([
  INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
  INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
  INVITE_WORKFLOW_STATUS.APPROVED,
  INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SENT,
])

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
  return decoded.uid
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)
    const invite = inviteSnap.data() as any

    const workflowStatus = String(invite?.workflowStatus || '').trim()
    if (!PREVIEW_REGENERATE_ALLOWED_STATUSES.has(workflowStatus)) {
      return NextResponse.json(
        { error: `Preview regeneration is not allowed for workflow status: ${workflowStatus || 'unknown'}.` },
        { status: 409 }
      )
    }

    const internalSnap = await adminDb.collection('invitation_internal').doc(inviteId).get()
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
    const snapshot = (internal?.finalInvitationSnapshot || null) as FinalInvitationSnapshot | null
    if (!snapshot?.templateId || !snapshot?.fields) {
      return NextResponse.json({ error: 'Snapshot is missing. Open workshop first to initialize it.' }, { status: 409 })
    }

    const renderResponse = await fetch(`${request.nextUrl.origin}/api/render/final`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId: snapshot.templateId,
        variant: 'whatsapp_1080x1920',
        fields: snapshot.fields,
        renderOptions: {
          layoutB: (snapshot?.renderOptions as any)?.layoutB || undefined,
          blockStyleOverrides: (snapshot?.renderOptions as any)?.blockStyleOverrides || {},
          blockPositionOverrides: (snapshot?.renderOptions as any)?.blockPositionOverrides || {},
        },
      }),
    })

    const renderData = await renderResponse.json().catch(() => ({}))
    if (!renderResponse.ok || !renderData?.url) {
      return NextResponse.json({ error: renderData?.error || 'Failed to render preview' }, { status: 500 })
    }

    const adminPreviewUrl = String(renderData.url)
    await adminDb.collection('invitation_internal').doc(inviteId).set(
      {
        adminPreviewUrl,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await adminDb.collection('invitation_reviews').add({
      inviteId,
      action: 'admin_preview_regenerated',
      notes: 'Admin regenerated workshop preview after designer changes.',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
      actorRole: 'admin',
    })

    return NextResponse.json({ ok: true, adminPreviewUrl })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to regenerate preview' }, { status })
  }
}

