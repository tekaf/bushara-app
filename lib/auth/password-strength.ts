export type PasswordStrength = {
  score: 0 | 1 | 2 | 3 | 4
  label: string
  color: string
  checks: {
    minLength: boolean
    hasLower: boolean
    hasUpper: boolean
    hasNumber: boolean
    hasSymbol: boolean
  }
  isValid: boolean
}

export function evaluatePasswordStrength(password: string): PasswordStrength {
  const checks = {
    minLength: password.length >= 8,
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  }

  const passed = Object.values(checks).filter(Boolean).length
  const score = Math.min(4, Math.max(0, passed - 1)) as PasswordStrength['score']

  const labels: Record<PasswordStrength['score'], string> = {
    0: 'ضعيفة جداً',
    1: 'ضعيفة',
    2: 'متوسطة',
    3: 'جيدة',
    4: 'قوية',
  }

  const colors: Record<PasswordStrength['score'], string> = {
    0: 'bg-red-500',
    1: 'bg-orange-500',
    2: 'bg-amber-400',
    3: 'bg-lime-500',
    4: 'bg-green-500',
  }

  const isValid =
    checks.minLength && checks.hasLower && checks.hasUpper && checks.hasNumber

  return {
    score,
    label: labels[score],
    color: colors[score],
    checks,
    isValid,
  }
}

export function mapFirebaseAuthError(code: string): string {
  const key = String(code || '').toLowerCase()
  if (key.includes('email-already-in-use')) return 'هذا البريد مسجّل مسبقاً.'
  if (key.includes('invalid-email')) return 'البريد الإلكتروني غير صحيح.'
  if (key.includes('weak-password')) return 'كلمة المرور ضعيفة. استخدم 8 أحرف مع حروف كبيرة وصغيرة ورقم.'
  if (key.includes('wrong-password') || key.includes('invalid-credential')) {
    return 'البريد أو كلمة المرور غير صحيحة.'
  }
  if (key.includes('user-not-found')) return 'لا يوجد حساب بهذا البريد.'
  if (key.includes('too-many-requests')) return 'محاولات كثيرة. انتظر قليلاً ثم حاول مجدداً.'
  return 'حدث خطأ. حاول مرة أخرى.'
}
