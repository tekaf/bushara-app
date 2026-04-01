function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

const DEFAULT_ADMIN_EMAILS = [
  'owner@bushara.app',
  'admin.local@bushara.app',
  'admin2@bushara.app',
  'm19qty2@gmail.com',
]

function parseEmails(raw: string | undefined): string[] {
  if (!raw) return []
  return raw
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean)
}

export function getAdminEmailsForClient(): string[] {
  const configured = parseEmails(process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  return configured.length > 0 ? configured : DEFAULT_ADMIN_EMAILS
}

export function getAdminEmailsForServer(): string[] {
  // Allow server to use a private list, with optional fallback for simpler local setup.
  const configured = parseEmails(process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS)
  return configured.length > 0 ? configured : DEFAULT_ADMIN_EMAILS
}

export function isAdminEmailClient(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = getAdminEmailsForClient()
  return allowed.includes(normalizeEmail(email))
}

export function isAdminEmailServer(email: string | null | undefined): boolean {
  if (!email) return false
  const allowed = getAdminEmailsForServer()
  return allowed.includes(normalizeEmail(email))
}

