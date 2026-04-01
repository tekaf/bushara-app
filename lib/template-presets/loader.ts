import type { TemplatePreset, TemplateType } from './types'

// Import presets (fallback)
const presetA = require('./A.json')
const presetB = require('./B.json')
const presetC = require('./C.json')

const defaultPresets: Record<TemplateType, TemplatePreset> = {
  A: presetA as TemplatePreset,
  B: presetB as TemplatePreset,
  C: presetC as TemplatePreset,
}

// Cache for presets loaded from Firestore
let presetsCache: Record<TemplateType, TemplatePreset | null> = {
  A: null,
  B: null,
  C: null,
}

export function getPreset(type: TemplateType): TemplatePreset {
  // Return cached preset if available, otherwise return default
  return presetsCache[type] || defaultPresets[type]
}

export function getAllPresets(): Record<TemplateType, TemplatePreset> {
  return {
    A: presetsCache.A || defaultPresets.A,
    B: presetsCache.B || defaultPresets.B,
    C: presetsCache.C || defaultPresets.C,
  }
}

export function mergePresetWithBase(
  basePreset: TemplatePreset,
  overridePreset?: Partial<TemplatePreset> | null
): TemplatePreset {
  if (!overridePreset) return basePreset

  const baseBlocks = Array.isArray(basePreset.textBlocks) ? basePreset.textBlocks : []
  const overrideBlocks = Array.isArray((overridePreset as any).textBlocks)
    ? ((overridePreset as any).textBlocks as TemplatePreset['textBlocks'])
    : []
  const overrideMap = new Map(overrideBlocks.map((block) => [block.id, block]))

  const mergedBlocks = baseBlocks.map((baseBlock) => overrideMap.get(baseBlock.id) || baseBlock)
  for (const block of overrideBlocks) {
    if (!baseBlocks.some((b) => b.id === block.id)) {
      mergedBlocks.push(block)
    }
  }

  return {
    ...basePreset,
    ...(overridePreset as TemplatePreset),
    textBlocks: mergedBlocks,
  }
}

// Function to load preset from Firestore (server-side only)
export async function loadPresetFromFirestore(type: TemplateType): Promise<TemplatePreset> {
  try {
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return defaultPresets[type]
    }

    const presetDoc = await adminDb.collection('presets').doc(type).get()
    if (presetDoc.exists) {
      const data = presetDoc.data() as TemplatePreset
      presetsCache[type] = data
      return data
    }
  } catch (error) {
    console.error(`Error loading preset ${type} from Firestore:`, error)
  }

  return defaultPresets[type]
}
