'use client'

import Link from 'next/link'
import { ChevronLeft, Heart, Ticket, Users, Wand2 } from 'lucide-react'
import { templatesBrowseUrl } from '@/lib/flow/template-routes'

const actions = [
  {
    title: 'صمم دعوة جديدة',
    href: '/packages',
    icon: Wand2,
    tone: 'from-violet-500/10 to-white text-violet-700',
  },
  {
    title: 'المدعوون',
    href: '/dashboard/guests',
    icon: Users,
    tone: 'from-sky-500/10 to-white text-sky-700',
  },
  {
    title: 'باقاتي',
    href: '/dashboard/invites',
    icon: Ticket,
    tone: 'from-amber-500/10 to-white text-amber-800',
  },
  {
    title: 'التصاميم المفضلة',
    href: templatesBrowseUrl({ favoritesOnly: true }),
    icon: Heart,
    tone: 'from-rose-500/10 to-white text-rose-700',
  },
]

export default function QuickActions({ guestsHref }: { guestsHref?: string }) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-semibold text-muted">أدوات سريعة</h2>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4 lg:gap-3">
        {actions.map((action) => {
          const href =
            action.title === 'المدعوون' && guestsHref ? guestsHref : action.href
          return (
            <Link
              key={action.title}
              href={href}
              className={[
                'group flex items-center gap-3 rounded-2xl border border-gray-100/90 bg-gradient-to-br p-3.5 shadow-sm transition',
                'hover:-translate-y-0.5 hover:border-primary/15 hover:shadow-md',
                action.tone,
              ].join(' ')}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/80 bg-white/90 shadow-sm">
                <action.icon className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-textDark">{action.title}</span>
              </span>
              <ChevronLeft className="h-4 w-4 shrink-0 text-muted/50 transition group-hover:text-primary" />
            </Link>
          )
        })}
      </div>
    </section>
  )
}
