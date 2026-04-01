import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import {
  INVITE_REVIEW_STATUS,
  INVITE_WORKFLOW_STATUS,
  getWorkflowTransitionError,
} from '@/lib/invitations/workflow'
import { sendWorkshopReviewEmail } from '@/lib/notifications/admin-workshop-email'

export const runtime = 'nodejs'

function normalizeOccasion(value: string) {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'wedding') return 'زواج أو ملكه'
  if (key === 'engagement') return 'خطبة'
  if (key === 'special') return 'مناسبة خاصة'
  return value || '-'
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const app = getAdminApp()
    const adminDb = getAdminFirestore()
    if (!app || !adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json().catch(() => ({}))
    const inviteId = String(body?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing inviteId' }, { status: 400 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })

    const invite = inviteSnap.data() as any
    if (String(invite?.ownerId || '') !== decoded.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const currentWorkflow = String(invite?.workflowStatus || '')
    const alreadyInWorkshop = currentWorkflow === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW
    const transitionError = getWorkflowTransitionError(currentWorkflow, INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW)
    if (!alreadyInWorkshop && transitionError) {
      return NextResponse.json({ error: transitionError }, { status: 409 })
    }

    const adminPreviewUrl = String(
      invite?.adminPreviewUrl || invite?.inviteImageUrl || invite?.finalUrl || invite?.previewUrl || ''
    ).trim()
    if (!adminPreviewUrl) {
      return NextResponse.json(
        { error: 'Missing preview asset for admin review. Cannot enter workshop without adminPreviewUrl.' },
        { status: 409 }
      )
    }

    const userSnap = await adminDb.collection('users').doc(decoded.uid).get()
    const userData = userSnap.exists ? (userSnap.data() as any) : {}
    const customerName =
      String(userData?.name || '').trim() ||
      String(decoded.name || '').trim() ||
      String(decoded.email || '').split('@')[0] ||
      'مستخدم بشاره'
    const orderNumber = String(invite?.orderNumber || `BSH-${inviteId.slice(0, 8)}`).trim()
    const occasionType = normalizeOccasion(String(invite?.selectedOccasion || invite?.occasionType || ''))
    const reviewUrl = `${request.nextUrl.origin}/admin/invitations/review/${encodeURIComponent(inviteId)}`

    await adminDb.collection('invitation_internal').doc(inviteId).set(
      {
        adminPreviewUrl,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await inviteRef.set(
      {
        paymentStatus: 'paid',
        status: 'paid',
        workflowStatus: INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
        reviewStatus: INVITE_REVIEW_STATUS.PENDING,
        // Keep admin preview internal-only until approval.
        adminPreviewUrl: FieldValue.delete(),
        previewUrl: FieldValue.delete(),
        finalUrl: FieldValue.delete(),
        inviteImageUrl: FieldValue.delete(),
        workshopEnteredAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    if (!alreadyInWorkshop) {
      await adminDb.collection('invitation_reviews').add({
        inviteId,
        action: 'entered_workshop',
        notes: 'Payment confirmed. Invitation entered workshop confirmation.',
        createdAt: FieldValue.serverTimestamp(),
        createdBy: decoded.uid,
        actorRole: 'system',
      })
    }

    let mailDelivered = false
    let mailError = ''
    let recipients: string[] = []
    if (!alreadyInWorkshop || String(invite?.adminNotificationStatus || '') !== 'delivered') {
      try {
        const mailResult = await sendWorkshopReviewEmail({
          inviteId,
          orderNumber,
          customerName,
          occasionType,
          reviewUrl,
        })
        mailDelivered = mailResult.delivered
        recipients = mailResult.recipients || []
      } catch (mailErr: any) {
        mailDelivered = false
        mailError = String(mailErr?.message || 'email_send_failed')
      }

      await adminDb.collection('admin_notifications').add({
        type: 'workshop_review_required',
        inviteId,
        orderNumber,
        customerName,
        occasionType,
        reviewUrl,
        emailDelivered: mailDelivered,
        recipients,
        error: mailError || '',
        createdAt: FieldValue.serverTimestamp(),
      })
    } else {
      mailDelivered = true
    }

    await inviteRef.set(
      {
        adminNotificationStatus: mailDelivered ? 'delivered' : 'failed',
        adminNotificationError: mailDelivered ? FieldValue.delete() : mailError || 'email_send_failed',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return NextResponse.json({
      ok: true,
      inviteId,
      workflowStatus: INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
      reviewStatus: INVITE_REVIEW_STATUS.PENDING,
      adminPreviewUrl,
      reviewUrl,
      emailDelivered: mailDelivered,
      emailError: mailError || null,
      idempotent: alreadyInWorkshop,
    })
  } catch (error: any) {
    console.error('[WORKSHOP][ENTER] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to enter workshop' },
      { status: 500 }
    )
  }
}

