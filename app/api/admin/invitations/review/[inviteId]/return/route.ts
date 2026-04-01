import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import {
  INVITE_REVIEW_STATUS,
  INVITE_WORKFLOW_STATUS,
  getWorkflowTransitionError,
} from '@/lib/invitations/workflow'

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

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const reason = String(body?.reason || '').trim()
    if (!reason) return NextResponse.json({ error: 'Reason is required' }, { status: 400 })

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = inviteSnap.data() as any
    const transitionError = getWorkflowTransitionError(
      String(invite?.workflowStatus || ''),
      INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE
    )
    if (transitionError) {
      return NextResponse.json({ error: transitionError }, { status: 409 })
    }

    await inviteRef.set(
      {
        workflowStatus: INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
        reviewStatus: INVITE_REVIEW_STATUS.CHANGES_REQUESTED,
        workshopReviewedBy: adminUid,
        workshopReturnReason: reason,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await adminDb.collection('invitation_reviews').add({
      inviteId,
      action: 'returned_for_correction',
      notes: reason,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
      actorRole: 'admin',
    })

    return NextResponse.json({
      ok: true,
      workflowStatus: INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
      reviewStatus: INVITE_REVIEW_STATUS.CHANGES_REQUESTED,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to return invite for correction' }, { status })
  }
}

