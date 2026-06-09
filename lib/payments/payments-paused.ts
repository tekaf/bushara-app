/**
 * TEMPORARY — disable checkout payments until live Moyasar keys are enabled.
 * Remove this file (or set PAYMENTS_PAUSED to false) when ready to accept payments again.
 */
export const PAYMENTS_PAUSED = true

export const PAYMENTS_PAUSED_MESSAGE = 'عذرا، حدث خطأ'

export function arePaymentsPaused(): boolean {
  return PAYMENTS_PAUSED
}
