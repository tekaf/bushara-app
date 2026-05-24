'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import AdminDashboardCharts from '@/components/admin/AdminDashboardCharts'
import type { ChartPoint, DashboardPeriod, FunnelStep } from '@/lib/analytics/types'

export default function AdminAnalyticsPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<DashboardPeriod>('monthly')
  const [loading, setLoading] = useState(true)
  const [charts, setCharts] = useState<ChartPoint[]>([])
  const [funnel, setFunnel] = useState<FunnelStep[]>([])
  const [topTemplates, setTopTemplates] = useState<Array<{ id: string; label: string; value: number }>>([])
  const [topPackages, setTopPackages] = useState<Array<{ id: string; label: string; value: number }>>([])

  useEffect(() => {
    const load = async () => {
      if (!user) return
      try {
        setLoading(true)
        const token = await user.getIdToken()
        const response = await fetch(`/api/admin/analytics/dashboard?period=${period}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json().catch(() => ({}))
        setCharts(Array.isArray(data.charts) ? data.charts : [])
        setFunnel(Array.isArray(data.funnel) ? data.funnel : [])
        setTopTemplates(Array.isArray(data.topTemplates) ? data.topTemplates : [])
        setTopPackages(Array.isArray(data.topPackages) ? data.topPackages : [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [period, user])

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-5 shadow-admin">
        <h2 className="text-lg font-bold">Analytics System</h2>
        <p className="text-sm text-muted">
          طبقة `analytics_events` مع أحداث funnel حقيقية — page_view → template → package → checkout → payment → send.
        </p>
      </section>
      <AdminDashboardCharts
        charts={charts}
        funnel={funnel}
        topTemplates={topTemplates}
        topPackages={topPackages}
        period={period}
        onPeriodChange={setPeriod}
        loading={loading}
      />
    </div>
  )
}
