'use client'

import { formatDistanceToNow } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { CheckCircle2, CreditCard, Send, UserCheck, Users, RefreshCw } from 'lucide-react'
import type { UserActivityItem } from '@/lib/dashboard/user-dashboard'

const ICONS = {
  approval: CheckCircle2,
  send: Send,
  rsvp: UserCheck,
  guests: Users,
  payment: CreditCard,
  update: RefreshCw,
} as const

const ICON_TONES = {
  approval: 'bg-emerald-50 text-emerald-600',
  send: 'bg-sky-50 text-sky-600',
  rsvp: 'bg-violet-50 text-violet-600',
  guests: 'bg-indigo-50 text-indigo-600',
  payment: 'bg-amber-50 text-amber-600',
  update: 'bg-orange-50 text-orange-600',
} as const

export default function ActivityTimeline({
  items,
  loading,
}: {
  items: UserActivityItem[]
  loading?: boolean
}) {
  return (
    <section className="rounded-[22px] border border-gray-100/90 bg-white/90 p-5 shadow-sm backdrop-blur md:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-bold text-textDark">آخر النشاطات</h2>
        <p className="mt-1 text-xs text-muted">متابعة حية لرحلة دعوتك</p>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex gap-3">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-gray-100" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-4 w-2/3 animate-pulse rounded bg-gray-100" />
                <div className="h-3 w-1/3 animate-pulse rounded bg-gray-50" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-muted">
          لا توجد نشاطات بعد. ستظهر هنا عند اعتماد الدعوة أو إضافة المدعوين والردود.
        </p>
      ) : (
        <ol className="relative space-y-0">
          {items.map((item, index) => {
            const Icon = ICONS[item.icon]
            const tone = ICON_TONES[item.icon]
            const isLast = index === items.length - 1
            return (
              <li key={item.id} className="relative flex gap-3 pb-5">
                {!isLast ? (
                  <span
                    aria-hidden
                    className="absolute right-[19px] top-10 bottom-0 w-px bg-gradient-to-b from-violet-200 to-transparent"
                  />
                ) : null}
                <span
                  className={[
                    'relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white shadow-sm',
                    tone,
                  ].join(' ')}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-sm font-semibold text-textDark">{item.title}</p>
                  {item.description ? (
                    <p className="mt-0.5 text-xs leading-6 text-muted">{item.description}</p>
                  ) : null}
                  <p className="mt-1.5 text-[11px] text-muted/80">
                    {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: arSA })}
                  </p>
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}
