import type { TemplatePreset, TextBlock } from '@/lib/template-presets/types'
import { generateFontFaces, getFontFamilyByLanguage, fetchFontsFromFirestore } from './fonts'
import { applyKashida, shouldApplyKashida } from './kashida'

export interface RenderFields {
  intro_text?: string
  invite_line?: string
  groomNameAr?: string
  brideNameAr?: string
  groomNameEn?: string
  brideNameEn?: string
  dateText?: string
  date_en?: string
  venueText?: string
  location_name?: string
  verse_or_dua?: string
}

export interface RenderOptions {
  width?: number
  height?: number
  fontFaces?: string
  fonts?: Array<{ name: string; language: 'ar' | 'en' }>
  debug?: boolean // Enable debug mode: show borders and labels
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
  const fieldMap: Record<string, string> = {
    intro_text: fields.intro_text || 'دعوة زواج',
    invite_line: fields.invite_line || 'نرجو شرف حضوركم',
    groom_name: fields.groomNameAr || '',
    bride_name: fields.brideNameAr || '',
    groom_english: fields.groomNameEn || '',
    bride_english: fields.brideNameEn || '',
    date: fields.dateText || fields.date_en || '',
    date_en: fields.date_en || fields.dateText || '',
    venue: fields.venueText || fields.location_name || '',
    location_name: fields.location_name || fields.venueText || '',
    verse_or_dua: fields.verse_or_dua || '',
  }

  const debugMode = options.debug || false

  // Generate text blocks HTML
  const textBlocksHTML = preset.textBlocks
    .map((block) => {
      let text = fieldMap[block.id] || ''
      if (!text && !debugMode) return '' // Skip empty blocks unless debug mode

      // Apply Kashida for short Arabic names
      if (shouldApplyKashida(block.id) && text) {
        text = applyKashida(text)
      }

      // Get font family
      const fontFamily = getFontFamilyByLanguage(
        block.font.familyKey === 'arabic' ? 'ar' : 'en',
        fonts
      )

      // TEMPORARILY DISABLE AUTOFIT: Use maxFont (baseSize) directly for debugging
      const fontSize = block.font.baseSize // Use maxFont, no shrinking

      // Calculate exact pixel positions from BoxPct (rounded)
      const xPx = Math.round(block.boxPct.x * width)
      const yPx = Math.round(block.boxPct.y * height)
      const wPx = Math.round(block.boxPct.w * width)
      const hPx = Math.round(block.boxPct.h * height)

      const fontWeight = block.font.weight
      const color = block.color
      const textAlign = block.align
      const lineHeight = block.lineHeight
      const direction = block.font.familyKey === 'arabic' ? 'rtl' : 'ltr'

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
            padding: 0;
            margin: 0;
            box-sizing: border-box;
            overflow: hidden;
            word-wrap: break-word;
            white-space: pre-wrap;
            transform: none;
            zoom: 1;
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
    }
    
    .text-block {
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      transform: none;
      zoom: 1;
    }
  </style>
</head>
<body>
  <img src="${backgroundUrl}" alt="Background" class="background" />
  <div class="content">
    ${textBlocksHTML}
  </div>
</body>
</html>
  `.trim()
}
