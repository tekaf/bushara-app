'use client'

import Link from 'next/link'
import { Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/context'

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)
  const [brandLogoUrl, setBrandLogoUrl] = useState('/favicon.png')
  const { user } = useAuth()

  useEffect(() => {
    const loadBrandLogo = async () => {
      try {
        const response = await fetch('/api/public/home-assets', { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) return
        const logoUrl = String(data?.brandLogoUrl || '').trim()
        if (logoUrl) setBrandLogoUrl(logoUrl)
      } catch {
        // keep fallback logo
      }
    }
    loadBrandLogo()
  }, [])

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-[#d8e6ff] bg-gradient-to-r from-[#dff0ff]/95 via-[#cfe6ff]/92 to-[#dff0ff]/95 backdrop-blur-md">
      <div className="container mx-auto px-4 py-4 relative">
        {/* Logo - Centered at top */}
        <div className="flex items-center justify-center">
          <Link href="/" className="flex items-center">
            <img
              src={brandLogoUrl}
              alt="Busharh"
              className="h-[50px] w-[50px] object-contain"
            />
          </Link>
        </div>

        {/* Desktop Menu - Right side */}
        <div className="hidden md:flex items-center gap-8 absolute left-4 top-1/2 -translate-y-1/2">
          <Link
            href="/packages"
            className="text-[#3a4a6b] hover:text-primary transition-colors"
          >
            الباقات
          </Link>
            <Link
              href="/templates"
              className="text-[#3a4a6b] hover:text-primary transition-colors"
            >
              التصاميم
            </Link>
          {user ? (
            <>
              <Link
                href="/dashboard"
                className="text-[#3a4a6b] hover:text-primary transition-colors"
              >
                حسابي
              </Link>
              <Link
                href="/occasions"
                className="rounded-lg bg-primary px-6 py-2 text-white hover:bg-accent transition-colors"
              >
                ابدأ الآن
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-[#3a4a6b] hover:text-primary transition-colors"
              >
                تسجيل الدخول
              </Link>
              <Link
                href="/register"
                className="rounded-lg bg-primary px-6 py-2 text-white hover:bg-accent transition-colors"
              >
                ابدأ الآن
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden absolute left-4 top-1/2 -translate-y-1/2"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden mt-4 pb-4 space-y-4">
            <Link
              href="/packages"
              className="block text-[#3a4a6b] hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              الباقات
            </Link>
            <Link
              href="/templates"
              className="block text-[#3a4a6b] hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              التصاميم
            </Link>
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  className="block text-[#3a4a6b] hover:text-primary transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  حسابي
                </Link>
                <Link
                  href="/occasions"
                  className="block rounded-lg bg-primary px-6 py-2 text-center text-white hover:bg-accent transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  ابدأ الآن
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="block text-[#3a4a6b] hover:text-primary transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  تسجيل الدخول
                </Link>
                <Link
                  href="/register"
                  className="block rounded-lg bg-primary px-6 py-2 text-center text-white hover:bg-accent transition-colors"
                  onClick={() => setIsOpen(false)}
                >
                  ابدأ الآن
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  )
}

