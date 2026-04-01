const EN_MONTHS = [
  'JANUARY',
  'FEBRUARY',
  'MARCH',
  'APRIL',
  'MAY',
  'JUNE',
  'JULY',
  'AUGUST',
  'SEPTEMBER',
  'OCTOBER',
  'NOVEMBER',
  'DECEMBER',
]

function parseIsoDate(input: string): Date | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim())
  if (!iso) return null
  const year = Number(iso[1])
  const month = Number(iso[2])
  const day = Number(iso[3])
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null
  return new Date(Date.UTC(year, month - 1, day))
}

export function formatDateForInvitation(input?: string): string {
  if (!input) return ''

  const trimmed = input.trim()
  const isoDate = parseIsoDate(trimmed)
  const date = isoDate || new Date(trimmed)
  if (Number.isNaN(date.getTime())) return trimmed

  const year = date.getUTCFullYear()
  const month = EN_MONTHS[date.getUTCMonth()] || EN_MONTHS[0]
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year} | ${month} | ${day}`
}
