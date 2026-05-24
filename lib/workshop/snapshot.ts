import type { RenderFields, RenderOptions } from '@/lib/render/engine'

export type SnapshotTemplateType = 'A' | 'B' | 'C'
export type SnapshotBlockType = 'shared' | 'wedding_only' | 'engagement_only'

export type SnapshotBlock = {
  id: string
  kind: 'text'
  type?: SnapshotBlockType
  content: string
  xPx: number
  yPx: number
  wPx: number
  hPx: number
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
  direction: 'rtl' | 'ltr'
  visible: boolean
}

export type FinalInvitationSnapshot = {
  version: number
  templateId: string
  templateType?: SnapshotTemplateType
  variant: string
  canvas: { width: number; height: number }
  backgroundUrl: string
  fields: RenderFields
  renderOptions: RenderOptions
  blocks: SnapshotBlock[]
  renderHtml?: string
  createdAt: string
  updatedAt: string
}

const WEDDING_ONLY_BLOCK_IDS = new Set<string>(['zaffa_time', 'wedding_day_line', 'bride_entry', 'groom_entry'])
const ENGAGEMENT_ONLY_BLOCK_IDS = new Set<string>([])
const WEDDING_TERMS_REGEX = /(زفاف|زواج|الزفة)/u

function classifyBlockTypeById(blockId: string): SnapshotBlockType {
  const id = String(blockId || '').trim()
  if (!id) return 'shared'
  if (WEDDING_ONLY_BLOCK_IDS.has(id)) return 'wedding_only'
  if (ENGAGEMENT_ONLY_BLOCK_IDS.has(id)) return 'engagement_only'
  return 'shared'
}

function hasWeddingTerms(text: string): boolean {
  return WEDDING_TERMS_REGEX.test(String(text || '').trim())
}

export function sanitizeRenderFieldsByTemplateType(
  rawFields: RenderFields,
  templateType: SnapshotTemplateType
): RenderFields {
  const fields = { ...(rawFields || {}) } as RenderFields & Record<string, any>
  if (templateType === 'B') {
    fields.zaffaTime = ''
    fields.weddingDayLine = ''
    if ('brideEntry' in fields) fields.brideEntry = ''
    if ('groomEntry' in fields) fields.groomEntry = ''
  }
  if (templateType === 'A') {
    if ('engagementDate' in fields) fields.engagementDate = ''
  }
  return fields
}

export function filterSnapshotBlocksByTemplateType(
  rawBlocks: SnapshotBlock[],
  templateType: SnapshotTemplateType
): SnapshotBlock[] {
  const blocks = Array.isArray(rawBlocks) ? rawBlocks : []
  return blocks.filter((block) => {
    const blockType = block?.type || classifyBlockTypeById(String(block?.id || ''))
    if (templateType === 'B') {
      if (blockType === 'wedding_only') return false
      if (hasWeddingTerms(String(block?.content || ''))) return false
    }
    if (templateType === 'A') {
      if (blockType === 'engagement_only') return false
    }
    return true
  })
}

export type NormalizeSnapshotDiagnostics = {
  rawInviteKeys: string[]
  rawFormDataKeys: string[]
  canonical: {
    groomNameAr: string
    brideNameAr: string
    dateText: string
    hallLocation: string
    weddingDayLine: string
    receptionTime: string
    zaffaTime: string
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
}

export function pickText(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function formatSelectedTime12(hour: string, minute: string, period: string): string {
  const rawHour = String(hour || '').trim()
  if (!rawHour) return ''
  const hourNum = Math.min(12, Math.max(1, Number(rawHour) || 1))
  const minuteSafe = String(minute || '').trim() === '30' ? '30' : '00'
  const periodNorm = String(period || '').trim().toUpperCase()
  const periodLabel = periodNorm === 'AM' ? 'ص' : 'م'
  return `${hourNum}:${minuteSafe} ${periodLabel}`
}

function withLabel(label: string, value: string): string {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.startsWith(label)) return text
  return `${label} ${text}`.trim()
}

export function buildRenderFieldsFromInvite(invite: any): RenderFields {
  return normalizeInviteFieldsForSnapshot(invite).fields
}

function asRecord(input: unknown): Record<string, any> {
  return input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, any>) : {}
}

function readPath(source: Record<string, any>, path: string): unknown {
  const parts = path.split('.')
  let current: any = source
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined
    current = current[part]
  }
  return current
}

function firstFromPaths(source: Record<string, any>, paths: string[]): string {
  for (const path of paths) {
    const value = readPath(source, path)
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

export function normalizeInviteFieldsForSnapshot(
  invite: any,
  formDataInput?: Record<string, any>
): { fields: RenderFields; diagnostics: NormalizeSnapshotDiagnostics } {
  const inviteObj = asRecord(invite)
  const formData = asRecord(
    formDataInput ||
      inviteObj.formData ||
      inviteObj.form ||
      inviteObj.invitationForm ||
      inviteObj.inviteForm ||
      inviteObj.payload?.formData
  )

  const groomNameAr = pickText(
    firstFromPaths(inviteObj, ['groomNameAr', 'groomName', 'groom_name', 'fields.groomNameAr']),
    firstFromPaths(formData, ['groomNameAr', 'groomName', 'groom_name'])
  )
  const brideNameAr = pickText(
    firstFromPaths(inviteObj, ['brideNameAr', 'brideName', 'bride_name', 'fields.brideNameAr']),
    firstFromPaths(formData, ['brideNameAr', 'brideName', 'bride_name'])
  )
  const fatherOfBride = pickText(
    firstFromPaths(inviteObj, ['fatherOfBride', 'brideFatherName', 'father_of_bride']),
    firstFromPaths(formData, ['fatherOfBride', 'brideFatherName', 'father_of_bride'])
  )
  const fatherOfGroom = pickText(
    firstFromPaths(inviteObj, ['fatherOfGroom', 'groomFatherName', 'father_of_groom']),
    firstFromPaths(formData, ['fatherOfGroom', 'groomFatherName', 'father_of_groom'])
  )
  const motherOfBride = pickText(
    firstFromPaths(inviteObj, ['motherOfBride', 'mother_of_bride']),
    firstFromPaths(formData, ['motherOfBride', 'mother_of_bride'])
  )
  const motherOfGroom = pickText(
    firstFromPaths(inviteObj, ['motherOfGroom', 'mother_of_groom']),
    firstFromPaths(formData, ['motherOfGroom', 'mother_of_groom'])
  )
  const fullDateLine = pickText(
    firstFromPaths(inviteObj, ['fullDateLine', 'full_date_line']),
    firstFromPaths(formData, ['fullDateLine', 'full_date_line'])
  )
  const dateText = pickText(
    firstFromPaths(inviteObj, ['dateText', 'engagementDate', 'date', 'date_en']),
    firstFromPaths(formData, ['dateText', 'engagementDate', 'date', 'date_en']),
    fullDateLine
  )
  const weddingDayLine = pickText(
    firstFromPaths(inviteObj, ['weddingDayLine', 'wedding_day_line']),
    firstFromPaths(formData, ['weddingDayLine', 'wedding_day_line']),
    firstFromPaths(formData, ['weddingDay']) ? `وذلك بمشيئة الله تعالى يوم ${firstFromPaths(formData, ['weddingDay'])}` : ''
  )
  const hallLocation = pickText(
    firstFromPaths(inviteObj, ['hallLocation', 'locationText', 'venueText', 'hallName', 'locationName', 'location_name']),
    firstFromPaths(formData, ['hallLocation', 'locationText', 'venueText', 'hallName', 'locationName', 'location_name'])
  )
  const venueText = pickText(
    firstFromPaths(inviteObj, ['venueText', 'locationText', 'locationName']),
    firstFromPaths(formData, ['venueText', 'locationText', 'hallLocation', 'locationName'])
  )
  const locationName = pickText(
    firstFromPaths(inviteObj, ['location_name', 'locationName', 'hallLocation', 'venueText']),
    firstFromPaths(formData, ['location_name', 'locationName', 'hallLocation', 'locationText', 'venueText'])
  )

  const receptionRaw = pickText(
    firstFromPaths(inviteObj, ['receptionTime', 'reception_time', 'time']),
    firstFromPaths(formData, ['receptionTime', 'reception_time', 'time'])
  )
  const receptionComposed = formatSelectedTime12(
    firstFromPaths(formData, ['receptionHour', 'reception_hour']),
    firstFromPaths(formData, ['receptionMinute', 'reception_minute']) || '00',
    firstFromPaths(formData, ['receptionPeriod', 'reception_period']) || 'PM'
  )
  const receptionTime = withLabel('الاستقبال', pickText(receptionRaw, receptionComposed))

  const zaffaRaw = pickText(
    firstFromPaths(inviteObj, ['zaffaTime', 'zaffa_time']),
    firstFromPaths(formData, ['zaffaTime', 'zaffa_time'])
  )
  const zaffaComposed = formatSelectedTime12(
    firstFromPaths(formData, ['zaffaHour', 'zaffa_hour']),
    firstFromPaths(formData, ['zaffaMinute', 'zaffa_minute']) || '00',
    firstFromPaths(formData, ['zaffaPeriod', 'zaffa_period']) || 'PM'
  )
  const zaffaTime = withLabel('الزفة', pickText(zaffaRaw, zaffaComposed))
  const invitationType = pickText(
    firstFromPaths(inviteObj, ['invitationType']),
    firstFromPaths(formData, ['invitationType'])
  ).toLowerCase()
  const selectedOccasion = pickText(firstFromPaths(inviteObj, ['selectedOccasion', 'occasionType']))
  const isEngagement = selectedOccasion === 'engagement'
  const isAnnouncementOnly = isEngagement && invitationType === 'announcement'

  const fields: RenderFields = {
    groomNameAr,
    brideNameAr,
    fatherOfBride,
    fatherOfGroom,
    motherOfBride: isEngagement ? '' : motherOfBride,
    motherOfGroom: isEngagement ? '' : motherOfGroom,
    dateText,
    date_en: pickText(firstFromPaths(inviteObj, ['date_en', 'date', 'dateText']), firstFromPaths(formData, ['date_en', 'date', 'dateText']), dateText),
    fullDateLine,
    weddingDayLine: isEngagement ? '' : weddingDayLine,
    hallLocation: isAnnouncementOnly ? '' : hallLocation,
    venueText: isAnnouncementOnly ? '' : pickText(venueText, hallLocation),
    location_name: isAnnouncementOnly ? '' : pickText(locationName, hallLocation, venueText),
    receptionTime: isAnnouncementOnly ? '' : receptionTime,
    zaffaTime: isEngagement ? '' : zaffaTime,
    intro_text: pickText(firstFromPaths(inviteObj, ['introText', 'intro_text']), firstFromPaths(formData, ['introText', 'intro_text'])),
    invite_line: pickText(firstFromPaths(inviteObj, ['inviteLine', 'invite_line']), firstFromPaths(formData, ['inviteLine', 'invite_line'])),
    verse_or_dua: pickText(firstFromPaths(inviteObj, ['verseOrDua', 'verse_or_dua']), firstFromPaths(formData, ['verseOrDua', 'verse_or_dua'])),
    noKids: pickText(firstFromPaths(inviteObj, ['noKids', 'no_kids']), firstFromPaths(formData, ['noKids', 'no_kids'])),
    noPhotography: pickText(
      firstFromPaths(inviteObj, ['noPhotography', 'no_photography']),
      firstFromPaths(formData, ['noPhotography', 'no_photography'])
    ),
  }

  const diagnostics: NormalizeSnapshotDiagnostics = {
    rawInviteKeys: Object.keys(inviteObj).sort(),
    rawFormDataKeys: Object.keys(formData).sort(),
    canonical: {
      groomNameAr: fields.groomNameAr || '',
      brideNameAr: fields.brideNameAr || '',
      dateText: fields.dateText || '',
      hallLocation: fields.hallLocation || '',
      weddingDayLine: fields.weddingDayLine || '',
      receptionTime: fields.receptionTime || '',
      zaffaTime: fields.zaffaTime || '',
    },
  }
  return { fields, diagnostics }
}

export function getCriticalFieldWarnings(fields: RenderFields): string[] {
  const warnings: string[] = []
  if (!pickText(fields.groomNameAr)) warnings.push('groomNameAr')
  if (!pickText(fields.brideNameAr)) warnings.push('brideNameAr')
  if (!pickText(fields.dateText, fields.date_en, fields.date)) warnings.push('dateText')
  if (!pickText(fields.hallLocation, fields.location_name, fields.venueText)) warnings.push('hallLocation')
  return warnings
}

function parseStyleMap(styleText: string) {
  const map: Record<string, string> = {}
  for (const part of String(styleText || '').split(';')) {
    const [rawKey, ...rest] = part.split(':')
    const key = String(rawKey || '').trim().toLowerCase()
    if (!key) continue
    map[key] = rest.join(':').trim()
  }
  return map
}

function numPx(input: string, fallback = 0) {
  const cleaned = String(input || '').replace('px', '').trim()
  const value = Number(cleaned)
  return Number.isFinite(value) ? value : fallback
}

export function extractBlocksFromRenderHtml(html: string): SnapshotBlock[] {
  const blocks: SnapshotBlock[] = []
  const regex =
    /<div[^>]*class="text-block"[^>]*data-block-id="([^"]+)"[^>]*style="([\s\S]*?)"[^>]*>([\s\S]*?)<\/div>/g
  let match: RegExpExecArray | null = regex.exec(html)
  while (match) {
    const id = String(match[1] || '').trim()
    const styleMap = parseStyleMap(match[2] || '')
    const rawInner = String(match[3] || '')
      .replace(/<div[\s\S]*?<\/div>/g, '')
      .replace(/<span[\s\S]*?<\/span>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim()
    const content = decodeHtmlEntities(rawInner)
    blocks.push({
      id,
      kind: 'text',
      type: classifyBlockTypeById(id),
      content,
      xPx: Math.round(numPx(styleMap['left'])),
      yPx: Math.round(numPx(styleMap['top'])),
      wPx: Math.round(numPx(styleMap['width'], 0)),
      hPx: Math.round(numPx(styleMap['height'], 0)),
      fontFamily: String(styleMap['font-family'] || '').replace(/['"]/g, '').trim(),
      fontSize: Math.max(8, Math.round(numPx(styleMap['font-size'], 16))),
      fontWeight: Math.max(100, Math.round(Number(styleMap['font-weight'] || 400))),
      color: String(styleMap['color'] || '').trim(),
      align: (String(styleMap['text-align'] || 'center') as 'left' | 'center' | 'right'),
      lineHeight: Math.max(0.8, Number(styleMap['line-height'] || 1.2)),
      direction: (String(styleMap['direction'] || 'rtl') as 'rtl' | 'ltr'),
      visible: true,
    })
    match = regex.exec(html)
  }
  return blocks
}

const REQUIRED_TEXT_BLOCK_IDS = [
  'groom_name',
  'bride_name',
  'father_of_groom',
  'father_of_bride',
  'mother_of_groom',
  'mother_of_bride',
  'date',
  'full_date_line',
  'wedding_day_line',
  'zaffa_time',
  'reception_time',
  'hall_location',
  'venue',
  'location_name',
]

const GENERIC_FALLBACK_POSITIONS: Record<string, { xPct: number; yPct: number; wPct: number; hPct: number; size: number }> = {
  wedding_day_line: { xPct: 0.08, yPct: 0.52, wPct: 0.84, hPct: 0.06, size: 30 },
  full_date_line: { xPct: 0.08, yPct: 0.585, wPct: 0.84, hPct: 0.06, size: 28 },
  hall_location: { xPct: 0.08, yPct: 0.67, wPct: 0.84, hPct: 0.06, size: 30 },
  reception_time: { xPct: 0.08, yPct: 0.735, wPct: 0.84, hPct: 0.055, size: 27 },
  zaffa_time: { xPct: 0.08, yPct: 0.792, wPct: 0.84, hPct: 0.055, size: 27 },
}

function fieldTextForBlockId(fields: RenderFields, blockId: string) {
  switch (blockId) {
    case 'groom_name':
      return pickText(fields.groomNameAr)
    case 'bride_name':
      return pickText(fields.brideNameAr)
    case 'father_of_groom':
      return pickText(fields.fatherOfGroom)
    case 'father_of_bride':
      return pickText(fields.fatherOfBride)
    case 'mother_of_groom':
      return pickText(fields.motherOfGroom)
    case 'mother_of_bride':
      return pickText(fields.motherOfBride)
    case 'date':
    case 'date_en':
      return pickText(fields.dateText, fields.date_en, fields.date)
    case 'full_date_line':
      return pickText(fields.fullDateLine)
    case 'wedding_day_line':
      return pickText(fields.weddingDayLine)
    case 'zaffa_time':
      return pickText(fields.zaffaTime)
    case 'reception_time':
      return pickText(fields.receptionTime)
    case 'hall_location':
      return pickText(fields.hallLocation, fields.location_name, fields.venueText)
    case 'venue':
      return pickText(fields.venueText, fields.location_name, fields.hallLocation)
    case 'location_name':
      return pickText(fields.location_name, fields.venueText, fields.hallLocation)
    case 'intro_text':
      return pickText(fields.intro_text)
    case 'invite_line':
      return pickText(fields.invite_line)
    case 'verse_or_dua':
      return pickText(fields.verse_or_dua)
    default:
      return ''
  }
}

function layoutPositionForBlockId(blockId: string, layoutB: any): { xPx: number; yPx: number; fontSize?: number } | null {
  if (!layoutB) return null
  if (blockId === 'groom_name' && layoutB.groom) return layoutB.groom
  if (blockId === 'bride_name' && layoutB.bride) return layoutB.bride
  if ((blockId === 'date' || blockId === 'date_en') && layoutB.date) return layoutB.date
  return null
}

export function ensureBlocksFromPreset(
  extractedBlocks: SnapshotBlock[],
  fields: RenderFields,
  preset: any,
  renderOptions: RenderOptions = {},
  templateType: SnapshotTemplateType = 'A'
): SnapshotBlock[] {
  const next = [...extractedBlocks]
  const byId = new Map<string, SnapshotBlock>()
  for (const row of next) byId.set(row.id, row)

  const blocks = Array.isArray(preset?.textBlocks) ? preset.textBlocks : []
  const presetBlockIds = new Set<string>()
  for (const presetBlock of blocks) {
    if (!presetBlock || presetBlock.kind === 'image') continue
    const blockId = String(presetBlock.id || '').trim()
    if (!blockId) continue
    presetBlockIds.add(blockId)
    const text = fieldTextForBlockId(fields, blockId)
    const isRequired = REQUIRED_TEXT_BLOCK_IDS.includes(blockId)
    if (!text && !isRequired) continue

    const existing = byId.get(blockId)
    if (existing) {
      if (!existing.content && text) existing.content = text
      continue
    }

    const styleOverride = ((renderOptions?.blockStyleOverrides || {}) as any)?.[blockId] || {}
    const posOverride = ((renderOptions?.blockPositionOverrides || {}) as any)?.[blockId] || {}
    const layoutPos = layoutPositionForBlockId(blockId, (renderOptions as any)?.layoutB)

    const xFromPreset = Math.round(Number(presetBlock?.boxPct?.x || 0) * 1080)
    const yFromPreset = Math.round(Number(presetBlock?.boxPct?.y || 0) * 1920)
    const wFromPreset = Math.round(Number(presetBlock?.boxPct?.w || 0) * 1080)
    const hFromPreset = Math.round(Number(presetBlock?.boxPct?.h || 0) * 1920)

    const xPx = Number.isFinite(Number(posOverride?.xPx))
      ? Math.max(0, Math.round(Number(posOverride.xPx)))
      : Number.isFinite(Number(layoutPos?.xPx))
      ? Math.max(0, Math.round(Number(layoutPos?.xPx)))
      : xFromPreset
    const yPx = Number.isFinite(Number(posOverride?.yPx))
      ? Math.max(0, Math.round(Number(posOverride.yPx)))
      : Number.isFinite(Number(layoutPos?.yPx))
      ? Math.max(0, Math.round(Number(layoutPos?.yPx)))
      : yFromPreset
    const fontSize = Number.isFinite(Number(styleOverride?.fontSize))
      ? Math.max(8, Math.round(Number(styleOverride.fontSize)))
      : Number.isFinite(Number(layoutPos?.fontSize))
      ? Math.max(8, Math.round(Number(layoutPos?.fontSize)))
      : Math.max(8, Math.round(Number(presetBlock?.font?.baseSize || 16)))

    const row: SnapshotBlock = {
      id: blockId,
      kind: 'text',
      type: classifyBlockTypeById(blockId),
      content: text || '',
      xPx,
      yPx,
      wPx: Math.max(0, wFromPreset),
      hPx: Math.max(0, hFromPreset),
      fontFamily:
        String(styleOverride?.fontFamily || '').trim() ||
        String(presetBlock?.font?.familyName || '').trim() ||
        (String(presetBlock?.font?.familyKey || '') === 'english' ? 'Montserrat' : 'Amiri'),
      fontSize,
      fontWeight: Number.isFinite(Number(styleOverride?.fontWeight))
        ? Math.max(100, Math.round(Number(styleOverride.fontWeight)))
        : Math.max(100, Math.round(Number(presetBlock?.font?.weight || 400))),
      color: String(styleOverride?.color || '').trim() || String(presetBlock?.color || '').trim(),
      align: (String(presetBlock?.align || 'center') as 'left' | 'center' | 'right'),
      lineHeight: Math.max(0.8, Number(presetBlock?.lineHeight || 1.2)),
      direction: String(presetBlock?.font?.familyKey || '') === 'english' ? 'ltr' : 'rtl',
      visible: Boolean(text),
    }
    next.push(row)
    byId.set(blockId, row)
  }
  // If required field exists but template has no block for it, create a generic fallback block.
  for (const blockId of REQUIRED_TEXT_BLOCK_IDS) {
    if (byId.has(blockId)) continue
    if (presetBlockIds.has(blockId)) continue
    const text = fieldTextForBlockId(fields, blockId)
    if (!text) continue
    const generic = GENERIC_FALLBACK_POSITIONS[blockId]
    if (!generic) continue
    const styleOverride = ((renderOptions?.blockStyleOverrides || {}) as any)?.[blockId] || {}
    const posOverride = ((renderOptions?.blockPositionOverrides || {}) as any)?.[blockId] || {}
    const xPx = Number.isFinite(Number(posOverride?.xPx))
      ? Math.max(0, Math.round(Number(posOverride.xPx)))
      : Math.round(generic.xPct * 1080)
    const yPx = Number.isFinite(Number(posOverride?.yPx))
      ? Math.max(0, Math.round(Number(posOverride.yPx)))
      : Math.round(generic.yPct * 1920)
    const row: SnapshotBlock = {
      id: blockId,
      kind: 'text',
      type: classifyBlockTypeById(blockId),
      content: text,
      xPx,
      yPx,
      wPx: Math.round(generic.wPct * 1080),
      hPx: Math.round(generic.hPct * 1920),
      fontFamily: String(styleOverride?.fontFamily || 'Cairo').trim(),
      fontSize: Number.isFinite(Number(styleOverride?.fontSize))
        ? Math.max(8, Math.round(Number(styleOverride.fontSize)))
        : generic.size,
      fontWeight: Number.isFinite(Number(styleOverride?.fontWeight))
        ? Math.max(100, Math.round(Number(styleOverride.fontWeight)))
        : 500,
      color: String(styleOverride?.color || '#2E2E38').trim(),
      align: 'center',
      lineHeight: 1.3,
      direction: 'rtl',
      visible: true,
    }
    next.push(row)
    byId.set(blockId, row)
  }
  const strictFields = sanitizeRenderFieldsByTemplateType(fields, templateType)
  const cleaned = next.map((block) => {
    if (templateType !== 'B') return block
    if (block.id === 'zaffa_time' || block.id === 'wedding_day_line') {
      return { ...block, content: '' }
    }
    return block
  })
  return filterSnapshotBlocksByTemplateType(
    cleaned.filter((block) => {
      const content = String(block?.content || '').trim()
      const fallback = fieldTextForBlockId(strictFields, block.id)
      return Boolean(content || fallback || block.visible)
    }),
    templateType
  )
}

export function deriveRenderOptionsFromBlocks(blocks: SnapshotBlock[], fallbackLayoutB: any): RenderOptions {
  const blockStyleOverrides: Record<string, any> = {}
  const blockPositionOverrides: Record<string, any> = {}
  for (const block of blocks) {
    blockStyleOverrides[block.id] = {
      fontFamily: block.fontFamily || undefined,
      fontSize: Number.isFinite(block.fontSize) ? block.fontSize : undefined,
      fontWeight: Number.isFinite(block.fontWeight) ? block.fontWeight : undefined,
      color: block.color || undefined,
    }
    blockPositionOverrides[block.id] = {
      xPx: Math.max(0, Math.round(block.xPx)),
      yPx: Math.max(0, Math.round(block.yPx)),
    }
  }
  return {
    layoutB: fallbackLayoutB || undefined,
    blockStyleOverrides,
    blockPositionOverrides,
  }
}

export function applyBlocksToFields(
  baseFields: RenderFields,
  blocks: SnapshotBlock[],
  templateType: SnapshotTemplateType = 'A'
): RenderFields {
  const next: RenderFields = { ...baseFields }
  for (const block of blocks) {
    if (templateType === 'B') {
      const blockType = block?.type || classifyBlockTypeById(String(block?.id || ''))
      if (blockType === 'wedding_only') continue
      if (hasWeddingTerms(String(block?.content || ''))) continue
    }
    const text = String(block.content || '').trim()
    if (!text) continue
    switch (block.id) {
      case 'groom_name':
        next.groomNameAr = text
        break
      case 'bride_name':
        next.brideNameAr = text
        break
      case 'date':
      case 'date_en':
        next.dateText = text
        next.date_en = text
        break
      case 'hall_location':
        next.hallLocation = text
        next.location_name = text
        next.venueText = text
        break
      case 'venue':
      case 'location_name':
        next.hallLocation = text
        next.venueText = text
        next.location_name = text
        break
      case 'groom_english':
        next.groomNameEn = text
        break
      case 'bride_english':
        next.brideNameEn = text
        break
      case 'reception_time':
        next.receptionTime = text
        break
      case 'zaffa_time':
        if (templateType === 'B') break
        next.zaffaTime = text
        break
      case 'intro_text':
        next.intro_text = text
        break
      case 'invite_line':
        next.invite_line = text
        break
      case 'verse_or_dua':
        next.verse_or_dua = text
        break
      case 'father_of_bride':
        next.fatherOfBride = text
        break
      case 'father_of_groom':
        next.fatherOfGroom = text
        break
      case 'mother_of_bride':
        next.motherOfBride = text
        break
      case 'mother_of_groom':
        next.motherOfGroom = text
        break
      case 'full_date_line':
        next.fullDateLine = text
        break
      case 'wedding_day_line':
        if (templateType === 'B') break
        next.weddingDayLine = text
        break
      default:
        break
    }
  }
  return sanitizeRenderFieldsByTemplateType(next, templateType)
}

export function sanitizeForFirestore<T>(input: T): T {
  const walk = (value: any): any => {
    if (value === undefined) return undefined
    if (value === null) return null
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
    if (typeof value === 'string' || typeof value === 'boolean') return value
    if (value instanceof Date) return value.toISOString()
    if (Array.isArray(value)) {
      return value
        .map((item) => walk(item))
        .filter((item) => item !== undefined)
    }
    if (typeof value === 'object') {
      const out: Record<string, any> = {}
      for (const [key, v] of Object.entries(value)) {
        const next = walk(v)
        if (next !== undefined) out[key] = next
      }
      return out
    }
    return undefined
  }
  return walk(input) as T
}

