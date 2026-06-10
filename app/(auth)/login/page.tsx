'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import PasswordField from '@/components/auth/PasswordField'
import { mapFirebaseAuthError } from '@/lib/auth/password-strength'
import { ArrowLeft } from 'lucide-react'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetStatus, setResetStatus] = useState('')

  const nextQuery = searchParams.get('next')
  const registerHref = nextQuery ? `/register?next=${encodeURIComponent(nextQuery)}` : '/register'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const nextPath =
        nextQuery || (isAdminEmailClient(credential.user.email) ? '/admin' : '/dashboard')
      router.push(nextPath)
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : ''
      setError(mapFirebaseAuthError(code) || 'حدث خطأ أثناء تسجيل الدخول')
    } finally {
      setLoading(false)
    }
  }

  const handleResetPassword = async () => {
    setError('')
    setResetStatus('')
    if (!email) {
      setError('اكتب البريد الإلكتروني أولاً ثم اضغط نسيت كلمة المرور')
      return
    }
    try {
      await sendPasswordResetEmail(auth, email)
      setResetStatus('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك.')
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : ''
      setError(mapFirebaseAuthError(code) || 'تعذر إرسال رابط إعادة التعيين')
    }
  }

  return (
    <div className="mx-auto w-full max-w-md">
      <div className="overflow-hidden rounded-3xl border border-[#EBEBF3] bg-white shadow-[0_24px_80px_rgba(31,36,51,0.08)]">
        <div className="border-b border-[#F0F0F6] bg-gradient-to-l from-[#FAFAFF] to-white px-8 py-8">
          <Link
            href="/"
            className="mb-6 inline-flex items-center gap-2 text-sm text-muted transition hover:text-primary"
          >
            <ArrowLeft size={18} />
            العودة
          </Link>
          <h1 className="text-3xl font-bold text-textDark">تسجيل الدخول</h1>
          <p className="mt-2 text-sm text-muted">أهلاً بعودتك — سجّل دخولك لمتابعة دعوتك من حيث توقفت.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-8 py-8">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}
          {resetStatus ? (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {resetStatus}
            </div>
          ) : null}

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-semibold text-textDark">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="example@email.com"
            />
          </div>

          <PasswordField
            id="password"
            label="كلمة المرور"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />

          <button
            type="button"
            onClick={handleResetPassword}
            className="text-sm font-semibold text-primary hover:text-accent"
          >
            نسيت كلمة المرور؟
          </button>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[#1A1A24] py-3.5 text-sm font-semibold text-white transition hover:bg-primary disabled:opacity-50"
          >
            {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
          </button>
        </form>

        <div className="border-t border-[#F0F0F6] px-8 py-6 text-center text-sm text-muted">
          ليس لديك حساب؟{' '}
          <Link href={registerHref} className="font-semibold text-primary hover:text-accent">
            أنشئ حساباً جديداً
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#FAFAFC] px-4 pb-20 pt-32">
        <Suspense fallback={<div className="text-center text-muted">جارٍ التحميل...</div>}>
          <LoginForm />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
