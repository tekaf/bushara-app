type RiskCaseMessageContext = {
  guestName: string
  hostName: string
  occasionTypeLabel: string
  eventDateLabel: string
  shortInvitationLink: string
}

export const DEFAULT_RISK_CASE_TEMPLATE = `مساء الخير {guestName}

بكل مودة وفرح، يسرّنا دعوتكم لحضور مناسبة {occasionTypeLabel} {hostName}.

وذلك يوم {eventDateLabel}

حضوركم يسعدنا ويزيد المناسبة بهجة وتشريفًا.

للاطلاع على تفاصيل الدعوة وتأكيد الحضور:
{shortInvitationLink}`

function safeValue(value: unknown, fallback = ''): string {
  const clean = String(value || '').trim()
  return clean || fallback
}

function isLocalhostUrl(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(String(value || '').trim())
}

function isProductionEnv(): boolean {
  return String(process.env.NODE_ENV || '').toLowerCase() === 'production'
}

function containsBlockedSymbols(value: string): boolean {
  const text = String(value || '')
  return /[\uFFFD#]/.test(text)
}

function formatArabicDate(rawValue: string): string {
  const clean = String(rawValue || '').trim()
  if (!clean) return ''
  const parsed = new Date(clean)
  if (!Number.isFinite(parsed.getTime())) return clean
  return new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
}

export function getOccasionTypeLabel(value: unknown): string {
  const raw = String(value || '').trim()
  const normalized = raw.toLowerCase()
  if (normalized === 'wedding') return 'زواج'
  if (normalized === 'engagement') return 'ملكة / خطوبة'
  if (normalized === 'graduation') return 'تخرج'
  if (normalized === 'birthday') return 'عيد ميلاد'
  if (normalized === 'other') return 'مناسبة'
  if (/[ء-ي]/.test(raw)) return raw
  if (!normalized) return ''
  return ''
}

export function validateRiskCaseMessageContext(context: RiskCaseMessageContext): { ok: true } | { ok: false; reason: string } {
  const guestName = safeValue(context.guestName)
  const hostName = safeValue(context.hostName)
  const occasionTypeLabel = safeValue(context.occasionTypeLabel)
  const eventDateLabel = safeValue(context.eventDateLabel)
  const shortInvitationLink = safeValue(context.shortInvitationLink)

  if (!guestName) return { ok: false, reason: 'Missing guestName' }
  if (!hostName) return { ok: false, reason: 'Missing hostName' }
  if (!occasionTypeLabel) return { ok: false, reason: 'Missing occasionTypeLabel' }
  if (!eventDateLabel) return { ok: false, reason: 'Missing eventDateLabel' }
  if (!shortInvitationLink) return { ok: false, reason: 'Missing shortInvitationLink' }
  if (isProductionEnv() && isLocalhostUrl(shortInvitationLink)) {
    return { ok: false, reason: 'Localhost shortInvitationLink is not allowed in production' }
  }
  if (containsBlockedSymbols(shortInvitationLink)) return { ok: false, reason: 'Invalid shortInvitationLink content' }
  if (/\?/.test(shortInvitationLink)) return { ok: false, reason: 'shortInvitationLink must not include query params' }
  return { ok: true }
}

export function buildRiskCaseMessage(
  context: RiskCaseMessageContext,
  templateText = DEFAULT_RISK_CASE_TEMPLATE
): string {
  const payload = {
    guestName: safeValue(context.guestName).replace(/^يا\s+/u, ''),
    hostName: safeValue(context.hostName),
    occasionTypeLabel: safeValue(context.occasionTypeLabel),
    eventDateLabel: safeValue(context.eventDateLabel),
    shortInvitationLink: safeValue(context.shortInvitationLink),
  }
  const validation = validateRiskCaseMessageContext(payload)
  if (!validation.ok) {
    throw new Error(`Risk case message context invalid: ${validation.reason}`)
  }

  const message = templateText
    .replace(/\{guestName\}/g, payload.guestName)
    .replace(/\{occasionTypeLabel\}/g, payload.occasionTypeLabel)
    .replace(/\{occasionType\}/g, payload.occasionTypeLabel)
    .replace(/\{hostName\}/g, payload.hostName)
    .replace(/\{eventDateLabel\}/g, payload.eventDateLabel)
    .replace(/\{eventDate\}/g, payload.eventDateLabel)
    .replace(/\{shortInvitationLink\}/g, payload.shortInvitationLink)
    .replace(/\{invitationLink\}/g, payload.shortInvitationLink)
  const cleaned = message.replace(/\{[a-zA-Z0-9_]+\}/g, '').trim()
  if (containsBlockedSymbols(cleaned)) {
    throw new Error('Risk case message contains blocked symbols')
  }
  if (isProductionEnv() && /\b(localhost|127\.0\.0\.1)\b/i.test(cleaned)) {
    throw new Error('Risk case message contains localhost link in production')
  }
  if (/\bwedding\b/i.test(cleaned)) {
    throw new Error('Risk case message contains non-localized occasion label')
  }
  if (/[🌷✨]/u.test(cleaned)) {
    throw new Error('Risk case message must not include emojis')
  }
  return cleaned
}

export function buildInviteHostName(invite: any): string {
  const groom = String(invite?.groomName || '').trim()
  const bride = String(invite?.brideName || '').trim()
  const display =
    String(
      invite?.hostDisplayName ||
        invite?.inviterDisplayName ||
        invite?.customerDisplayName ||
        invite?.customerName ||
        ''
    ).trim() || (groom && bride ? `${groom} و ${bride}` : groom || bride)
  return display
}

export function buildInviteOccasionType(invite: any): string {
  const raw = String(invite?.selectedOccasion || invite?.occasionType || '').trim()
  return getOccasionTypeLabel(raw || '')
}

export function buildInviteEventDate(invite: any): string {
  const raw = safeValue(
    invite?.fullDateLine || invite?.dateText || invite?.date || invite?.eventDate || invite?.eventDateText,
    ''
  )
  const gregorian = formatArabicDate(raw)
  if (!gregorian) return ''
  const parsed = new Date(raw)
  if (!Number.isFinite(parsed.getTime())) return gregorian
  const hijri = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(parsed)
  return `${gregorian} الموافق ${hijri} هـ`
}
