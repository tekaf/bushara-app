/**
 * Client-safe Moyasar config. Never import server-only modules here.
 */
export function getMoyasarPublishableKey(): string {
  return String(process.env.NEXT_PUBLIC_MOYASAR_PUBLISHABLE_KEY || '').trim()
}

export function isMoyasarCheckoutAvailable(): boolean {
  return Boolean(getMoyasarPublishableKey())
}

export function getPublicAppUrl(): string {
  return String(process.env.NEXT_PUBLIC_APP_URL || '').trim().replace(/\/$/, '')
}
