import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import type { TemplatePreset, TemplateType } from '@/lib/template-presets/types'
import { loadPresetFromFirestore, mergePresetWithBase } from '@/lib/template-presets/loader'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const app = getAdminApp()
    const adminDb = getAdminFirestore()
    if (!app || !adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid || !isAdminEmailServer(decoded.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { presetType, preset, templateId } = await request.json()
    if (!presetType || !['A', 'B', 'C'].includes(presetType) || !preset) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    if (templateId) {
      const templateRef = adminDb.collection('templates').doc(templateId)
      const templateDoc = await templateRef.get()
      if (!templateDoc.exists) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      await templateRef.set(
        {
          presetOverride: preset,
          presetOverrideUpdatedAt: new Date(),
          presetOverrideUpdatedBy: decoded.uid,
          updatedAt: new Date(),
        },
        { merge: true }
      )
      return NextResponse.json({ ok: true, scope: 'template', templateId })
    }

    await adminDb.collection('presets').doc(presetType).set({
      ...preset,
      updatedAt: new Date(),
      updatedBy: decoded.uid,
    })

    // Keep template-specific overrides in sync by appending any newly added blocks from the base type preset.
    const templatesSnap = await adminDb.collection('templates').where('type', '==', presetType).get()
    const nextBasePreset = await loadPresetFromFirestore(presetType as TemplateType)
    const syncWrites: Promise<any>[] = []
    templatesSnap.docs.forEach((templateDoc) => {
      const templateData = templateDoc.data() as any
      const templateOverride = templateData?.presetOverride as TemplatePreset | undefined
      if (!templateOverride) return
      const mergedOverride = mergePresetWithBase(nextBasePreset, templateOverride)
      const beforeCount = Array.isArray(templateOverride.textBlocks) ? templateOverride.textBlocks.length : 0
      const afterCount = Array.isArray(mergedOverride.textBlocks) ? mergedOverride.textBlocks.length : 0
      if (afterCount > beforeCount) {
        syncWrites.push(
          templateDoc.ref.set(
            {
              presetOverride: mergedOverride,
              presetOverrideSyncedAt: new Date(),
              updatedAt: new Date(),
            },
            { merge: true }
          )
        )
      }
    })
    if (syncWrites.length > 0) {
      await Promise.all(syncWrites)
    }

    return NextResponse.json({ ok: true, scope: 'type', presetType })
  } catch (error: any) {
    console.error('❌ [API][ADMIN][PRESETS] Save failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to save preset' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const presetType = request.nextUrl.searchParams.get('type')?.toUpperCase()
    const templateId = request.nextUrl.searchParams.get('templateId') || ''
    if (!presetType || !['A', 'B', 'C'].includes(presetType)) {
      return NextResponse.json({ error: 'Invalid preset type' }, { status: 400 })
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    if (templateId) {
      const templateDoc = await adminDb.collection('templates').doc(templateId).get()
      if (!templateDoc.exists) {
        return NextResponse.json({ error: 'Template not found' }, { status: 404 })
      }
      const templateData = templateDoc.data() || {}
      if (templateData.presetOverride) {
        const basePreset = await loadPresetFromFirestore(presetType as TemplateType)
        const mergedPreset = mergePresetWithBase(basePreset, templateData.presetOverride as TemplatePreset)
        return NextResponse.json({
          ok: true,
          preset: mergedPreset,
          scope: 'template',
          templateId,
          inherited: false,
        })
      }
    }

    const presetDoc = await adminDb.collection('presets').doc(presetType).get()
    if (!presetDoc.exists) {
      return NextResponse.json({
        ok: true,
        preset: null,
        scope: templateId ? 'template-inherited' : 'type',
        templateId: templateId || undefined,
      })
    }

    const data = presetDoc.data() || {}
    const { updatedAt, updatedBy, ...preset } = data
    return NextResponse.json({
      ok: true,
      preset,
      meta: { updatedAt, updatedBy },
      scope: templateId ? 'template-inherited' : 'type',
      templateId: templateId || undefined,
      inherited: !!templateId,
    })
  } catch (error: any) {
    console.error('❌ [API][ADMIN][PRESETS] Load failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to load preset' },
      { status: 500 }
    )
  }
}
