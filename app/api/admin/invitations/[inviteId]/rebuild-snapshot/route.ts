import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { generateHTML, type RenderFields } from '@/lib/render/engine'
import type { Template } from '@/lib/firebase/types'
import {
  applyBlocksToFields,
  buildRenderFieldsFromInvite,
  deriveRenderOptionsFromBlocks,
  ensureBlocksFromPreset,
  extractBlocksFromRenderHtml,
  filterSnapshotBlocksByTemplateType,
  getCriticalFieldWarnings,
  normalizeInviteFieldsForSnapshot,
  sanitizeRenderFieldsByTemplateType,
  sanitizeForFirestore,
  type FinalInvitationSnapshot,
  type SnapshotTemplateType,
} from '@/lib/workshop/snapshot'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'

export const runtime = 'nodejs'

const REQUIRED_CANONICAL_FIELDS = ['groomNameAr', 'brideNameAr', 'dateText', 'hallLocation'] as const

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

function summarizeMissingRootCause(
  warnings: string[],
  inviteCanonical: Record<string, string>,
  draftCanonical: Record<string, string>
) {
  const rows = warnings.map((field) => {
    const inInvite = Boolean(String(inviteCanonical[field] || '').trim())
    const inDraft = Boolean(String(draftCanonical[field] || '').trim())
    let status: 'present_in_invite' | 'draft_only' | 'missing_everywhere' = 'missing_everywhere'
    if (inInvite) status = 'present_in_invite'
    else if (inDraft) status = 'draft_only'
    return { field, inInvite, inDraft, status }
  })
  return {
    fields: rows,
    hasDraftOnlyFields: rows.some((r) => r.status === 'draft_only'),
    hasMissingEverywhere: rows.some((r) => r.status === 'missing_everywhere'),
  }
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

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = String(params?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)
    const invite = inviteSnap.data() as any

    const templateId = String(invite?.designId || '').trim()
    if (!templateId) return NextResponse.json({ error: 'Invite designId is missing' }, { status: 409 })

    const inviteOwnerId = String(invite?.ownerId || '').trim()
    const explicitDraftId = String(invite?.sourceDraftId || '').trim()
    const inferredDraftId = inviteOwnerId && templateId ? `${inviteOwnerId}_${templateId}` : ''
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

    const templateDoc = await adminDb.collection('templates').doc(templateId).get()
    if (!templateDoc.exists) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    const template = { id: templateDoc.id, ...templateDoc.data() } as Template
    const templateType = (template.type || 'A') as SnapshotTemplateType

    const internalRef = adminDb.collection('invitation_internal').doc(inviteId)
    const internalSnap = await internalRef.get()
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
    const previousSnapshot = (internal?.finalInvitationSnapshot || null) as FinalInvitationSnapshot | null
    const designer = internal?.workshopDesigner || {}

    const normalized = normalizeInviteFieldsForSnapshot(invite, invite?.formData)
    const draftNormalized = normalizeInviteFieldsForSnapshot(
      {
        ...(isObject(linkedDraft) ? linkedDraft : {}),
        formData: isObject(linkedDraft?.formData) ? linkedDraft.formData : {},
      },
      isObject(linkedDraft?.formData) ? linkedDraft.formData : {}
    )
    const fields = normalized.fields || buildRenderFieldsFromInvite(invite)
    const warnings = getCriticalFieldWarnings(fields)
    if (warnings.length) {
      const inviteCanonical = (normalized?.diagnostics?.canonical || {}) as Record<string, string>
      const draftCanonical = (draftNormalized?.diagnostics?.canonical || {}) as Record<string, string>
      const rootCause = summarizeMissingRootCause(warnings, inviteCanonical, draftCanonical)
      const requiredInInvite = REQUIRED_CANONICAL_FIELDS.map((key) => ({
        key,
        value: String((inviteCanonical as any)[key] || ''),
        present: Boolean(String((inviteCanonical as any)[key] || '').trim()),
      }))
      const requiredInDraft = REQUIRED_CANONICAL_FIELDS.map((key) => ({
        key,
        value: String((draftCanonical as any)[key] || ''),
        present: Boolean(String((draftCanonical as any)[key] || '').trim()),
      }))

      console.warn('[SNAPSHOT][REBUILD][MISSING_FIELDS]', {
        inviteId,
        warnings,
        rawInviteKeys: normalized.diagnostics.rawInviteKeys,
        rawFormDataKeys: normalized.diagnostics.rawFormDataKeys,
        canonical: normalized.diagnostics.canonical,
        draftLinking,
        draftRawKeys: draftNormalized?.diagnostics?.rawInviteKeys || [],
        draftFormDataKeys: draftNormalized?.diagnostics?.rawFormDataKeys || [],
        draftCanonical: draftNormalized?.diagnostics?.canonical || {},
        rootCause,
      })
      return NextResponse.json(
        {
          error: `Cannot rebuild snapshot. Missing required fields: ${warnings.join(', ')}`,
          warnings,
          diagnostics: normalized.diagnostics,
          requiredFieldsStatus: {
            invite: requiredInInvite,
            draft: requiredInDraft,
            rootCause,
          },
          inviteDebug: {
            id: inviteId,
            object: redactForDebug(invite),
            formData: redactForDebug(invite?.formData || {}),
          },
          draftDebug: {
            linking: draftLinking,
            object: redactForDebug(linkedDraft || {}),
            formData: redactForDebug(linkedDraft?.formData || {}),
          },
        },
        { status: 409 }
      )
    }

    const { loadPresetFromFirestore, mergePresetWithBase } = await import('@/lib/template-presets/loader')
    const basePreset = await loadPresetFromFirestore(template.type)
    const preset = template.presetOverride ? mergePresetWithBase(basePreset, template.presetOverride) : basePreset

    const renderOptions = {
      assetBaseUrl: request.nextUrl.origin,
      layoutB: designer?.layoutB || template.layoutB,
      blockStyleOverrides: designer?.blockStyleOverrides || {},
      blockPositionOverrides: designer?.blockPositionOverrides || {},
    }

    const firstHtml = await generateHTML(
      preset,
      String(template?.assets?.backgroundUrl || ''),
      sanitizeRenderFieldsByTemplateType(fields, templateType),
      renderOptions
    )
    const extracted = extractBlocksFromRenderHtml(firstHtml)
    const strictFields = sanitizeRenderFieldsByTemplateType(fields, templateType)
    const blocks = ensureBlocksFromPreset(extracted, strictFields, preset, renderOptions, templateType)
    const filteredBlocks = filterSnapshotBlocksByTemplateType(blocks, templateType)
    const normalizedFields: RenderFields = sanitizeRenderFieldsByTemplateType(
      applyBlocksToFields(strictFields, filteredBlocks, templateType),
      templateType
    )
    const normalizedOptions = deriveRenderOptionsFromBlocks(filteredBlocks, renderOptions.layoutB)
    const finalHtml = await generateHTML(
      preset,
      String(template?.assets?.backgroundUrl || ''),
      normalizedFields,
      {
        assetBaseUrl: request.nextUrl.origin,
        layoutB: (normalizedOptions as any).layoutB,
        blockStyleOverrides: (normalizedOptions as any).blockStyleOverrides || {},
        blockPositionOverrides: (normalizedOptions as any).blockPositionOverrides || {},
      }
    )

    const nowIso = new Date().toISOString()
    const nextVersion = Math.max(1, Number(previousSnapshot?.version || 0) + 1)
    const nextSnapshot: FinalInvitationSnapshot = {
      version: nextVersion,
      templateId,
      templateType,
      variant: 'whatsapp_1080x1920',
      canvas: { width: 1080, height: 1920 },
      backgroundUrl: String(template?.assets?.backgroundUrl || ''),
      fields: normalizedFields,
      renderOptions: normalizedOptions,
      blocks: filteredBlocks,
      createdAt: previousSnapshot?.createdAt || nowIso,
      updatedAt: nowIso,
    }

    // Explicit rebuild: remove old snapshot first, then write new one.
    await internalRef.set(
      {
        finalInvitationSnapshot: FieldValue.delete(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    await internalRef.set(
      {
        finalInvitationSnapshot: sanitizeForFirestore(nextSnapshot),
        finalInvitationSnapshotMeta: {
          version: nextVersion,
          rebuiltAt: nowIso,
          rebuiltBy: adminUid,
          renderHtmlLength: finalHtml.length,
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    console.info('[SNAPSHOT][REBUILD]', {
      inviteId,
      version: nextVersion,
      rebuiltAt: nowIso,
      rebuiltBy: adminUid,
      normalization: normalized.diagnostics.canonical,
      blocks: filteredBlocks.length,
      renderHtmlLength: finalHtml.length,
    })

    return NextResponse.json({
      ok: true,
      inviteId,
      snapshotVersion: nextVersion,
      rebuiltAt: nowIso,
      blocksCount: filteredBlocks.length,
      renderHtmlLength: finalHtml.length,
      draftLinking,
      requiredFieldsStatus: REQUIRED_CANONICAL_FIELDS.map((key) => ({
        key,
        value: String((normalized?.diagnostics?.canonical as any)?.[key] || ''),
        present: Boolean(String((normalized?.diagnostics?.canonical as any)?.[key] || '').trim()),
      })),
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to rebuild snapshot' }, { status })
  }
}
