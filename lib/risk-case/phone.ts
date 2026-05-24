export type NormalizeWhatsAppPhoneResult =
  | {
      ok: true
      normalizedPhone: string
      digitsOnly: string
    }
  | {
      ok: false
      reason: string
      input: string
    }

function toAsciiDigits(input: string): string {
  const arabicIndic = '٠١٢٣٤٥٦٧٨٩'
  const easternArabicIndic = '۰۱۲۳۴۵۶۷۸۹'
  let out = input
  for (let i = 0; i < 10; i += 1) {
    out = out.replace(new RegExp(arabicIndic[i], 'g'), String(i))
    out = out.replace(new RegExp(easternArabicIndic[i], 'g'), String(i))
  }
  return out
}

export function normalizeWhatsAppPhone(input: unknown): NormalizeWhatsAppPhoneResult {
  const raw = String(input || '').trim()
  if (!raw) return { ok: false, reason: 'Phone is empty', input: raw }

  const ascii = toAsciiDigits(raw)
  let normalized = ascii.replace(/[^\d+]/g, '')
  if (normalized.startsWith('+')) normalized = normalized.slice(1)
  if (normalized.startsWith('00')) normalized = normalized.slice(2)

  // Local Saudi number: 05XXXXXXXX -> 9665XXXXXXXX
  if (/^05\d{8}$/.test(normalized)) {
    normalized = `966${normalized.slice(1)}`
  } else if (/^5\d{8}$/.test(normalized)) {
    normalized = `966${normalized}`
  }

  if (!/^9665\d{8}$/.test(normalized)) {
    return {
      ok: false,
      reason: 'Invalid WhatsApp phone format. Expected Saudi mobile number.',
      input: raw,
    }
  }

  return {
    ok: true,
    normalizedPhone: normalized,
    digitsOnly: normalized,
  }
}
