import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { loadPresetFromFirestore } from '@/lib/template-presets/loader'
import type { TemplatePreset, TemplateType, TextBlock } from '@/lib/template-presets/types'

export const runtime = 'nodejs'

const DEFAULT_NO_KIDS_ICON = '/icons/no-kids.svg'
const DEFAULT_NO_PHOTOGRAPHY_ICON = '/icons/no-photo.svg'

type RuleIconKind = 'noKids' | 'noPhotography'

function getTargetVisibility(kind: RuleIconKind) {
  return kind === 'noKids' ? 'noKids' : 'noPhotography'
}

function applyIconToPreset(preset: TemplatePreset, kind: RuleIconKind, iconUrl: string) {
  const targetField = getTargetVisibility(kind)
  const updatedBlocks = preset.textBlocks.map((block) => {
    const isTarget =
      block.visibleWhenField === targetField ||
      (kind === 'noKids' && block.id === 'icon_no_kids') ||
      (kind === 'noPhotography' && block.id === 'icon_no_photography')
    if (!isTarget) return block
    return {
      ...block,
      kind: 'image',
      visibleWhenField: targetField,
      imageSrc: iconUrl,
    } as TextBlock
  })
  return {
    ...preset,
    textBlocks: updatedBlocks,
  }
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  const bucket = getAdminBucket()
  if (!app || !adminDb || !bucket) throw new Error('Admin SDK not configured')

  const decoded = await getAuth(app).verifyIdToken(token)
  if (!decoded?.uid || !isAdminEmailServer(decoded.email)) throw new Error('Unauthorized')

  return { decoded, adminDb, bucket }
}

export async function GET(request: NextRequest) {
  try {
    const { adminDb } = await verifyAdmin(request)
    const settingsRef = adminDb.collection('systemSettings').doc('uiAssets')
    const settingsSnap = await settingsRef.get()
    const data = settingsSnap.exists ? (settingsSnap.data() as any) : {}

    return NextResponse.json({
      noKidsUrl: data?.ruleIcons?.noKidsUrl || DEFAULT_NO_KIDS_ICON,
      noPhotographyUrl: data?.ruleIcons?.noPhotographyUrl || DEFAULT_NO_PHOTOGRAPHY_ICON,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load icons' }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { decoded, adminDb, bucket } = await verifyAdmin(request)
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const kind = formData.get('kind') as RuleIconKind | null

    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    if (!kind || !['noKids', 'noPhotography'].includes(kind)) {
      return NextResponse.json({ error: 'Invalid icon kind' }, { status: 400 })
    }
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }

    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : 'png'
    const filePath = `global-icons/rules/${kind}-${Date.now()}.${ext}`
    const fileRef = bucket.file(filePath)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fileRef.save(buffer, {
      metadata: { contentType: file.type || 'application/octet-stream' },
    })
    try {
      await fileRef.makePublic()
    } catch (error) {
      console.warn('⚠️ [API][RULE_ICONS] makePublic warning:', error)
    }

    const [signedIconUrl] = await fileRef.getSignedUrl({
      action: 'read',
      expires: '01-01-2035',
    })
    const iconUrl = signedIconUrl

    const settingsRef = adminDb.collection('systemSettings').doc('uiAssets')
    await settingsRef.set(
      {
        ruleIcons: {
          [`${kind}Url`]: iconUrl,
        },
        updatedAt: new Date(),
        updatedBy: decoded.uid,
      },
      { merge: true }
    )

    const presetTypes: TemplateType[] = ['A', 'B', 'C']
    for (const type of presetTypes) {
      const basePreset = await loadPresetFromFirestore(type)
      const updatedPreset = applyIconToPreset(basePreset, kind, iconUrl)
      await adminDb.collection('presets').doc(type).set(
        {
          ...updatedPreset,
          updatedAt: new Date(),
          updatedBy: decoded.uid,
        },
        { merge: false }
      )
    }

    const templatesSnap = await adminDb.collection('templates').get()
    const writes: Promise<any>[] = []
    templatesSnap.docs.forEach((templateDoc) => {
      const data = templateDoc.data() as any
      const override = data?.presetOverride as TemplatePreset | undefined
      if (!override) return
      const updatedOverride = applyIconToPreset(override, kind, iconUrl)
      const before = JSON.stringify(override.textBlocks || [])
      const after = JSON.stringify(updatedOverride.textBlocks || [])
      if (before === after) return
      writes.push(
        templateDoc.ref.set(
          {
            presetOverride: updatedOverride,
            presetOverrideUpdatedAt: new Date(),
            updatedAt: new Date(),
          },
          { merge: true }
        )
      )
    })
    if (writes.length) await Promise.all(writes)

    const settingsSnap = await settingsRef.get()
    const settingsData = settingsSnap.exists ? (settingsSnap.data() as any) : {}
    return NextResponse.json({
      ok: true,
      noKidsUrl: settingsData?.ruleIcons?.noKidsUrl || DEFAULT_NO_KIDS_ICON,
      noPhotographyUrl: settingsData?.ruleIcons?.noPhotographyUrl || DEFAULT_NO_PHOTOGRAPHY_ICON,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to update icons' }, { status })
  }
}
