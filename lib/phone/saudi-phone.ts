export type SaudiPhoneResult =
  | { ok: true; local: string; e164: string; digits: string }
  | { ok: false; reason: string }

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

export function normalizeArabicDigits(value: string): string {
  return value.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
}

/** Digits only from user input (no country code). */
export function extractSaudiLocalDigits(raw: string): string {
  let value = normalizeArabicDigits(raw).replace(/[^\d+]/g, '')
  if (value.startsWith('00966')) value = value.slice(5)
  if (value.startsWith('+966')) value = value.slice(4)
  if (value.startsWith('966')) value = value.slice(3)
  if (value.startsWith('0')) value = value.slice(1)
  return value.replace(/\D/g, '').slice(0, 9)
}

export function validateSaudiLocalDigits(digits: string): SaudiPhoneResult {
  const clean = digits.replace(/\D/g, '')
  if (!clean) return { ok: false, reason: 'أدخل رقم الجوال' }
  if (clean.length < 9) return { ok: false, reason: 'رقم الجوال ناقص — يجب أن يكون 9 أرقام' }
  if (clean.length > 9) return { ok: false, reason: 'رقم الجوال طويل — يجب أن يكون 9 أرقام فقط' }
  if (!clean.startsWith('5')) return { ok: false, reason: 'رقم الجوال السعودي يبدأ بـ 5' }
  const local = `0${clean}`
  return { ok: true, local, e164: `+966${clean}`, digits: clean }
}

export function normalizeSaudiPhone(raw: string): SaudiPhoneResult {
  const normalized = normalizeArabicDigits(raw).replace(/[^\d+]/g, '')
  if (!normalized) return { ok: false, reason: 'أدخل رقم الجوال' }

  let candidate = normalized
  if (candidate.startsWith('00966')) candidate = `+${candidate.slice(2)}`
  if (candidate.startsWith('966') && !candidate.startsWith('+')) candidate = `+${candidate}`

  if (/^5\d{8}$/.test(candidate)) candidate = `0${candidate}`
  if (/^05\d{8}$/.test(candidate)) {
    return { ok: true, local: candidate, e164: `+966${candidate.slice(1)}`, digits: candidate.slice(1) }
  }
  if (/^\+9665\d{8}$/.test(candidate)) {
    return { ok: true, local: `0${candidate.slice(4)}`, e164: candidate, digits: candidate.slice(4) }
  }

  return validateSaudiLocalDigits(extractSaudiLocalDigits(raw))
}
