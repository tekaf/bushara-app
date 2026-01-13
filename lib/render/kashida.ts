/**
 * Apply Kashida (Tatweel) rule for short Arabic names
 * Rules:
 * - Apply ONLY to Arabic names fields (groom/bride)
 * - Only if name length <= 5 characters
 * - Insert after the 2nd character: chars[0] + chars[1] + "ـ".repeat(4) + chars.slice(2).join("")
 */

const KASHIDA_CHAR = '\u0640' // U+0640 Tatweel character "ـ"
const MAX_NAME_LENGTH = 5
const KASHIDA_REPEAT = 4

export function applyKashida(name: string): string {
  if (!name || name.trim().length === 0) {
    return name
  }

  // Remove any existing kashida to avoid duplication
  const cleanName = name.replace(/\u0640/g, '')

  // Only apply if length <= 5
  if (cleanName.length > MAX_NAME_LENGTH) {
    return name
  }

  // Need at least 2 characters to insert kashida
  if (cleanName.length < 2) {
    return name
  }

  // Split into characters (handling Arabic properly)
  const chars = Array.from(cleanName)
  const kashida = KASHIDA_CHAR.repeat(KASHIDA_REPEAT)
  
  // Insert after 2nd character
  const result = chars[0] + chars[1] + kashida + chars.slice(2).join('')
  
  return result
}

/**
 * Check if a field should have kashida applied
 */
export function shouldApplyKashida(fieldId: string): boolean {
  return fieldId === 'groom_name' || fieldId === 'bride_name'
}
