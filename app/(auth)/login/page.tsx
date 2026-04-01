'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '@/lib/firebase/config'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import { ArrowLeft } from 'lucide-react'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

export default function LoginPage() {
  const router = useRouter()
  const searchParams = useMemo(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''), [])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resetStatus, setResetStatus] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const credential = await signInWithEmailAndPassword(auth, email, password)
      const explicitNext = searchParams.get('next')
      const nextPath =
        explicitNext || (isAdminEmailClient(credential.user.email) ? '/admin' : '/dashboard')
      router.push(nextPath)
    } catch (err: any) {
      setError(err.message || 'حدث خطأ أثناء تسجيل الدخول')
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
    } catch (err: any) {
      setError(err.message || 'تعذر إرسال رابط إعادة التعيين')
    }
  }

  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen">
        <div className="container mx-auto max-w-md">
          <div className="bg-white rounded-2xl p-8 shadow-lg">
            <div className="mb-8">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-muted hover:text-primary transition-colors mb-6"
              >
                <ArrowLeft size={20} />
                العودة
              </Link>
              <h1 className="text-3xl font-bold mb-2">تسجيل الدخول</h1>
              <p className="text-muted">مرحباً بعودتك!</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}
              {resetStatus && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
                  {resetStatus}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block mb-2 font-semibold">
                  البريد الإلكتروني
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="example@email.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block mb-2 font-semibold">
                  كلمة المرور
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={handleResetPassword}
                  className="mt-2 text-sm text-primary hover:text-accent"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول'}
              </button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-muted">
                ليس لديك حساب؟{' '}
                <Link
                  href={`/register${searchParams.get('next') ? `?next=${encodeURIComponent(searchParams.get('next') || '')}` : ''}`}
                  className="text-primary font-semibold hover:text-accent"
                >
                  سجل الآن
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}



