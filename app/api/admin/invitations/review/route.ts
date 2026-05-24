import { NextRequest, NextResponse } from 'next/server'
import { ADMIN_SDK_USER_ERROR_AR, isAdminSdkError, verifyAdminRequest } from '@/lib/auth/verify-admin-request'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

export const runtime = 'nodejs'

const VISIBLE_WORKSHOP_STATUSES = [
  INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
  INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
  INVITE_WORKFLOW_STATUS.APPROVED,
  INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SENT,
] as const

function toIso(value: unknown): string | null {
  if (!value) return null
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()?.toISOString?.() || null
  }
  const d = new Date(String(value))
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

export async function GET(request: NextRequest) {
  try {
    const { adminDb } = await verifyAdminRequest(request)

    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 50)
    const limit = Math.max(1, Math.min(200, limitRaw))
    const query = String(request.nextUrl.searchParams.get('q') || '').trim().toLowerCase()

    let snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
    try {
      snap = await adminDb
        .collection('invites')
        .where('workflowStatus', 'in', [...VISIBLE_WORKSHOP_STATUSES])
        .orderBy('workshopEnteredAt', 'desc')
        .limit(limit)
        .get()
    } catch {
      try {
        snap = await adminDb
          .collection('invites')
          .where('workflowStatus', 'in', [...VISIBLE_WORKSHOP_STATUSES])
          .limit(limit)
          .get()
      } catch {
        snap = await adminDb.collection('invites').orderBy('updatedAt', 'desc').limit(300).get()
      }
    }

    const invitesRaw = await Promise.all(
      snap.docs.map(async (doc) => {
        try {
          const row = doc.data() as Record<string, unknown>
          if (!VISIBLE_WORKSHOP_STATUSES.includes(String(row?.workflowStatus || '') as (typeof VISIBLE_WORKSHOP_STATUSES)[number])) {
            return null
          }

          let internal: Record<string, unknown> = {}
          try {
            const internalSnap = await adminDb.collection('invitation_internal').doc(doc.id).get()
            internal = internalSnap.exists ? (internalSnap.data() as Record<string, unknown>) : {}
          } catch {
            internal = {}
          }

          const ownerId = String(row?.ownerId || '')
          let ownerName = ''
          if (ownerId) {
            try {
              const userSnap = await adminDb.collection('users').doc(ownerId).get()
              if (userSnap.exists) {
                const user = userSnap.data() as Record<string, unknown>
                ownerName = String(user?.name || '').trim()
              }
            } catch {
              ownerName = ''
            }
          }

          const adminPreviewUrl = String(
            internal?.adminPreviewUrl || row?.previewUrl || row?.inviteImageUrl || row?.finalUrl || ''
          ).trim()

          return {
            id: doc.id,
            orderCode: String(row?.orderCode || row?.orderNumber || '').trim(),
            ownerName,
            ownerId,
            workflowStatus: String(row?.workflowStatus || ''),
            reviewStatus: String(row?.reviewStatus || ''),
            adminPreviewUrl,
            workshopEnteredAt: toIso(row?.workshopEnteredAt),
          }
        } catch (docError) {
          console.error('[ADMIN_REVIEW_QUEUE] failed to map invite', doc.id, docError)
          return null
        }
      })
    )

    const invites = invitesRaw
      .filter(Boolean)
      .filter((row) => {
        if (!query) return true
        const id = String(row?.id || '').toLowerCase()
        const orderCode = String(row?.orderCode || '').toLowerCase()
        return id.includes(query) || orderCode.includes(query)
      })
      .sort((a, b) => {
        const at = a?.workshopEnteredAt ? Date.parse(a.workshopEnteredAt) : 0
        const bt = b?.workshopEnteredAt ? Date.parse(b.workshopEnteredAt) : 0
        return bt - at
      })
      .slice(0, limit)

    return NextResponse.json({ ok: true, invites })
  } catch (error: any) {
    const message = String(error?.message || '')
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (isAdminSdkError(message)) {
      console.error('[ADMIN_REVIEW_QUEUE] admin sdk not configured')
      return NextResponse.json({ error: ADMIN_SDK_USER_ERROR_AR }, { status: 503 })
    }
    console.error('[ADMIN_REVIEW_QUEUE] unexpected error:', message)
    return NextResponse.json({ error: 'Failed to load review queue' }, { status: 500 })
  }
}
