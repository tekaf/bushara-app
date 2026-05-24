'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import MetricCard from '@/components/admin/MetricCard'
import { Banknote, CreditCard, Wallet, XCircle } from 'lucide-react'
import type { DashboardMetrics, MetricTrend } from '@/lib/analytics/types'

const EMPTY: MetricTrend = { value: 0, previousValue: 0, changePercent: 0, sparkline: [] }

export default function AdminRevenuePage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [metrics, setMetrics] = useState<Pick<DashboardMetrics, 'totalRevenue' | 'revenueToday' | 'successfulPayments' | 'failedPayments'>>({
    totalRevenue: EMPTY,
    revenueToday: EMPTY,
    successfulPayments: EMPTY,
    failedPayments: EMPTY,
  })

  useEffect(() => {
    const load = async () => {
      if (!user) return
      try {
        setLoading(true)
        const token = await user.getIdToken()
        const response = await fetch('/api/admin/analytics/dashboard?period=monthly', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json().catch(() => ({}))
        setMetrics({
          totalRevenue: data?.metrics?.totalRevenue || EMPTY,
          revenueToday: data?.metrics?.revenueToday || EMPTY,
          successfulPayments: data?.metrics?.successfulPayments || EMPTY,
          failedPayments: data?.metrics?.failedPayments || EMPTY,
        })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-5 shadow-admin">
        <h2 className="text-lg font-bold">الإيرادات</h2>
        <p className="text-sm text-muted">بيانات من مجموعة payments + أسعار الباقات.</p>
      </section>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="إجمالي الإيرادات" metric={metrics.totalRevenue} icon={Wallet} format="currency" loading={loading} />
        <MetricCard label="إيرادات اليوم" metric={metrics.revenueToday} icon={Banknote} format="currency" loading={loading} />
        <MetricCard label="مدفوعات ناجحة" metric={metrics.successfulPayments} icon={CreditCard} loading={loading} />
        <MetricCard label="مدفوعات فاشلة" metric={metrics.failedPayments} icon={XCircle} loading={loading} />
      </div>
    </div>
  )
}
