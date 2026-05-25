import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { adminAuthErrorToResponse, verifyAdminRequest } from '@/lib/auth/verify-admin-request'
import { isPaidInvite, isVisibleInWorkshopQueue, resolveAdminPreviewUrl } from '@/lib/admin/workshop-queue'
import { INVITE_REVIEW_STATUS, INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

export const runtime = 'nodejs'

/**
 * Backfill paid invites stuck before workshop enter (awaiting_payment + paid).
 */
export async function POST(request: NextRequest) {
  try {
    const { adminDb } = await verifyAdminRequest(request)
    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 40)
    const limit = Math.max(1, Math.min(100, limitRaw))

    let snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
    try {
      snap = await adminDb
        .collection('invites')
        .where('paymentStatus', '==', 'paid')
        .orderBy('updatedAt', 'desc')
        .limit(limit)
        .get()
    } catch {
      snap = await adminDb.collection('invites').orderBy('updatedAt', 'desc').limit(limit).get()
    }

    const fixed: string[] = []
    const skipped: string[] = []

    for (const doc of snap.docs) {
      const row = doc.data() as Record<string, unknown>
      if (!isPaidInvite(row)) {
        skipped.push(doc.id)
        continue
      }
      if (isVisibleInWorkshopQueue(row) && row.workflowStatus === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW) {
        skipped.push(doc.id)
        continue
      }

      const internalSnap = await adminDb.collection('invitation_internal').doc(doc.id).get()
      const internal = internalSnap.exists ? (internalSnap.data() as Record<string, unknown>) : {}
      const adminPreviewUrl = resolveAdminPreviewUrl(row, internal)
      if (!adminPreviewUrl) {
        skipped.push(doc.id)
        continue
      }

      await adminDb.collection('invitation_internal').doc(doc.id).set(
        {
          adminPreviewUrl,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      await adminDb.collection('invites').doc(doc.id).set(
        {
          workflowStatus: INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
          reviewStatus: INVITE_REVIEW_STATUS.PENDING,
          paymentStatus: 'paid',
          status: 'paid',
          workshopEnteredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      fixed.push(doc.id)
    }

    return NextResponse.json({ ok: true, fixedCount: fixed.length, fixed, skippedCount: skipped.length })
  } catch (error: unknown) {
    const mapped = adminAuthErrorToResponse(error)
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status })
  }
}
