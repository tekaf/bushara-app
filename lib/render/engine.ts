import type { TemplatePreset, TextBlock } from '@/lib/template-presets/types'
import { generateFontFaces, getFontFamilyByLanguage, fetchFontsFromFirestore } from './fonts'
import { applyConsistentKashidaPair } from './kashida'

export interface RenderFields {
  intro_text?: string
  invite_line?: string
  groomNameAr?: string
  brideNameAr?: string
  groomNameEn?: string
  brideNameEn?: string
  date?: string
  dateText?: string
  date_en?: string
  venueText?: string
  location_name?: string
  verse_or_dua?: string
  motherOfBride?: string
  motherOfGroom?: string
  fatherOfBride?: string
  fatherOfGroom?: string
  weddingDayLine?: string
  fullDateLine?: string
  hallLocation?: string
  receptionTime?: string
  zaffaTime?: string
  noKids?: string | boolean
  noPhotography?: string | boolean
}

export interface RenderOptions {
  width?: number
  height?: number
  fontFaces?: string
  fonts?: Array<{ name: string; language: 'ar' | 'en' }>
  debug?: boolean // Enable debug mode: show borders and labels
  showGrid?: boolean // Enable grid overlay for positioning
  gridColumns?: number // Number of columns (default: 26 for A-Z)
  gridRows?: number // Number of rows (default: 30)
  assetBaseUrl?: string
  layoutB?: {
    groom: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
    bride: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
    date: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
  }
  blockStyleOverrides?: Record<
    string,
    {
      color?: string
      fontFamily?: string
      fontWeight?: number
    }
  >
  ruleIcons?: {
    noKidsUrl?: string
    noPhotographyUrl?: string
  }
}

/**
 * Generate grid overlay HTML
 */
function generateGridOverlay(
  width: number,
  height: number,
  columns: number,
  rows: number
): string {
  const columnWidth = width / columns
  const rowHeight = height / rows

  // Generate column lines and labels
  const columnLines: string[] = []
  const columnLabels: string[] = []
  for (let i = 0; i <= columns; i++) {
    const x = i * columnWidth
    const letter = String.fromCharCode(65 + i) // A=65, B=66, etc.
    
    columnLines.push(`
      <div style="
        position: absolute;
        left: ${x}px;
        top: 0;
        width: 1px;
        height: ${height}px;
        background: rgba(0, 0, 255, 0.7);
        box-shadow: 0 0 1px rgba(0, 0, 255, 0.5);
        z-index: 9999;
        pointer-events: none;
      "></div>
    `)
    
    if (i < columns) {
      columnLabels.push(`
        <div style="
          position: absolute;
          left: ${x + columnWidth / 2}px;
          top: 5px;
          transform: translateX(-50%);
          font-family: Arial, sans-serif;
          font-size: 12px;
          font-weight: bold;
          color: rgba(0, 0, 255, 0.8);
          background: rgba(255, 255, 255, 0.7);
          padding: 2px 4px;
          border-radius: 2px;
          z-index: 1001;
          pointer-events: none;
        ">${letter}</div>
      `)
    }
  }

  // Generate row lines and labels
  const rowLines: string[] = []
  const rowLabels: string[] = []
  for (let i = 0; i <= rows; i++) {
    const y = i * rowHeight
    
    rowLines.push(`
      <div style="
        position: absolute;
        left: 0;
        top: ${y}px;
        width: ${width}px;
        height: 1px;
        background: rgba(0, 0, 255, 0.7);
        box-shadow: 0 0 1px rgba(0, 0, 255, 0.5);
        z-index: 9999;
        pointer-events: none;
      "></div>
    `)
    
    if (i < rows) {
      rowLabels.push(`
        <div style="
          position: absolute;
          left: 5px;
          top: ${y + rowHeight / 2}px;
          transform: translateY(-50%);
          font-family: Arial, sans-serif;
          font-size: 12px;
          font-weight: bold;
          color: rgba(0, 0, 255, 0.8);
          background: rgba(255, 255, 255, 0.7);
          padding: 2px 4px;
          border-radius: 2px;
          z-index: 1001;
          pointer-events: none;
        ">${i + 1}</div>
      `)
    }
  }

  return `
    <div class="grid-overlay" style="
      position: absolute;
      top: 0;
      left: 0;
      width: ${width}px;
      height: ${height}px;
      z-index: 9999;
      pointer-events: none;
      overflow: visible;
    ">
      ${columnLines.join('')}
      ${rowLines.join('')}
      ${columnLabels.join('')}
      ${rowLabels.join('')}
    </div>
  `
}

/**
 * Calculate optimal font size for text to fit in box
 */
function calculateOptimalFontSize(
  text: string,
  block: TextBlock,
  width: number,
  height: number,
  fontFamily: string
): number {
  if (!block.autoFit) {
    return block.font.baseSize
  }

  const boxWidth = block.boxPct.w * width
  const boxHeight = block.boxPct.h * height
  const maxFont = block.font.baseSize
  const minFont = block.font.minSize || block.font.baseSize * 0.5

  // Start with max font size
  let fontSize = maxFont
  const step = 2

  // Create a test element to measure text
  // We'll use a simple estimation based on character count and font size
  // For more accurate measurement, we'd need to use canvas or DOM, but for now
  // we'll use a reasonable approximation
  
  // Approximate: average Arabic char width ≈ fontSize * 0.6, English ≈ fontSize * 0.5
  const avgCharWidth = block.font.familyKey === 'arabic' ? fontSize * 0.6 : fontSize * 0.5
  const lineHeight = fontSize * block.lineHeight
  const maxCharsPerLine = Math.floor((boxWidth - 20) / avgCharWidth) // 20px padding
  const estimatedLines = Math.ceil(text.length / maxCharsPerLine)
  const estimatedHeight = estimatedLines * lineHeight

  // If it fits, return max
  if (estimatedHeight <= boxHeight && estimatedLines <= (block.maxLines || 10)) {
    return maxFont
  }

  // Reduce font size until it fits
  while (fontSize > minFont) {
    const charWidth = block.font.familyKey === 'arabic' ? fontSize * 0.6 : fontSize * 0.5
    const lineH = fontSize * block.lineHeight
    const charsPerLine = Math.floor((boxWidth - 20) / charWidth)
    const lines = Math.ceil(text.length / charsPerLine)
    const totalHeight = lines * lineH

    if (totalHeight <= boxHeight && lines <= (block.maxLines || 10)) {
      return fontSize
    }

    fontSize -= step
  }

  return Math.max(minFont, fontSize)
}

function estimateTextWidthPx(text: string, fontSize: number, isArabic: boolean): number {
  const chars = Array.from(text)
  let total = 0
  for (const ch of chars) {
    if (ch === ' ') total += fontSize * 0.28
    else if (/[0-9A-Z|]/.test(ch)) total += fontSize * 0.52
    else total += fontSize * (isArabic ? 0.58 : 0.5)
  }
  return total
}

function fitSingleLineFontSize(text: string, block: TextBlock, boxWidth: number): number {
  const maxFont = block.font.baseSize
  const minFont = block.font.minSize || Math.max(14, Math.round(maxFont * 0.55))
  const isArabic = block.font.familyKey === 'arabic'

  let size = maxFont
  while (size > minFont) {
    const estimated = estimateTextWidthPx(text, size, isArabic)
    if (estimated <= boxWidth - 12) return size
    size -= 1
  }
  return minFont
}

function isTruthyValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['1', 'true', 'yes', 'on', 'enabled', 'y'].includes(normalized)
  }
  return false
}

export async function generateHTML(
  preset: TemplatePreset,
  backgroundUrl: string,
  fields: RenderFields,
  options: RenderOptions = {}
): Promise<string> {
  // HARD-FIX: Exact canvas size 1080x1920, no scaling
  const width = 1080
  const height = 1920

  // Load fonts from Firestore
  const fonts = await fetchFontsFromFirestore()
  const fontFaces = options.fontFaces || (await generateFontFaces())

  // Map fields to text blocks
  // Type B uses only: groom_name, bride_name, date
  const fieldMap: Record<string, string> = {
    intro_text: fields.intro_text || 'دعوة زواج',
    invite_line: fields.invite_line || 'نرجو شرف حضوركم',
    groom_name: fields.groomNameAr || '',
    bride_name: fields.brideNameAr || '',
    groom_english: fields.groomNameEn || '',
    bride_english: fields.brideNameEn || '',
    date: fields.dateText || fields.date_en || fields.date || '',
    date_en: fields.date_en || fields.dateText || fields.date || '',
    venue: fields.venueText || fields.location_name || '',
    location_name: fields.location_name || fields.venueText || '',
    verse_or_dua: fields.verse_or_dua || '',
    mother_of_bride: fields.motherOfBride || '',
    mother_of_groom: fields.motherOfGroom || '',
    father_of_bride: fields.fatherOfBride || '',
    father_of_groom: fields.fatherOfGroom || '',
    wedding_day_line: fields.weddingDayLine || '',
    full_date_line: fields.fullDateLine || '',
    hall_location: fields.hallLocation || fields.location_name || fields.venueText || '',
    reception_time: fields.receptionTime || '',
    zaffa_time: fields.zaffaTime || '',
    noKids: String(fields.noKids ?? ''),
    noPhotography: String(fields.noPhotography ?? ''),
  }
  const rawFieldEntries = Object.entries((fields || {}) as Record<string, unknown>)
  for (const [key, value] of rawFieldEntries) {
    if (value === undefined || value === null || typeof value === 'object') continue
    if (!fieldMap[key]) {
      fieldMap[key] = String(value)
    }
  }

  // Apply Kashida to groom/bride as a consistent pair.
  const kashidaPair = applyConsistentKashidaPair(fieldMap.groom_name || '', fieldMap.bride_name || '')
  fieldMap.groom_name = kashidaPair.groom
  fieldMap.bride_name = kashidaPair.bride

  const debugMode = options.debug || false
  const showGrid = options.showGrid || false
  const gridColumns = options.gridColumns || 26 // A-Z
  const gridRows = options.gridRows || 30

  // Generate grid overlay HTML if enabled
  const gridOverlayHTML = showGrid ? generateGridOverlay(width, height, gridColumns, gridRows) : ''

  // Generate text blocks HTML
  const textBlocksHTML = preset.textBlocks
    .map((block) => {
      const isImageBlock = block.kind === 'image'
      if (isImageBlock) {
        const visibilityField = block.visibleWhenField || block.id
        const isVisible = isTruthyValue(fieldMap[visibilityField])
        if (!isVisible && !debugMode) return ''

        const xPx = Math.round(block.boxPct.x * width)
        const yPx = Math.round(block.boxPct.y * height)
        const wPx = Math.round(block.boxPct.w * width)
        const hPx = Math.round(block.boxPct.h * height)
        const debugBorder = debugMode ? 'border: 1px dashed rgba(255,0,0,0.5);' : ''
        const iconOverride =
          block.id === 'icon_no_kids' || block.visibleWhenField === 'noKids'
            ? options.ruleIcons?.noKidsUrl || ''
            : block.id === 'icon_no_photography' || block.visibleWhenField === 'noPhotography'
            ? options.ruleIcons?.noPhotographyUrl || ''
            : ''
        const rawImageSrc = iconOverride || block.imageSrc || ''
        const imageSrc = rawImageSrc.startsWith('/')
          ? `${(options.assetBaseUrl || '').replace(/\/$/, '')}${rawImageSrc}`
          : rawImageSrc
        if (!imageSrc && !debugMode) return ''

        return `
          <div
            class="image-block"
            data-block-id="${block.id}"
            style="
              position: absolute;
              left: ${xPx}px;
              top: ${yPx}px;
              width: ${wPx}px;
              height: ${hPx}px;
              display: flex;
              align-items: center;
              justify-content: center;
              z-index: 1;
              overflow: hidden;
              ${debugBorder}
            "
          >
            ${
              imageSrc
                ? `<img src="${imageSrc}" alt="${block.id}" style="width: 100%; height: 100%; object-fit: contain;" />`
                : ''
            }
          </div>
        `
      }

      let text = fieldMap[block.id] || block.fallbackText || ''
      if (!text && !debugMode) return '' // Skip empty blocks unless debug mode

      const styleOverride = options.blockStyleOverrides?.[block.id] || {}

      // Get font family
      const fontFamily =
        styleOverride.fontFamily && styleOverride.fontFamily.trim().length > 0
          ? `'${styleOverride.fontFamily.trim()}'`
          : block.font.familyName && block.font.familyName.trim().length > 0
          ? `'${block.font.familyName}'`
          : getFontFamilyByLanguage(block.font.familyKey === 'arabic' ? 'ar' : 'en', fonts)

      // For Type B, use saved layout if available
      let xPx: number
      let yPx: number
      let fontSize: number
      let wPx: number
      let hPx: number

      if (options.layoutB && (block.id === 'groom_name' || block.id === 'bride_name' || block.id === 'date')) {
        // Use saved layout positions
        const savedLayout = block.id === 'groom_name' ? options.layoutB.groom :
                           block.id === 'bride_name' ? options.layoutB.bride :
                           options.layoutB.date
        
        xPx = savedLayout.xPx
        yPx = savedLayout.yPx
        fontSize = savedLayout.fontSize
        // Keep width/height from preset for now (or make them configurable later)
        wPx = Math.round(block.boxPct.w * width)
        hPx = Math.round(block.boxPct.h * height)
      } else {
        // Use preset positions
        fontSize = block.font.baseSize
        xPx = Math.round(block.boxPct.x * width)
        yPx = Math.round(block.boxPct.y * height)
        wPx = Math.round(block.boxPct.w * width)
        hPx = Math.round(block.boxPct.h * height)
      }

      // Flexible width for short Arabic name fields: expand box before shrinking text.
      const isNameField = block.id === 'groom_name' || block.id === 'bride_name'
      if (text && isNameField) {
        const estimatedNeededWidth = Math.ceil(estimateTextWidthPx(text, fontSize, true) + 28)
        if (estimatedNeededWidth > wPx) {
          const centerX = xPx + wPx / 2
          const maxWidth = width - 12
          const nextWidth = Math.min(maxWidth, estimatedNeededWidth)
          const nextX = Math.max(0, Math.min(width - nextWidth, Math.round(centerX - nextWidth / 2)))
          wPx = nextWidth
          xPx = nextX
        }
      }

      // Smart fit: force one line by shrinking font if needed.
      const isSingleLineTarget =
        block.forceSingleLine === true ||
        block.maxLines === 1 ||
        block.id === 'groom_name' ||
        block.id === 'bride_name'
      if (text && isSingleLineTarget) {
        if (block.autoExpandWidthPct && block.autoExpandWidthPct > block.boxPct.w) {
          const estimatedNeededWidth = Math.ceil(
            estimateTextWidthPx(text, fontSize, block.font.familyKey === 'arabic') + 24
          )
          if (estimatedNeededWidth > wPx) {
            const centerX = xPx + wPx / 2
            const maxWidth = Math.min(width - 10, Math.round(block.autoExpandWidthPct * width))
            const nextWidth = Math.min(maxWidth, estimatedNeededWidth)
            const nextX = Math.max(0, Math.min(width - nextWidth, Math.round(centerX - nextWidth / 2)))
            wPx = nextWidth
            xPx = nextX
          }
        }
        const fitSize = fitSingleLineFontSize(text, { ...block, font: { ...block.font, baseSize: fontSize } }, wPx)
        fontSize = Math.min(fontSize, fitSize)
      } else if (text && block.autoFit && !options.layoutB) {
        // Keep legacy behavior for non-layoutB blocks that use auto-fit.
        fontSize = calculateOptimalFontSize(text, block, width, height, fontFamily)
      }

      const fontWeight = Number.isFinite(styleOverride.fontWeight as number)
        ? Number(styleOverride.fontWeight)
        : block.font.weight
      const color = styleOverride.color || block.color
      const textAlign = block.align
      const direction = block.font.familyKey === 'arabic' ? 'rtl' : 'ltr'
      const isArabicBlock = direction === 'rtl'
      // Keep Arabic glyph dots/descenders from being clipped inside tight boxes.
      const lineHeight = isArabicBlock ? Math.max(block.lineHeight, 1.15) : block.lineHeight
      const verticalPad = isArabicBlock ? Math.max(4, Math.round(fontSize * 0.1)) : 0
      const boldBoostStyle =
        fontWeight >= 700
          ? `
            text-shadow:
              0 0 0 currentColor,
              0.28px 0 currentColor,
              -0.28px 0 currentColor;
            font-synthesis: weight;
          `
          : 'font-synthesis: none;'

      // Debug mode: add border and label
      const debugBorder = debugMode ? 'border: 2px solid rgba(255, 0, 0, 0.4);' : ''
      const debugLabel = debugMode ? `
        <div style="
          position: absolute;
          top: 2px;
          left: 2px;
          background: rgba(255, 0, 0, 0.8);
          color: white;
          font-size: 10px;
          font-family: Arial, sans-serif;
          padding: 2px 4px;
          border-radius: 2px;
          z-index: 10;
          pointer-events: none;
        ">${block.id}</div>
      ` : ''

      return `
        <div
          class="text-block"
          data-block-id="${block.id}"
          data-max-lines="${block.maxLines || 0}"
          style="
            position: absolute;
            left: ${xPx}px;
            top: ${yPx}px;
            width: ${wPx}px;
            height: ${hPx}px;
            font-family: ${fontFamily};
            font-size: ${fontSize}px;
            font-weight: ${fontWeight};
            color: ${color};
            text-align: ${textAlign};
            line-height: ${lineHeight};
            direction: ${direction};
            display: flex;
            align-items: center;
            justify-content: center;
            padding: ${verticalPad}px 6px ${verticalPad + (isArabicBlock ? 2 : 0)}px 6px;
            margin: 0;
            box-sizing: border-box;
            overflow: visible;
            word-wrap: break-word;
            white-space: ${isSingleLineTarget ? 'nowrap' : 'pre-wrap'};
            transform: none;
            zoom: 1;
            ${boldBoostStyle}
            ${debugBorder}
          "
        >
          ${debugLabel}
          ${text || (debugMode ? `[${block.id}]` : '')}
        </div>
      `
    })
    .join('')

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=1080, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    ${fontFaces}
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    html, body {
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      padding: 0;
      position: relative;
      overflow: hidden;
      background: #fff;
      transform: none;
      zoom: 1;
    }
    
    body {
      position: relative;
    }
    
    .background {
      position: absolute;
      top: 0;
      left: 0;
      width: ${width}px;
      height: ${height}px;
      object-fit: cover;
      z-index: 0;
      transform: none;
    }
    
    .content {
      position: relative;
      z-index: 1;
      width: ${width}px;
      height: ${height}px;
      transform: none;
      overflow: visible;
    }
    
    .text-block {
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      transform: none;
      zoom: 1;
      z-index: 1;
    }
    
    .grid-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9999;
      pointer-events: none;
      overflow: visible;
    }
  </style>
</head>
<body>
  <img src="${backgroundUrl}" alt="Background" class="background" />
  <div class="content">
    ${textBlocksHTML}
    ${gridOverlayHTML}
  </div>
</body>
</html>
  `.trim()
}
