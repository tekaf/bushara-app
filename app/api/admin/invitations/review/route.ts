import { NextRequest, NextResponse } from 'next/server'
import { adminAuthErrorToResponse, verifyAdminRequest } from '@/lib/auth/verify-admin-request'
import {
  isVisibleInWorkshopQueue,
  resolveAdminPreviewUrl,
  VISIBLE_WORKSHOP_STATUSES,
} from '@/lib/admin/workshop-queue'

export const runtime = 'nodejs'

function toIso(value: unknown): string | null {
  if (!value) return null
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()?.toISOString?.() || null
  }
  const d = new Date(String(value))
  return Number.isFinite(d.getTime()) ? d.toISOString() : null
}

async function loadWorkshopInvites(adminDb: FirebaseFirestore.Firestore, limit: number) {
  const collected = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>()

  const tryAddDocs = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
    for (const doc of docs) {
      if (!collected.has(doc.id)) collected.set(doc.id, doc)
    }
  }

  try {
    const primary = await adminDb
      .collection('invites')
      .where('workflowStatus', 'in', [...VISIBLE_WORKSHOP_STATUSES])
      .orderBy('workshopEnteredAt', 'desc')
      .limit(limit)
      .get()
    tryAddDocs(primary.docs)
  } catch {
    try {
      const fallback = await adminDb
        .collection('invites')
        .where('workflowStatus', 'in', [...VISIBLE_WORKSHOP_STATUSES])
        .limit(limit)
        .get()
      tryAddDocs(fallback.docs)
    } catch {
      // Continue to paid fallback.
    }
  }

  try {
    const paidSnap = await adminDb
      .collection('invites')
      .where('paymentStatus', '==', 'paid')
      .orderBy('updatedAt', 'desc')
      .limit(Math.max(limit, 120))
      .get()
    tryAddDocs(paidSnap.docs)
  } catch {
    const paidFallback = await adminDb.collection('invites').orderBy('updatedAt', 'desc').limit(400).get()
    tryAddDocs(paidFallback.docs)
  }

  return [...collected.values()]
}

export async function GET(request: NextRequest) {
  try {
    const { adminDb } = await verifyAdminRequest(request)

    const limitRaw = Number(request.nextUrl.searchParams.get('limit') || 50)
    const limit = Math.max(1, Math.min(200, limitRaw))
    const query = String(request.nextUrl.searchParams.get('q') || '').trim().toLowerCase()

    const docs = await loadWorkshopInvites(adminDb, limit)

    const invitesRaw = await Promise.all(
      docs.map(async (doc) => {
        try {
          const row = doc.data() as Record<string, unknown>
          if (!isVisibleInWorkshopQueue(row)) return null

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

          const adminPreviewUrl = resolveAdminPreviewUrl(row, internal)

          return {
            id: doc.id,
            orderCode: String(row?.orderCode || row?.orderNumber || '').trim(),
            ownerName,
            ownerId,
            workflowStatus: String(row?.workflowStatus || ''),
            reviewStatus: String(row?.reviewStatus || ''),
            adminPreviewUrl,
            workshopEnteredAt: toIso(row?.workshopEnteredAt) || toIso(row?.paidAt) || toIso(row?.updatedAt),
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
  } catch (error: unknown) {
    const mapped = adminAuthErrorToResponse(error)
    if (mapped.status >= 500) {
      console.error('[ADMIN_REVIEW_QUEUE] error:', mapped.code, mapped.error)
    }
    return NextResponse.json({ error: mapped.error, code: mapped.code }, { status: mapped.status })
  }
}
