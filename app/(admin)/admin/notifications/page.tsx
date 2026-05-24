'use client'

import { useEffect, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { arSA } from 'date-fns/locale'
import { useAuth } from '@/lib/auth/context'
import type { AdminNotificationItem } from '@/lib/analytics/types'

const SEVERITY_STYLES = {
  info: 'border-sky-100 bg-sky-50 text-sky-700',
  warning: 'border-amber-100 bg-amber-50 text-amber-700',
  critical: 'border-rose-100 bg-rose-50 text-rose-700',
}

export default function AdminNotificationsPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([])

  useEffect(() => {
    const load = async () => {
      if (!user) return
      try {
        setLoading(true)
        const token = await user.getIdToken()
        const response = await fetch('/api/admin/notifications', { headers: { Authorization: `Bearer ${token}` } })
        const data = await response.json().catch(() => ({}))
        setNotifications(Array.isArray(data?.notifications) ? data.notifications : [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-5 shadow-admin">
        <h2 className="text-lg font-bold">مركز التنبيهات</h2>
        <p className="text-sm text-muted">Stripe، WhatsApp، Firebase، Queue — severity levels info / warning / critical.</p>
      </section>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <NotificationSkeleton key={i} />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div className="rounded-admin-lg border border-dashed border-admin-border bg-admin-surface px-6 py-12 text-center text-muted">
          لا توجد تنبيهات حالياً.
        </div>
      ) : (
        <NotificationList notifications={notifications} />
      )}
    </div>
  )
}

function NotificationSkeleton() {
  return <div className="h-20 animate-pulse rounded-admin bg-admin-borderLight" />
}

function NotificationList({ notifications }: { notifications: AdminNotificationItem[] }) {
  return (
    <div className="space-y-3">
      {notifications.map((item) => (
        <article
          key={item.id}
          className={['rounded-admin-lg border px-4 py-4 shadow-admin', SEVERITY_STYLES[item.severity]].join(' ')}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold">{item.title}</p>
              <p className="mt-1 text-sm opacity-90">{item.message}</p>
            </div>
            <span className="text-[11px] uppercase">{item.severity}</span>
          </div>
          <p className="mt-2 text-xs opacity-70">
            {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true, locale: arSA })}
          </p>
        </article>
      ))}
    </div>
  )
}
