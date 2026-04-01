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

function cleanText(value: unknown, maxLen: number) {
  return String(value || '')
    .trim()
    .slice(0, maxLen)
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const updates = {
      title: cleanText(body?.title, 120),
      selectedOccasion: cleanText(body?.selectedOccasion, 80),
      groomName: cleanText(body?.groomName, 80),
      brideName: cleanText(body?.brideName, 80),
      date: cleanText(body?.date, 40),
      time: cleanText(body?.time, 40),
      locationName: cleanText(body?.locationName, 160),
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = inviteSnap.data() as any

    if (String(invite?.workflowStatus || '') !== INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW) {
      return NextResponse.json(
        { error: 'Editing is allowed only while invite is in workshop review.' },
        { status: 409 }
      )
    }

    await inviteRef.set(
      {
        ...updates,
        workshopEditedAt: FieldValue.serverTimestamp(),
        workshopEditedBy: adminUid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await adminDb.collection('invitation_reviews').add({
      inviteId,
      action: 'edited_by_admin',
      notes: 'Minor text/date/location corrections were applied by admin.',
      changes: updates,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
      actorRole: 'admin',
    })

    return NextResponse.json({ ok: true, updates })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to edit invite' }, { status })
  }
}

