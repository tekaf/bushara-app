'use client'

import Link from 'next/link'
import { ClipboardCheck, Gift, Package, Send, Upload, Ticket } from 'lucide-react'

const ACTIONS = [
  { href: '/admin/templates', label: 'رفع تصميم', icon: Upload, tone: 'bg-primarySoft text-primary' },
  { href: '/admin/workshop', label: 'مراجعة الورشة', icon: ClipboardCheck, tone: 'bg-amber-50 text-amber-700' },
  { href: '/admin/settings', label: 'إنشاء كوبون', icon: Ticket, tone: 'bg-admin-goldSoft text-admin-gold' },
  { href: '/admin/settings', label: 'إضافة باقة', icon: Package, tone: 'bg-emerald-50 text-emerald-700' },
  { href: '/admin/invitations', label: 'إرسال اختبار', icon: Send, tone: 'bg-sky-50 text-sky-700' },
  { href: '/dashboard/invites/new', label: 'دعوة تجريبية', icon: Gift, tone: 'bg-violet-50 text-violet-700' },
]

export default function AdminQuickActions() {
  return (
    <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-4 shadow-admin md:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-textDark">إجراءات سريعة</h2>
        <p className="text-xs text-muted">اختصارات التشغيل اليومي</p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
        {ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.label}
              href={action.href}
              className="group flex flex-col items-center gap-2 rounded-admin border border-admin-borderLight bg-admin-surfaceSoft px-3 py-4 text-center transition hover:border-primary/20 hover:bg-primarySoft/30"
            >
              <span className={`rounded-admin p-2 ${action.tone}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-xs font-medium text-textDark">{action.label}</span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
