'use client'

import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/context'

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const { user } = useAuth()

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 20)
    onScroll()
    window.addEventListener('scroll', onScroll)
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-white/10 backdrop-blur-2xl border-b border-white/15'
          : 'bg-white/8 backdrop-blur-xl border-b border-white/10'
      }`}
      style={{
        WebkitBackdropFilter: 'blur(24px)',
        backgroundImage: `
          linear-gradient(135deg, rgba(180,150,255,0.12), rgba(120,180,255,0.08)),
          radial-gradient(circle at top left, rgba(255,255,255,0.20), transparent 35%),
          radial-gradient(circle at top right, rgba(210,190,255,0.14), transparent 30%)
        `,
        boxShadow: isScrolled
          ? 'inset 0 1px 0 rgba(255,255,255,0.4), 0 8px 30px rgba(90,90,140,0.12)'
          : 'inset 0 1px 0 rgba(255,255,255,0.4)',
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
      <div className="mx-auto flex h-28 max-w-7xl items-center justify-between px-6 lg:px-10">
        <nav className="hidden md:flex items-center gap-8 text-[17px] font-medium text-slate-700">
          <Link href="/packages" className="transition hover:text-slate-900">
            الباقات
          </Link>
          <Link href="/templates" className="transition hover:text-slate-900">
            التصاميم
          </Link>
          <Link href={user ? '/dashboard' : '/login'} className="transition hover:text-slate-900">
            {user ? 'حسابي' : 'تسجيل الدخول'}
          </Link>
        </nav>

        <Link href="/" className="flex items-center justify-center">
          <img
            src="/favicon.png"
            alt="بشارة"
            onError={(event) => {
              event.currentTarget.src = '/icon.png'
            }}
            className="h-28 w-28 object-contain opacity-100 drop-shadow-[0_0_14px_rgba(74,66,118,0.42)]"
          />
        </Link>

        <Link
          href={user ? '/occasions' : '/register'}
          className="hidden md:inline-flex rounded-2xl border border-white/20 bg-gradient-to-br from-[#b6b2ff]/85 to-[#8f8bff]/85 px-6 py-3 text-lg font-semibold text-white shadow-[0_8px_30px_rgba(137,125,255,0.25)] transition hover:scale-[1.02] hover:shadow-[0_12px_40px_rgba(137,125,255,0.32)]"
        >
          ابدأ الآن
        </Link>

        <button
          className="md:hidden text-slate-700"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {isOpen && (
        <div className="mx-4 mb-4 rounded-2xl border border-white/20 bg-white/10 p-4 backdrop-blur-2xl md:hidden">
          <div className="space-y-4 text-slate-700">
            <Link
              href="/packages"
              className="block transition hover:text-slate-900"
              onClick={() => setIsOpen(false)}
            >
              الباقات
            </Link>
            <Link
              href="/templates"
              className="block transition hover:text-slate-900"
              onClick={() => setIsOpen(false)}
            >
              التصاميم
            </Link>
            <Link
              href={user ? '/dashboard' : '/login'}
              className="block transition hover:text-slate-900"
              onClick={() => setIsOpen(false)}
            >
              {user ? 'حسابي' : 'تسجيل الدخول'}
            </Link>
            <Link
              href={user ? '/occasions' : '/register'}
              className="block rounded-2xl border border-white/20 bg-gradient-to-br from-[#b6b2ff]/85 to-[#8f8bff]/85 px-6 py-3 text-center text-base font-semibold text-white shadow-[0_8px_30px_rgba(137,125,255,0.25)] transition hover:scale-[1.01]"
              onClick={() => setIsOpen(false)}
            >
              ابدأ الآن
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}

