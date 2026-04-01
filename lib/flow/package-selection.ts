export type SelectedPackage = {
  guests: number
  price: number
}

export const SELECTED_PACKAGE_STORAGE_KEY = 'bushara_selected_package'

function parsePositiveInt(value: unknown): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) return 0
  return Math.floor(numeric)
}

export function parsePackageFromParams(packageGuests: string, packagePrice: string): SelectedPackage | null {
  const guests = parsePositiveInt(packageGuests)
  const price = parsePositiveInt(packagePrice)
  if (!guests || !price) return null
  return { guests, price }
}

export function readPackageFromSessionStorage(): SelectedPackage | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.sessionStorage.getItem(SELECTED_PACKAGE_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { guests?: unknown; price?: unknown }
    const guests = parsePositiveInt(parsed?.guests)
    const price = parsePositiveInt(parsed?.price)
    if (!guests || !price) return null
    return { guests, price }
  } catch {
    return null
  }
}

