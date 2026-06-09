import 'server-only'

/**
 * Converts checkout amounts to Moyasar halalas (1 SAR = 100 halalas).
 * Accepts either SAR (e.g. 299) or halalas (e.g. 29900).
 */
export function normalizeAmountToHalalas(amount: number, referencePriceSar?: number): number {
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('المبلغ غير صالح')
  }

  const rounded = Math.round(value)

  if (rounded >= 10000) {
    return rounded
  }

  const reference = Number(referencePriceSar)
  if (Number.isFinite(reference) && reference > 0 && rounded === Math.round(reference)) {
    return rounded * 100
  }

  if (rounded >= 100 && rounded <= 9999) {
    return rounded * 100
  }

  return rounded
}
