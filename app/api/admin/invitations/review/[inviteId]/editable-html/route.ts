import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
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
  sanitizeRenderFieldsByTemplateType,
  sanitizeForFirestore,
  type FinalInvitationSnapshot,
  type SnapshotTemplateType,
} from '@/lib/workshop/snapshot'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'

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
}

export async function GET(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const internalRef = adminDb.collection('invitation_internal').doc(inviteId)
    const internalSnap = await internalRef.get()
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
    const snapshot = (internal?.finalInvitationSnapshot || null) as FinalInvitationSnapshot | null
    const inviteSnap = await adminDb.collection('invites').doc(inviteId).get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)
    const invite = inviteSnap.data() as any

    const mergeFieldsWithFallback = (preferred: RenderFields, fallback: RenderFields): RenderFields => {
      const merged: RenderFields = { ...fallback, ...preferred }
      const keys = new Set<string>([
        ...Object.keys((fallback || {}) as Record<string, unknown>),
        ...Object.keys((preferred || {}) as Record<string, unknown>),
      ])
      for (const key of keys) {
        const pref = String((preferred as any)?.[key] ?? '').trim()
        const fb = String((fallback as any)?.[key] ?? '').trim()
        ;(merged as any)[key] = pref || fb
      }
      return merged
    }

    if (snapshot?.templateId && snapshot?.fields) {
      const templateDoc = await adminDb.collection('templates').doc(String(snapshot.templateId)).get()
      if (!templateDoc.exists) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      const template = { id: templateDoc.id, ...templateDoc.data() } as Template
      const templateType = (snapshot?.templateType || template.type || 'A') as SnapshotTemplateType
      const { loadPresetFromFirestore, mergePresetWithBase } = await import('@/lib/template-presets/loader')
      const basePreset = await loadPresetFromFirestore(template.type)
      const preset = template.presetOverride ? mergePresetWithBase(basePreset, template.presetOverride) : basePreset
      const opts = (snapshot.renderOptions || {}) as any
      const inviteFields = buildRenderFieldsFromInvite(invite)
      const mergedFields = sanitizeRenderFieldsByTemplateType(
        mergeFieldsWithFallback(snapshot.fields || {}, inviteFields),
        templateType
      )
      const firstHtml = await generateHTML(
        preset,
        String(snapshot.backgroundUrl || template?.assets?.backgroundUrl || ''),
        mergedFields,
        {
          assetBaseUrl: request.nextUrl.origin,
          layoutB: opts.layoutB,
          blockStyleOverrides: opts.blockStyleOverrides || {},
          blockPositionOverrides: opts.blockPositionOverrides || {},
        }
      )
      const extracted = extractBlocksFromRenderHtml(firstHtml)
      const blocks = ensureBlocksFromPreset(extracted, mergedFields, preset, opts, templateType)
      const filteredBlocks = filterSnapshotBlocksByTemplateType(blocks, templateType)
      const completedFields: RenderFields = sanitizeRenderFieldsByTemplateType(
        applyBlocksToFields(mergedFields, filteredBlocks, templateType),
        templateType
      )
      const completedOptions = deriveRenderOptionsFromBlocks(filteredBlocks, opts.layoutB)
      const finalHtml = await generateHTML(
        preset,
        String(snapshot.backgroundUrl || template?.assets?.backgroundUrl || ''),
        completedFields,
        {
          assetBaseUrl: request.nextUrl.origin,
          layoutB: (completedOptions as any).layoutB,
          blockStyleOverrides: (completedOptions as any).blockStyleOverrides || {},
          blockPositionOverrides: (completedOptions as any).blockPositionOverrides || {},
        }
      )
      await internalRef.set(
        {
          finalInvitationSnapshot: sanitizeForFirestore({
            ...snapshot,
            templateType,
            backgroundUrl: String(snapshot.backgroundUrl || template?.assets?.backgroundUrl || ''),
            fields: completedFields,
            blocks: filteredBlocks,
            renderOptions: completedOptions,
            updatedAt: new Date().toISOString(),
          }),
        },
        { merge: true }
      )
      return NextResponse.json({ ok: true, html: finalHtml, snapshotReady: true })
    }

    // One-time migration for legacy invites with no snapshot.
    let fields = buildRenderFieldsFromInvite(invite)
    let warnings = getCriticalFieldWarnings(fields)
    if (warnings.length) {
      // No draft fallback by owner/template is allowed; must be tied to same invite only.
      // Legacy invite must contain its own source data (invite/formData) before snapshot migration.
      fields = buildRenderFieldsFromInvite(invite)
      warnings = getCriticalFieldWarnings(fields)
    }
    if (warnings.length) {
      return NextResponse.json(
        {
          error: `Legacy invite requires data completion before workshop. Missing fields: ${warnings.join(', ')}`,
          warnings,
        },
        { status: 409 }
      )
    }

    const templateId = String(invite?.designId || '').trim()
    if (!templateId) return NextResponse.json({ error: 'Invite designId is missing' }, { status: 409 })
    const templateDoc = await adminDb.collection('templates').doc(templateId).get()
    if (!templateDoc.exists) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    const template = { id: templateDoc.id, ...templateDoc.data() } as Template
    const templateType = (template.type || 'A') as SnapshotTemplateType

    const { loadPresetFromFirestore, mergePresetWithBase } = await import('@/lib/template-presets/loader')
    const basePreset = await loadPresetFromFirestore(template.type)
    const preset = template.presetOverride ? mergePresetWithBase(basePreset, template.presetOverride) : basePreset
    const designer = internal?.workshopDesigner || {}
    const renderOptions = {
      assetBaseUrl: request.nextUrl.origin,
      layoutB: designer?.layoutB || template.layoutB,
      blockStyleOverrides: designer?.blockStyleOverrides || {},
      blockPositionOverrides: designer?.blockPositionOverrides || {},
    }
    const firstHtml = await generateHTML(preset, String(template?.assets?.backgroundUrl || ''), fields, renderOptions)
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
    const nextSnapshot: FinalInvitationSnapshot = {
      version: 1,
      templateId,
      templateType,
      variant: 'whatsapp_1080x1920',
      canvas: { width: 1080, height: 1920 },
      backgroundUrl: String(template?.assets?.backgroundUrl || ''),
      fields: normalizedFields,
      renderOptions: normalizedOptions,
      blocks: filteredBlocks,
      createdAt: nowIso,
      updatedAt: nowIso,
    }
    await internalRef.set(
      {
        finalInvitationSnapshot: sanitizeForFirestore(nextSnapshot),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, html: finalHtml, snapshotReady: true, migrated: true })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load editable html' }, { status })
  }
}
