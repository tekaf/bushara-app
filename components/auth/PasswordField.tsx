'use client'

import { useMemo, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { evaluatePasswordStrength } from '@/lib/auth/password-strength'

type PasswordFieldProps = {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  showStrength?: boolean
  required?: boolean
  autoComplete?: string
}

export default function PasswordField({
  id,
  label,
  value,
  onChange,
  placeholder = '••••••••',
  showStrength = false,
  required = true,
  autoComplete = 'current-password',
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const strength = useMemo(() => evaluatePasswordStrength(value), [value])

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-sm font-semibold text-textDark">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          minLength={showStrength ? 8 : 6}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className="w-full rounded-xl border border-gray-300 py-3 pl-12 pr-4 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
        <button
          type="button"
          onClick={() => setVisible((prev) => !prev)}
          className="absolute left-3 top-1/2 -translate-y-1/2 rounded-lg p-1 text-gray-500 hover:bg-gray-100 hover:text-textDark"
          aria-label={visible ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>

      {showStrength && value ? (
        <div className="space-y-2 rounded-xl border border-gray-100 bg-[#FAFAFC] px-3 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-1 gap-1">
              {[0, 1, 2, 3].map((index) => (
                <div
                  key={index}
                  className={`h-1.5 flex-1 rounded-full ${
                    strength.score > index ? strength.color : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <span className="text-xs font-semibold text-muted">{strength.label}</span>
          </div>
          <ul className="space-y-1 text-xs text-muted">
            <Rule ok={strength.checks.minLength}>8 أحرف على الأقل</Rule>
            <Rule ok={strength.checks.hasUpper}>حرف كبير (A-Z)</Rule>
            <Rule ok={strength.checks.hasLower}>حرف صغير (a-z)</Rule>
            <Rule ok={strength.checks.hasNumber}>رقم واحد على الأقل</Rule>
          </ul>
        </div>
      ) : null}
    </div>
  )
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={ok ? 'text-green-700' : ''}>
      {ok ? '✓ ' : '○ '}
      {children}
    </li>
  )
}
