import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'
import {
  applyBlocksToFields,
  deriveRenderOptionsFromBlocks,
  filterSnapshotBlocksByTemplateType,
  mergeSnapshotBlocksById,
  sanitizeRenderFieldsByTemplateType,
  sanitizeForFirestore,
  type FinalInvitationSnapshot,
  type SnapshotBlock,
  type SnapshotTemplateType,
} from '@/lib/workshop/snapshot'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'

export const runtime = 'nodejs'

const WORKSHOP_DESIGNER_EDITABLE_STATUSES = new Set<string>([
  INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
  INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
  INVITE_WORKFLOW_STATUS.APPROVED,
  INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SENT,
])

type LayoutB = {
  groom: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
  bride: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
  date: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
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
  return decoded.uid
}

function n(value: unknown, fallback = 0) {
  const x = Number(value)
  return Number.isFinite(x) ? x : fallback
}

function sanitizeSnapshotBlocks(raw: unknown, templateType: SnapshotTemplateType): SnapshotBlock[] {
  const arr = Array.isArray(raw) ? raw : []
  const out: SnapshotBlock[] = []
  for (const row of arr) {
    const item = row as any
    const id = String(item?.id || '').trim()
    if (!id) continue
    out.push({
      id,
      kind: 'text',
      type:
        id === 'zaffa_time' || id === 'wedding_day_line' || id === 'bride_entry' || id === 'groom_entry'
          ? 'wedding_only'
          : 'shared',
      content: String(item?.content || ''),
      xPx: Math.max(0, Math.round(n(item?.xPx, 0))),
      yPx: Math.max(0, Math.round(n(item?.yPx, 0))),
      wPx: Math.max(0, Math.round(n(item?.wPx, 0))),
      hPx: Math.max(0, Math.round(n(item?.hPx, 0))),
      fontFamily: String(item?.fontFamily || '').trim(),
      fontSize: Math.max(8, Math.round(n(item?.fontSize, 16))),
      fontWeight: Math.max(100, Math.round(n(item?.fontWeight, 400))),
      color: String(item?.color || '').trim(),
      align: (String(item?.align || 'center') as 'left' | 'center' | 'right'),
      lineHeight: Math.max(0.8, n(item?.lineHeight, 1.2)),
      direction: (String(item?.direction || 'rtl') as 'rtl' | 'ltr'),
      visible: item?.visible !== false,
    })
  }
  return filterSnapshotBlocksByTemplateType(out, templateType)
}

export async function GET(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteSnap = await adminDb.collection('invites').doc(inviteId).get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)
    const invite = inviteSnap.data() as any

    const internalSnap = await adminDb.collection('invitation_internal').doc(inviteId).get()
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}

    const templateSnap = await adminDb.collection('templates').doc(String(invite?.designId || '')).get()
    const template = templateSnap.exists ? (templateSnap.data() as any) : {}

    return NextResponse.json({
      ok: true,
      invite: {
        id: inviteId,
        designId: String(invite?.designId || ''),
        workflowStatus: String(invite?.workflowStatus || ''),
      },
      designer: {
        layoutB: internal?.workshopDesigner?.layoutB || template?.layoutB || null,
        blockStyleOverrides: internal?.workshopDesigner?.blockStyleOverrides || {},
        blockPositionOverrides: internal?.workshopDesigner?.blockPositionOverrides || {},
      },
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load designer config' }, { status })
  }
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const layoutIn = (body?.layoutB || null) as Partial<LayoutB> | null
    const styleIn = (body?.blockStyleOverrides || null) as Record<string, any> | null
    const positionIn = (body?.blockPositionOverrides || {}) as Record<string, any>
    const snapshotPatch = (body?.snapshotPatch || null) as
      | {
          blocks?: unknown
        }
      | null

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)
    const invite = inviteSnap.data() as any
    const workflowStatus = String(invite?.workflowStatus || '').trim()
    if (!WORKSHOP_DESIGNER_EDITABLE_STATUSES.has(workflowStatus)) {
      return NextResponse.json(
        { error: `Designer editing is not allowed for workflow status: ${workflowStatus || 'unknown'}.` },
        { status: 409 }
      )
    }

    const internalSnap = await adminDb.collection('invitation_internal').doc(inviteId).get()
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
    const templateSnap = await adminDb.collection('templates').doc(String(invite?.designId || '')).get()
    const templateType = (
      (templateSnap.exists ? (templateSnap.data() as any)?.type : null) ||
      (internal?.finalInvitationSnapshot?.templateType as string) ||
      'A'
    ) as SnapshotTemplateType
    const existingLayout = internal?.workshopDesigner?.layoutB || {}
    const existingStyles = internal?.workshopDesigner?.blockStyleOverrides || {}
    const existingPositions = internal?.workshopDesigner?.blockPositionOverrides || {}
    const existingSnapshot = (internal?.finalInvitationSnapshot || null) as FinalInvitationSnapshot | null

    const sourceLayout = layoutIn || existingLayout
    const layoutB: LayoutB = {
      groom: {
        xPx: Math.max(0, Math.round(n(sourceLayout?.groom?.xPx, 726))),
        yPx: Math.max(0, Math.round(n(sourceLayout?.groom?.yPx, 539))),
        fontSize: Math.max(10, Math.round(n(sourceLayout?.groom?.fontSize, 54))),
      },
      bride: {
        xPx: Math.max(0, Math.round(n(sourceLayout?.bride?.xPx, 126))),
        yPx: Math.max(0, Math.round(n(sourceLayout?.bride?.yPx, 537))),
        fontSize: Math.max(10, Math.round(n(sourceLayout?.bride?.fontSize, 54))),
      },
      date: {
        xPx: Math.max(0, Math.round(n(sourceLayout?.date?.xPx, 461))),
        yPx: Math.max(0, Math.round(n(sourceLayout?.date?.yPx, 1301))),
        fontSize: Math.max(10, Math.round(n(sourceLayout?.date?.fontSize, 24))),
      },
    }

    const blockStyleOverrides: Record<string, any> = {}
    const mergedStyles = styleIn ? { ...existingStyles, ...styleIn } : { ...existingStyles }
    for (const [key, value] of Object.entries(mergedStyles)) {
      const row = (value || {}) as any
      const nextRow: Record<string, any> = {}
      const color = String(row?.color || '').trim()
      const fontFamily = String(row?.fontFamily || '').trim()
      const fontWeight = Number.isFinite(Number(row?.fontWeight)) ? Number(row?.fontWeight) : null
      const fontSize = Number.isFinite(Number(row?.fontSize)) ? Math.max(8, Math.round(Number(row?.fontSize))) : null

      if (color) nextRow.color = color
      if (fontFamily) nextRow.fontFamily = fontFamily
      if (fontWeight !== null) nextRow.fontWeight = fontWeight
      if (fontSize !== null) nextRow.fontSize = fontSize

      // Firestore rejects undefined in nested maps; keep only defined keys.
      blockStyleOverrides[String(key)] = nextRow
    }

    const blockPositionOverrides: Record<string, { xPx: number; yPx: number }> = {}
    const mergedPositions = { ...existingPositions, ...positionIn }
    for (const [blockId, value] of Object.entries(mergedPositions)) {
      const row = value as any
      if (!Number.isFinite(Number(row?.xPx)) && !Number.isFinite(Number(row?.yPx))) continue
      blockPositionOverrides[String(blockId)] = {
        xPx: Math.max(0, Math.round(n(row?.xPx, 0))),
        yPx: Math.max(0, Math.round(n(row?.yPx, 0))),
      }
    }

    const updatePayload: Record<string, any> = {
      workshopDesigner: {
        layoutB,
        blockStyleOverrides,
        blockPositionOverrides,
        updatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    }

    if (snapshotPatch && existingSnapshot) {
      const patchedBlocks = sanitizeSnapshotBlocks(snapshotPatch.blocks, templateType)
      const existingBlocks = filterSnapshotBlocksByTemplateType(
        (Array.isArray(existingSnapshot.blocks) ? existingSnapshot.blocks : []) as SnapshotBlock[],
        templateType
      )
      const effectiveBlocks = mergeSnapshotBlocksById(existingBlocks, patchedBlocks, templateType)
      const patchedOptions = deriveRenderOptionsFromBlocks(effectiveBlocks, layoutB)
      const nextFields = sanitizeRenderFieldsByTemplateType(
        applyBlocksToFields(existingSnapshot.fields || {}, effectiveBlocks, templateType),
        templateType
      )
      const nextRenderOptions = {
        ...existingSnapshot.renderOptions,
        ...patchedOptions,
      } as any

      updatePayload.finalInvitationSnapshot = sanitizeForFirestore({
        ...existingSnapshot,
        templateType,
        backgroundUrl: String(existingSnapshot.backgroundUrl || ''),
        blocks: effectiveBlocks,
        fields: nextFields,
        renderOptions: nextRenderOptions,
        updatedAt: new Date().toISOString(),
      })
    }

    await adminDb.collection('invitation_internal').doc(inviteId).set(updatePayload, { merge: true })

    await adminDb.collection('invitation_reviews').add({
      inviteId,
      action: 'designer_updated',
      notes: 'Workshop designer settings updated by admin.',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
      actorRole: 'admin',
    })

    return NextResponse.json({ ok: true, layoutB, blockStyleOverrides, blockPositionOverrides })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to save designer config' }, { status })
  }
}

