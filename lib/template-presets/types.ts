export type TemplateType = 'A' | 'B' | 'C'

export interface SafeArea {
  topPct: number
  bottomPct: number
  leftPct: number
  rightPct: number
}

export interface FontConfig {
  familyKey: 'arabic' | 'english'
  baseSize: number
  minSize: number
  weight: number
}

export interface TextBlock {
  id: string
  boxPct: {
    x: number
    y: number
    w: number
    h: number
  }
  font: FontConfig
  color: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
  maxLines: number
  autoFit: boolean
}

export interface TemplatePreset {
  name: string
  description: string
  safeArea: SafeArea
  defaultFonts: {
    arabicFamily: string
    englishFamily: string
  }
  textBlocks: TextBlock[]
}

