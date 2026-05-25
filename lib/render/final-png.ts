import { getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import type { Template } from '@/lib/firebase/types'
import { generateHTML, type RenderFields } from '@/lib/render/engine'
import { formatDateForInvitation } from '@/lib/render/date-format'
import { renderHtmlToPngBuffer } from '@/lib/pdf/render-html-screenshot'

export type RenderFinalPngInput = {
  templateId: string
  variant?: string
  fields: Record<string, unknown>
  renderOptions?: {
    layoutB?: unknown
    blockStyleOverrides?: Record<string, unknown>
    blockPositionOverrides?: Record<string, unknown>
  }
  assetBaseUrl: string
}

function mapRenderFields(rawFields: Record<string, unknown>): RenderFields {
  const formattedDate = formatDateForInvitation(
    String(rawFields?.date || rawFields?.dateText || rawFields?.date_en || '')
  )
  return {
    groomNameAr: rawFields?.groomNameAr as string | undefined,
    brideNameAr: rawFields?.brideNameAr as string | undefined,
    groomNameEn: rawFields?.groomNameEn as string | undefined,
    brideNameEn: rawFields?.brideNameEn as string | undefined,
    dateText: (rawFields?.dateText as string) || formattedDate,
    date_en: (rawFields?.date_en as string) || (rawFields?.dateText as string) || formattedDate,
    venueText: rawFields?.venueText as string | undefined,
    location_name: (rawFields?.location_name as string) || (rawFields?.venueText as string),
    verse_or_dua: rawFields?.verse_or_dua as string | undefined,
    intro_text: rawFields?.intro_text as string | undefined,
    invite_line: rawFields?.invite_line as string | undefined,
    motherOfBride: rawFields?.motherOfBride as string | undefined,
    motherOfGroom: rawFields?.motherOfGroom as string | undefined,
    fatherOfBride: rawFields?.fatherOfBride as string | undefined,
    fatherOfGroom: rawFields?.fatherOfGroom as string | undefined,
    weddingDayLine: rawFields?.weddingDayLine as string | undefined,
    fullDateLine: rawFields?.fullDateLine as string | undefined,
    hallLocation: (rawFields?.hallLocation as string) || (rawFields?.venueText as string),
    receptionTime: rawFields?.receptionTime as string | undefined,
    zaffaTime: rawFields?.zaffaTime as string | undefined,
    noKids: rawFields?.noKids as string | undefined,
    noPhotography: rawFields?.noPhotography as string | undefined,
  }
}

/** Render invite HTML to PNG and upload to Firebase Storage (no HTTP hop). */
export async function renderFinalPngToStorage(input: RenderFinalPngInput): Promise<string> {
  const { templateId, variant = 'whatsapp_1080x1920', renderOptions, assetBaseUrl } = input
  const fields = mapRenderFields(input.fields)

  const adminDb = getAdminFirestore()
  if (!adminDb) throw new Error('Database not configured')

  const templateDoc = await adminDb.collection('templates').doc(templateId).get()
  if (!templateDoc.exists) throw new Error('Template not found')

  const template = { id: templateDoc.id, ...templateDoc.data() } as Template
  const { loadPresetFromFirestore, mergePresetWithBase } = await import('@/lib/template-presets/loader')
  const basePreset = await loadPresetFromFirestore(template.type)
  const preset = template.presetOverride ? mergePresetWithBase(basePreset, template.presetOverride) : basePreset

  const settingsSnap = await adminDb.collection('systemSettings').doc('uiAssets').get()
  const settingsData = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : {}
  const ruleIcons = {
    noKidsUrl: String((settingsData?.ruleIcons as Record<string, unknown>)?.noKidsUrl || ''),
    noPhotographyUrl: String((settingsData?.ruleIcons as Record<string, unknown>)?.noPhotographyUrl || ''),
  }

  const html = await generateHTML(preset, template.assets.backgroundUrl, fields, {
    assetBaseUrl,
    layoutB: (renderOptions?.layoutB || template.layoutB) as Template['layoutB'],
    blockStyleOverrides: (renderOptions?.blockStyleOverrides || {}) as Record<
      string,
      { color?: string; fontFamily?: string; fontWeight?: number; fontSize?: number }
    >,
    blockPositionOverrides: (renderOptions?.blockPositionOverrides || {}) as Record<
      string,
      { xPx: number; yPx: number }
    >,
    ruleIcons,
  })

  const screenshot = await renderHtmlToPngBuffer(html, {
    width: 1080,
    height: 1920,
    deviceScaleFactor: 3,
  })

  const bucket = getAdminBucket()
  if (!bucket) throw new Error('Storage not configured')

  const renderId = crypto.randomUUID()
  const fileName = `outputs/${renderId}/final.png`
  const fileRef = bucket.file(fileName)
  await fileRef.save(screenshot, { metadata: { contentType: 'image/png' } })

  try {
    await fileRef.makePublic()
  } catch {
    // public ACL may be disabled; signed URLs can be used later
  }

  const cleanFields: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && value !== '') cleanFields[key] = value
  }

  await adminDb.collection('renders').add({
    templateId,
    variant,
    fields: cleanFields,
    status: 'completed',
    outputUrl: `https://storage.googleapis.com/${bucket.name}/${fileName}`,
    createdAt: new Date(),
  })

  return `https://storage.googleapis.com/${bucket.name}/${fileName}`
}
