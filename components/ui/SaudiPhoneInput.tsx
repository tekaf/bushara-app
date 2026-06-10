'use client'

import { extractSaudiLocalDigits, validateSaudiLocalDigits } from '@/lib/phone/saudi-phone'

type SaudiPhoneInputProps = {
  value: string
  onChange: (localDigits: string) => void
  onValidityChange?: (valid: boolean, error?: string) => void
  label?: string
  hint?: string
  disabled?: boolean
}

export default function SaudiPhoneInput({
  value,
  onChange,
  onValidityChange,
  label = 'رقم الجوال',
  hint,
  disabled = false,
}: SaudiPhoneInputProps) {
  const digits = extractSaudiLocalDigits(value)
  const validation = validateSaudiLocalDigits(digits)
  const showError = digits.length > 0 && !validation.ok

  const handleChange = (nextRaw: string) => {
    const nextDigits = extractSaudiLocalDigits(nextRaw)
    onChange(nextDigits)
    const nextValidation = validateSaudiLocalDigits(nextDigits)
    onValidityChange?.(nextValidation.ok, nextValidation.ok ? undefined : nextValidation.reason)
  }

  return (
    <div className="space-y-2">
      {label ? <label className="block text-sm font-semibold text-textDark">{label}</label> : null}
      <div
        className={`flex overflow-hidden rounded-xl border bg-white transition focus-within:ring-2 focus-within:ring-primary/20 ${
          showError ? 'border-red-300' : 'border-gray-300'
        }`}
        dir="ltr"
      >
        <div className="flex shrink-0 items-center gap-1 border-r border-gray-200 bg-gray-50 px-3 text-sm font-semibold text-textDark">
          <span aria-hidden>🇸🇦</span>
          <span>+966</span>
        </div>
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          disabled={disabled}
          value={digits}
          onChange={(e) => handleChange(e.target.value)}
          placeholder="555555555"
          maxLength={9}
          className="min-w-0 flex-1 bg-transparent px-4 py-3 text-sm text-textDark outline-none placeholder:text-gray-300"
        />
      </div>
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {showError ? <p className="text-xs text-red-600">{validation.reason}</p> : null}
      {digits.length === 9 && validation.ok ? (
        <p className="text-xs text-green-700">✓ رقم صحيح — 0{digits}</p>
      ) : null}
    </div>
  )
}
