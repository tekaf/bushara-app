import { NextRequest, NextResponse } from 'next/server'
import { adminAuthErrorToResponse, verifyAdminRequest } from '@/lib/auth/verify-admin-request'
import { isPaidInvite } from '@/lib/admin/workshop-queue'
import { ensurePaidInviteWorkshopReady } from '@/lib/admin/ensure-workshop-ready'

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
      const beforeWorkflow = String(row?.workflowStatus || '')
      const ready = await ensurePaidInviteWorkshopReady(adminDb, doc.id, {
        origin: request.nextUrl.origin,
      })
      if (!ready.adminPreviewUrl) {
        skipped.push(doc.id)
        continue
      }
      if (ready.repairedWorkflow || ready.repairedPreview || beforeWorkflow !== ready.workflowStatus) {
        fixed.push(doc.id)
      } else {
        skipped.push(doc.id)
      }
    }

    return NextResponse.json({ ok: true, fixedCount: fixed.length, fixed, skippedCount: skipped.length })
  } catch (error: unknown) {
    const mapped = adminAuthErrorToResponse(error)
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status })
  }
}
