'use client'

import Link from 'next/link'
import { LogOut } from 'lucide-react'

export default function DashboardNav({
  title = 'لوحة معلوماتي',
  subtitle,
  onSignOut,
}: {
  title?: string
  subtitle?: string
  onSignOut: () => void
}) {
  return (
    <nav className="sticky top-0 z-30 border-b border-[#ECECF2]/90 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div>
          <Link href="/dashboard" className="text-base font-bold text-primary md:text-lg">
            {title}
          </Link>
          {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
        </div>
        <button
          type="button"
          onClick={onSignOut}
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted transition hover:bg-[#F6F7FB] hover:text-primary"
        >
          <LogOut size={17} />
          <span className="hidden sm:inline">تسجيل الخروج</span>
        </button>
      </div>
    </nav>
  )
}
