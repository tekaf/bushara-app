import type { TemplatePreset, TemplateType } from './types'

// Import presets
const presetA = require('./A.json')
const presetB = require('./B.json')
const presetC = require('./C.json')

const presets: Record<TemplateType, TemplatePreset> = {
  A: presetA as TemplatePreset,
  B: presetB as TemplatePreset,
  C: presetC as TemplatePreset,
}

export function getPreset(type: TemplateType): TemplatePreset {
  return presets[type]
}

export function getAllPresets(): Record<TemplateType, TemplatePreset> {
  return presets
}
