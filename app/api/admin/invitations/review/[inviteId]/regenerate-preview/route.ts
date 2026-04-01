import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

export const runtime = 'nodejs'

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

function buildFieldsPayload(invite: any) {
  return {
    groomNameAr: String(invite?.groomName || ''),
    brideNameAr: String(invite?.brideName || ''),
    fatherOfBride: String(invite?.fatherOfBride || ''),
    fatherOfGroom: String(invite?.fatherOfGroom || ''),
    motherOfBride: String(invite?.motherOfBride || ''),
    motherOfGroom: String(invite?.motherOfGroom || ''),
    dateText: String(invite?.dateText || invite?.date || ''),
    fullDateLine: String(invite?.fullDateLine || ''),
    hallLocation: String(invite?.locationName || ''),
    venueText: String(invite?.locationName || ''),
    receptionTime: String(invite?.time || ''),
  }
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
    const invite = inviteSnap.data() as any

    if (String(invite?.workflowStatus || '') !== INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW) {
      return NextResponse.json({ error: 'Preview regeneration is available only in workshop review.' }, { status: 409 })
    }

    const templateId = String(invite?.designId || '').trim()
    if (!templateId) return NextResponse.json({ error: 'Invite designId is missing' }, { status: 409 })

    const internalSnap = await adminDb.collection('invitation_internal').doc(inviteId).get()
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
    const designer = internal?.workshopDesigner || {}

    const renderResponse = await fetch(`${request.nextUrl.origin}/api/render/final`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId,
        variant: 'whatsapp_1080x1920',
        fields: buildFieldsPayload(invite),
        renderOptions: {
          layoutB: designer?.layoutB || undefined,
          blockStyleOverrides: designer?.blockStyleOverrides || {},
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

