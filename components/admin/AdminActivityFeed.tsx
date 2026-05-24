'use client'

import { formatDistanceToNow } from 'date-fns'
import { arSA } from 'date-fns/locale'
import type { ActivityFeedItem } from '@/lib/analytics/types'

const SEVERITY_STYLES = {
  info: 'bg-sky-50 text-sky-700 border-sky-100',
  warning: 'bg-amber-50 text-amber-700 border-amber-100',
  critical: 'bg-rose-50 text-rose-700 border-rose-100',
}

export default function AdminActivityFeed({
  items,
  loading,
}: {
  items: ActivityFeedItem[]
  loading?: boolean
}) {
  return (
    <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-4 shadow-admin md:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-bold text-textDark">النشاط الحي</h2>
        <p className="text-xs text-muted">آخر أحداث المنصة في الوقت الفعلي</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-admin bg-admin-borderLight" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="rounded-admin border border-dashed border-admin-border px-4 py-8 text-center text-sm text-muted">
          لا يوجد نشاط حديث بعد. سيتم عرض الأحداث هنا تلقائيًا.
        </p>
      ) : (
        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <article
              key={item.id}
              className="flex items-start gap-3 rounded-admin border border-admin-borderLight bg-admin-surfaceSoft/70 px-3 py-3 transition hover:border-primary/20"
            >
              <span
                className={[
                  'mt-0.5 rounded-full border px-2 py-0.5 text-[10px] font-medium',
                  SEVERITY_STYLES[item.severity || 'info'],
                ].join(' ')}
              >
                {item.severity || 'info'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-textDark">{item.title}</p>
                {item.description ? <p className="truncate text-xs text-muted">{item.description}</p> : null}
                <p className="mt-1 text-[11px] text-muted/80">
                  {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: arSA })}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
