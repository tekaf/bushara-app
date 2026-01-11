import type { TemplatePreset, TextBlock } from '@/lib/template-presets/types'

export interface RenderFields {
  groomNameAr?: string
  brideNameAr?: string
  groomNameEn?: string
  brideNameEn?: string
  dateText?: string
  venueText?: string
}

export function generateHTML(
  preset: TemplatePreset,
  backgroundUrl: string,
  fields: RenderFields,
  fonts: { arabic: string; english: string } = {
    arabic: 'Cairo, "Amiri", "Noto Naskh Arabic", sans-serif',
    english: '"Cormorant Garamond", serif',
  }
): string {
  const width = 1080
  const height = 1920

  // Map fields to text blocks
  const fieldMap: Record<string, string> = {
    intro_text: 'دعوة زواج',
    invite_line: 'نرجو شرف حضوركم',
    groom_name: fields.groomNameAr || '',
    bride_name: fields.brideNameAr || '',
    groom_english: fields.groomNameEn || '',
    bride_english: fields.brideNameEn || '',
    date: fields.dateText || '',
    venue: fields.venueText || '',
  }

  // Generate text blocks HTML
  const textBlocksHTML = preset.textBlocks
    .map((block) => {
      const text = fieldMap[block.id] || ''
      if (!text) return ''

      const x = block.boxPct.x * width
      const y = block.boxPct.y * height
      const w = block.boxPct.w * width
      const h = block.boxPct.h * height

      const fontFamily =
        block.font.familyKey === 'arabic' ? fonts.arabic : fonts.english

      const fontSize = block.font.baseSize
      const fontWeight = block.font.weight
      const color = block.color
      const textAlign = block.align
      const lineHeight = block.lineHeight
      const letterSpacing = block.letterSpacing
      const direction = block.font.familyKey === 'arabic' ? 'rtl' : 'ltr'

      return `
        <div
          style="
            position: absolute;
            left: ${x}px;
            top: ${y}px;
            width: ${w}px;
            height: ${h}px;
            font-family: ${fontFamily};
            font-size: ${fontSize}px;
            font-weight: ${fontWeight};
            color: ${color};
            text-align: ${textAlign};
            line-height: ${lineHeight};
            letter-spacing: ${letterSpacing}px;
            direction: ${direction};
            display: flex;
            align-items: center;
            justify-content: ${textAlign === 'center' ? 'center' : textAlign === 'right' ? 'flex-end' : 'flex-start'};
            padding: 10px;
            box-sizing: border-box;
            overflow: hidden;
            word-wrap: break-word;
          "
        >
          ${text}
        </div>
      `
    })
    .join('')

  return `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;700&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      width: ${width}px;
      height: ${height}px;
      margin: 0;
      padding: 0;
      position: relative;
      overflow: hidden;
      background: #fff;
    }
    
    .background {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      z-index: 0;
    }
    
    .content {
      position: relative;
      z-index: 1;
      width: 100%;
      height: 100%;
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

