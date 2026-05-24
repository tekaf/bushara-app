import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { normalizeInviteFieldsForSnapshot, type FinalInvitationSnapshot } from '@/lib/workshop/snapshot'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'

export const runtime = 'nodejs'

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function redactForDebug(input: any, depth = 0): any {
  if (depth > 8) return '[TRUNCATED]'
  if (input == null) return input
  if (Array.isArray(input)) return input.slice(0, 100).map((item) => redactForDebug(item, depth + 1))
  if (!isObject(input)) {
    if (typeof input === 'string') return input.length > 600 ? `${input.slice(0, 600)}…` : input
    return input
  }
  const out: Record<string, any> = {}
  for (const [key, value] of Object.entries(input)) {
    const lower = key.toLowerCase()
    const sensitive =
      lower.includes('token') ||
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('phone') ||
      lower.includes('email') ||
      lower.includes('previewurl') ||
      lower.includes('inviteimageurl') ||
      lower.includes('finalurl') ||
      lower.includes('mapurl')
    out[key] = sensitive ? '[REDACTED]' : redactForDebug(value, depth + 1)
  }
  return out
}

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
}

function pickRow(label: string, invite: any, snapshot: FinalInvitationSnapshot | null) {
  const fields = (snapshot?.fields || {}) as any
  const blocks = Array.isArray(snapshot?.blocks) ? snapshot!.blocks : []
  const renderHtml = String(snapshot?.renderHtml || '')
  const findBlock = (ids: string[]) => blocks.find((b: any) => ids.includes(String(b?.id || '')))
  const hasHtml = (candidates: string[]) => candidates.some((v) => (v ? renderHtml.includes(v) : false))

  if (label === 'weddingDayLine') {
    const fromInvite = String(invite?.weddingDayLine || invite?.formData?.weddingDayLine || '').trim()
    const fromFields = String(fields?.weddingDayLine || '').trim()
    const block = findBlock(['wedding_day_line'])
    return {
      field: label,
      invite: fromInvite,
      snapshotFields: fromFields,
      snapshotBlock: block ? { id: block.id, content: block.content } : null,
      inRenderHtml: hasHtml([fromFields, block?.content || '']),
    }
  }
  if (label === 'receptionTime') {
    const fromInvite = String(invite?.receptionTime || invite?.time || invite?.formData?.receptionTime || '').trim()
    const fromFields = String(fields?.receptionTime || '').trim()
    const block = findBlock(['reception_time'])
    return {
      field: label,
      invite: fromInvite,
      snapshotFields: fromFields,
      snapshotBlock: block ? { id: block.id, content: block.content } : null,
      inRenderHtml: hasHtml([fromFields, block?.content || '']),
    }
  }
  // zaffaTime
  const fromInvite = String(invite?.zaffaTime || invite?.formData?.zaffaTime || '').trim()
  const fromFields = String(fields?.zaffaTime || '').trim()
  const block = findBlock(['zaffa_time'])
  return {
    field: label,
    invite: fromInvite,
    snapshotFields: fromFields,
    snapshotBlock: block ? { id: block.id, content: block.content } : null,
    inRenderHtml: hasHtml([fromFields, block?.content || '']),
  }
}

export async function GET(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    await verifyAdmin(request)
    const inviteId = String(params?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })
    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteSnap = await adminDb.collection('invites').doc(inviteId).get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)
    const invite = inviteSnap.data() as any

    const internalSnap = await adminDb.collection('invitation_internal').doc(inviteId).get()
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
    const snapshot = (internal?.finalInvitationSnapshot || null) as FinalInvitationSnapshot | null
    const templateId = String(invite?.designId || '').trim()
    const ownerId = String(invite?.ownerId || '').trim()
    const explicitDraftId = String(invite?.sourceDraftId || '').trim()
    const inferredDraftId = ownerId && templateId ? `${ownerId}_${templateId}` : ''
    const candidateDraftId = explicitDraftId || inferredDraftId
    let linkedDraft: any = null
    let draftLinking: {
      inviteId: string
      sourceDraftId: string
      inferredDraftId: string
      matchedDraftId: string
      matchType: 'sourceDraftId' | 'owner_template' | 'none'
      found: boolean
    } = {
      inviteId,
      sourceDraftId: explicitDraftId,
      inferredDraftId,
      matchedDraftId: '',
      matchType: 'none',
      found: false,
    }
    if (candidateDraftId) {
      const draftSnap = await adminDb.collection('inviteDrafts').doc(candidateDraftId).get()
      if (draftSnap.exists) {
        linkedDraft = draftSnap.data() as any
        draftLinking = {
          inviteId,
          sourceDraftId: explicitDraftId,
          inferredDraftId,
          matchedDraftId: candidateDraftId,
          matchType: explicitDraftId ? 'sourceDraftId' : 'owner_template',
          found: true,
        }
      }
    }
    const normalizedInvite = normalizeInviteFieldsForSnapshot(invite, invite?.formData)
    const normalizedDraft = normalizeInviteFieldsForSnapshot(
      {
        ...(isObject(linkedDraft) ? linkedDraft : {}),
        formData: isObject(linkedDraft?.formData) ? linkedDraft.formData : {},
      },
      isObject(linkedDraft?.formData) ? linkedDraft.formData : {}
    )

    const rows = [
      pickRow('weddingDayLine', invite, snapshot),
      pickRow('receptionTime', invite, snapshot),
      pickRow('zaffaTime', invite, snapshot),
    ]

    return NextResponse.json({
      ok: true,
      inviteId,
      hasSnapshot: Boolean(snapshot),
      snapshotMeta: snapshot
        ? {
            templateId: snapshot.templateId,
            updatedAt: snapshot.updatedAt,
            blockCount: Array.isArray(snapshot.blocks) ? snapshot.blocks.length : 0,
            hasRenderHtml: Boolean(snapshot.renderHtml),
          }
        : null,
      truthTable: rows,
      raw: {
        invite: {
          id: inviteId,
          object: redactForDebug(invite),
          formData: redactForDebug(invite?.formData || {}),
        },
        draft: {
          linking: draftLinking,
          object: redactForDebug(linkedDraft || {}),
          formData: redactForDebug(linkedDraft?.formData || {}),
        },
      },
      normalized: {
        invite: normalizedInvite.diagnostics,
        draft: normalizedDraft.diagnostics,
      },
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to inspect snapshot' }, { status })
  }
}
