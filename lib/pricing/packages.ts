export type PackageTier = {
  guests: number
  paidPrice: number
  oldPrice: number
}

export const LAUNCH_DISCOUNT_PERCENT = 60

export const PACKAGE_TIERS: PackageTier[] = [
  { guests: 50, paidPrice: 299, oldPrice: 734 },
  { guests: 100, paidPrice: 379, oldPrice: 949 },
  { guests: 150, paidPrice: 469, oldPrice: 1165 },
  { guests: 200, paidPrice: 549, oldPrice: 1380 },
  { guests: 250, paidPrice: 749, oldPrice: 1884 },
  { guests: 300, paidPrice: 839, oldPrice: 2099 },
  { guests: 350, paidPrice: 929, oldPrice: 2315 },
  { guests: 400, paidPrice: 999, oldPrice: 2530 },
  { guests: 450, paidPrice: 1099, oldPrice: 2747 },
]

export const PACKAGE_PRICE_MAP: Record<string, number> = Object.fromEntries(
  PACKAGE_TIERS.map((tier) => [String(tier.guests), tier.paidPrice])
)

export function getPackageTierBySize(packageSize: string | number) {
  const value = Number(packageSize)
  return PACKAGE_TIERS.find((tier) => tier.guests === value) || null
}

