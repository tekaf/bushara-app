const KASHIDA_CHAR = '\u0640' // U+0640 Tatweel character "ـ"
const KASHIDA_REPEAT = 9
const ALEF_FAMILY = new Set(['ا', 'أ', 'إ', 'آ', 'ٱ'])
const NON_JOINING_CHARS = new Set(['ا', 'أ', 'إ', 'آ', 'ٱ', 'د', 'ذ', 'ر', 'ز', 'و', 'ؤ', 'ء', 'ى'])

export function applyKashida(name: string): string {
  const cleanName = normalizeName(name)
  if (!cleanName) return cleanName
  if (startsWithAbd(cleanName)) return applyAbdKashida(cleanName)

  const words = cleanName.split(/\s+/).filter(Boolean)
  if (words.length === 0) return cleanName

  const index = words.findIndex((word) => canStretchWord(word))
  if (index === -1) return cleanName

  const nextWords = [...words]
  nextWords[index] = applyKashidaToWord(nextWords[index])
  return nextWords.join(' ')
}

function normalizeName(name: string): string {
  return (name || '').replace(/\u0640/g, '').trim()
}

function startsWithAbd(name: string): boolean {
  return /^عبد(?:\s|$)/.test(name)
}

function canStretchWord(word: string): boolean {
  const cleanWord = normalizeName(word)
  if (cleanWord.length < 2) return false
  const chars = Array.from(cleanWord)
  const secondChar = chars[1]
  if (!secondChar) return false
  // Avoid names that visually break when stretched from the second position (e.g. أروى).
  if (NON_JOINING_CHARS.has(secondChar)) return false
  return true
}

function applyKashidaToWord(word: string): string {
  const cleanWord = normalizeName(word)
  if (!canStretchWord(cleanWord)) return cleanWord

  const chars = Array.from(cleanWord)
  const extraForVeryShort = cleanWord.length <= 3 ? 2 : 0
  const reduceForLongWord = cleanWord.length >= 8 ? 2 : 0
  const repeats = Math.max(5, KASHIDA_REPEAT + extraForVeryShort - reduceForLongWord)
  const kashida = KASHIDA_CHAR.repeat(repeats)
  const insertAfterIndex = chars.length >= 2 && ALEF_FAMILY.has(chars[1]) ? 1 : 2
  const prefix = chars.slice(0, insertAfterIndex).join('')
  const suffix = chars.slice(insertAfterIndex).join('')
  return `${prefix}${kashida}${suffix}`
}

function canApplyKashida(name: string): boolean {
  const cleanName = normalizeName(name)
  if (!cleanName) return false

  if (startsWithAbd(cleanName)) {
    return true
  }

  return cleanName
    .split(/\s+/)
    .filter(Boolean)
    .some((word) => canStretchWord(word))
}

function applyAbdKashida(name: string): string {
  const cleanName = normalizeName(name)
  if (!startsWithAbd(cleanName)) return cleanName
  const suffix = cleanName.slice(3).trimStart()
  const extended = `عب${KASHIDA_CHAR.repeat(Math.max(5, KASHIDA_REPEAT - 3))}د`
  return suffix ? `${extended} ${suffix}` : extended
}

/**
 * Keep groom/bride styling consistent:
 * - if one cannot accept Kashida, disable Kashida for both names.
 * - special case: names starting with "عبد" get "عبـــــد ..." formatting.
 */
export function applyConsistentKashidaPair(groomName: string, brideName: string) {
  const groom = normalizeName(groomName)
  const bride = normalizeName(brideName)

  if (!groom || !bride) {
    return { groom, bride, applied: false }
  }

  // Keep both names visually aligned: both single-word or both compound names.
  const groomWordCount = groom.split(/\s+/).filter(Boolean).length
  const brideWordCount = bride.split(/\s+/).filter(Boolean).length
  const groomIsCompound = groomWordCount > 1
  const brideIsCompound = brideWordCount > 1
  if (groomIsCompound !== brideIsCompound) {
    return { groom, bride, applied: false }
  }

  const groomOk = canApplyKashida(groom)
  const brideOk = canApplyKashida(bride)
  if (!groomOk || !brideOk) {
    return { groom, bride, applied: false }
  }

  const groomFormatted = applyKashida(groom)
  const brideFormatted = applyKashida(bride)
  return {
    groom: groomFormatted,
    bride: brideFormatted,
    applied: true,
  }
}

/**
 * Check if a field should have kashida applied
 */
export function shouldApplyKashida(fieldId: string): boolean {
  return fieldId === 'groom_name' || fieldId === 'bride_name'
}
