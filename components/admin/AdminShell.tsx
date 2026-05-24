'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  ClipboardCheck,
  ShoppingBag,
  Send,
  Layers,
  Upload,
  ImagePlus,
  Users,
  BarChart3,
  Wallet,
  Bell,
  Sparkles,
  Settings,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  User,
} from 'lucide-react'
import { ADMIN_NAV_ITEMS } from '@/components/admin/admin-nav'

const ICONS = {
  LayoutDashboard,
  ClipboardCheck,
  ShoppingBag,
  Send,
  Layers,
  Upload,
  ImagePlus,
  Users,
  BarChart3,
  Wallet,
  Bell,
  Sparkles,
  Settings,
} as const

type AdminShellProps = {
  children: React.ReactNode
  title?: string
  subtitle?: string
}

export default function AdminShell({ children, title, subtitle }: AdminShellProps) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('admin-sidebar-collapsed')
    if (stored === '1') setCollapsed(true)
  }, [])

  useEffect(() => {
    localStorage.setItem('admin-sidebar-collapsed', collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    setMobileOpen(false)
  }, [pathname])

  const activeItem = ADMIN_NAV_ITEMS.find((item) =>
    'exact' in item && item.exact
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
  )

  return (
    <div className="min-h-screen bg-bg">
      <AnimatePresence>
        {mobileOpen ? (
          <motion.button
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="إغلاق القائمة"
          />
        ) : null}
      </AnimatePresence>

      <aside
        className={[
          'fixed inset-y-0 right-0 z-50 flex flex-col border-l border-admin-border bg-admin-sidebar/95 backdrop-blur-xl transition-all duration-300',
          collapsed ? 'w-[76px]' : 'w-[280px]',
          mobileOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        <div className="flex items-center justify-between gap-2 border-b border-admin-borderLight px-4 py-4">
          {!collapsed ? (
            <div>
              <p className="text-xs font-medium text-muted">Bushara Admin OS</p>
              <p className="text-lg font-bold text-textDark">بُشرة</p>
            </div>
          ) : (
            <p className="mx-auto text-lg font-bold text-primary">ب</p>
          )}
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-lg p-2 text-muted hover:bg-admin-surfaceSoft lg:hidden"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          {ADMIN_NAV_ITEMS.map((item) => {
            const Icon = ICONS[item.icon as keyof typeof ICONS]
            const active =
              'exact' in item && item.exact
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`)
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.labelAr}
                className={[
                  'group flex items-center gap-3 rounded-admin px-3 py-2.5 text-sm font-medium transition-all duration-200',
                  active
                    ? 'bg-primarySoft text-primary shadow-sm'
                    : 'text-textDark/80 hover:bg-admin-surfaceSoft hover:text-textDark',
                  collapsed ? 'justify-center px-2' : '',
                ].join(' ')}
              >
                <Icon
                  className={[
                    'h-[18px] w-[18px] shrink-0',
                    active ? 'text-primary' : 'text-muted group-hover:text-primary',
                  ].join(' ')}
                />
                {!collapsed ? <span>{item.labelAr}</span> : null}
              </Link>
            )
          })}
        </nav>

        <SidebarFooter collapsed={collapsed} setCollapsed={setCollapsed} />
      </aside>

      <div
        className={[collapsed ? 'lg:mr-[76px]' : 'lg:mr-[280px]', 'min-h-screen transition-all duration-300'].join(' ')}
      >
        <header className="sticky top-0 z-30 border-b border-admin-borderLight bg-bg/80 backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="rounded-admin border border-admin-border bg-admin-surface p-2 text-textDark lg:hidden"
                aria-label="فتح القائمة"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div>
                <h1 className="text-lg font-bold text-textDark md:text-xl">{title || activeItem?.labelAr || 'لوحة التحكم'}</h1>
                {subtitle ? <p className="text-xs text-muted md:text-sm">{subtitle}</p> : null}
              </div>
            </div>
            <StatusPill />
          </div>
        </header>

        <main className="animate-admin-fade-in p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  )
}

function SidebarFooter({
  collapsed,
  setCollapsed,
}: {
  collapsed: boolean
  setCollapsed: (value: boolean | ((prev: boolean) => boolean)) => void
}) {
  return (
    <div className="space-y-2 border-t border-admin-borderLight p-3">
      <Link
        href="/dashboard"
        className={[
          'flex items-center gap-3 rounded-admin border border-admin-border bg-admin-surface px-3 py-2.5 text-sm text-textDark transition hover:border-primary/30 hover:bg-primarySoft/40',
          collapsed ? 'justify-center px-2' : '',
        ].join(' ')}
      >
        <User className="h-4 w-4 text-muted" />
        {!collapsed ? <span>حسابي كمستخدم</span> : null}
      </Link>
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        className="hidden w-full items-center justify-center gap-2 rounded-admin py-2 text-xs text-muted transition hover:bg-admin-surfaceSoft hover:text-textDark lg:flex"
      >
        {collapsed ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        {!collapsed ? <span>طي القائمة</span> : null}
      </button>
    </div>
  )
}

function StatusPill() {
  return (
    <div className="hidden items-center gap-2 rounded-full border border-admin-border bg-admin-surface px-3 py-1.5 text-xs text-muted md:flex">
      <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
      النظام يعمل
    </div>
  )
}