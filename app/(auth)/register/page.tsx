'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createUserWithEmailAndPassword } from 'firebase/auth'
import { doc, setDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import PasswordField from '@/components/auth/PasswordField'
import { evaluatePasswordStrength, mapFirebaseAuthError } from '@/lib/auth/password-strength'
import { ArrowLeft } from 'lucide-react'

function RegisterForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const strength = useMemo(() => evaluatePasswordStrength(password), [password])
  const nextQuery = searchParams.get('next')
  const loginHref = nextQuery ? `/login?next=${encodeURIComponent(nextQuery)}` : '/login'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!strength.isValid) {
      setError('اختر كلمة مرور أقوى وفق المتطلبات أدناه.')
      return
    }
    if (password !== confirmPassword) {
      setError('تأكيد كلمة المرور غير مطابق.')
      return
    }

    setLoading(true)

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password)
      const user = userCredential.user

      await setDoc(doc(db, 'users', user.uid), {
        name,
        email,
        likedTemplateIds: [],
        createdAt: new Date(),
      })

      router.push(nextQuery || '/dashboard')
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: string }).code) : ''
      setError(mapFirebaseAuthError(code) || 'حدث خطأ أثناء إنشاء الحساب')
    } finally {
      setLoading(false)
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
          <h1 className="text-3xl font-bold text-textDark">إنشاء حساب جديد</h1>
          <p className="mt-2 text-sm text-muted">ابدأ رحلتك مع بشارة — حساب واحد لكل دعواتك ومناسباتك.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5 px-8 py-8">
          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-semibold text-textDark">
              الاسم الكامل
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              placeholder="أدخل اسمك الكامل"
            />
          </div>

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
            showStrength
            autoComplete="new-password"
          />

          <PasswordField
            id="confirmPassword"
            label="تأكيد كلمة المرور"
            value={confirmPassword}
            onChange={setConfirmPassword}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-[#1A1A24] py-3.5 text-sm font-semibold text-white transition hover:bg-primary disabled:opacity-50"
          >
            {loading ? 'جاري إنشاء الحساب...' : 'إنشاء الحساب'}
          </button>
        </form>

        <div className="border-t border-[#F0F0F6] px-8 py-6 text-center text-sm text-muted">
          لديك حساب بالفعل؟{' '}
          <Link href={loginHref} className="font-semibold text-primary hover:text-accent">
            سجّل الدخول
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function RegisterPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-[#FAFAFC] px-4 pb-20 pt-32">
        <Suspense fallback={<div className="text-center text-muted">جارٍ التحميل...</div>}>
          <RegisterForm />
        </Suspense>
      </main>
      <Footer />
    </>
  )
}
