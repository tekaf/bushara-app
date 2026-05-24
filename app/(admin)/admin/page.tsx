'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  BadgeCheck,
  Banknote,
  CreditCard,
  Percent,
  Send,
  ShoppingCart,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  XCircle,
  ClipboardList,
  MessageCircle,
} from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import AdminQuickActions from '@/components/admin/AdminQuickActions'
import AdminActivityFeed from '@/components/admin/AdminActivityFeed'
import AdminDashboardCharts from '@/components/admin/AdminDashboardCharts'
import MetricCard from '@/components/admin/MetricCard'
import type {
  ActivityFeedItem,
  ChartPoint,
  DashboardMetrics,
  DashboardPeriod,
  FunnelStep,
  MetricTrend,
} from '@/lib/analytics/types'

const EMPTY_METRIC: MetricTrend = { value: 0, previousValue: 0, changePercent: 0, sparkline: [] }

const EMPTY_METRICS: DashboardMetrics = {
  totalRevenue: EMPTY_METRIC,
  revenueToday: EMPTY_METRIC,
  ordersToday: EMPTY_METRIC,
  successfulPayments: EMPTY_METRIC,
  failedPayments: EMPTY_METRIC,
  conversionRate: EMPTY_METRIC,
  pendingWorkshop: EMPTY_METRIC,
  approvedInvitations: EMPTY_METRIC,
  invitationsSent: EMPTY_METRIC,
  whatsappSuccessRate: EMPTY_METRIC,
  activeUsers: EMPTY_METRIC,
  newUsers: EMPTY_METRIC,
}

export default function AdminDashboardPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<DashboardPeriod>('monthly')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [metrics, setMetrics] = useState<DashboardMetrics>(EMPTY_METRICS)
  const [charts, setCharts] = useState<ChartPoint[]>([])
  const [funnel, setFunnel] = useState<FunnelStep[]>([])
  const [activity, setActivity] = useState<ActivityFeedItem[]>([])
  const [topTemplates, setTopTemplates] = useState<Array<{ id: string; label: string; value: number }>>([])
  const [topPackages, setTopPackages] = useState<Array<{ id: string; label: string; value: number }>>([])

  const loadDashboard = useCallback(async () => {
    if (!user) return
    try {
      setLoading(true)
      setError('')
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/analytics/dashboard?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'تعذر تحميل بيانات لوحة التحكم')

      setMetrics(data.metrics || EMPTY_METRICS)
      setCharts(Array.isArray(data.charts) ? data.charts : [])
      setFunnel(Array.isArray(data.funnel) ? data.funnel : [])
      setActivity(Array.isArray(data.activity) ? data.activity : [])
      setTopTemplates(Array.isArray(data.topTemplates) ? data.topTemplates : [])
      setTopPackages(Array.isArray(data.topPackages) ? data.topPackages : [])
    } catch (e: any) {
      setError(e?.message || 'تعذر تحميل بيانات لوحة التحكم')
    } finally {
      setLoading(false)
    }
  }, [period, user])

  useEffect(() => {
    loadDashboard()
  }, [loadDashboard])

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <section className="rounded-admin-lg border border-admin-border bg-gradient-to-l from-admin-surface via-admin-surface to-primarySoft/30 p-5 shadow-admin md:p-6">
        <p className="mb-1 text-xs font-medium text-primary">Bushara Admin OS</p>
        <h2 className="text-2xl font-bold text-textDark md:text-3xl">مركز التشغيل</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          نظرة حية على الإيرادات، الطلبات، ورشة التأكد، وإرسال الدعوات — كلها من بيانات Firestore وStripe الفعلية.
        </p>
      </section>

      <AdminQuickActions />

      {error ? (
        <div className="rounded-admin border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      ) : null}

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <MetricCard label="إجمالي الإيرادات" metric={metrics.totalRevenue} icon={Wallet} format="currency" loading={loading} />
        <MetricCard label="إيرادات اليوم" metric={metrics.revenueToday} icon={Banknote} format="currency" loading={loading} />
        <MetricCard label="طلبات اليوم" metric={metrics.ordersToday} icon={ShoppingCart} loading={loading} />
        <MetricCard label="مدفوعات ناجحة" metric={metrics.successfulPayments} icon={CreditCard} loading={loading} />
        <MetricCard label="مدفوعات فاشلة" metric={metrics.failedPayments} icon={XCircle} loading={loading} />
        <MetricCard label="معدل التحويل" metric={metrics.conversionRate} icon={Percent} format="percent" loading={loading} />
        <MetricCard label="بانتظار الورشة" metric={metrics.pendingWorkshop} icon={ClipboardList} loading={loading} />
        <MetricCard label="دعوات معتمدة" metric={metrics.approvedInvitations} icon={BadgeCheck} loading={loading} />
        <MetricCard label="دعوات مُرسلة" metric={metrics.invitationsSent} icon={Send} loading={loading} />
        <MetricCard label="نجاح WhatsApp" metric={metrics.whatsappSuccessRate} icon={MessageCircle} format="percent" loading={loading} />
        <MetricCard label="مستخدمون نشطون" metric={metrics.activeUsers} icon={Users} loading={loading} />
        <MetricCard label="مستخدمون جدد" metric={metrics.newUsers} icon={UserPlus} loading={loading} />
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

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <AdminActivityFeed items={activity} loading={loading} />
        <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-4 shadow-admin md:p-5">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold text-textDark">ملخص التشغيل</h2>
          </div>
          <ul className="space-y-3 text-sm text-muted">
            <li className="rounded-admin border border-admin-borderLight bg-admin-surfaceSoft px-3 py-2">
              البيانات تُجمع من `payments`, `invites`, `users`, `send_logs`, و`analytics_events`.
            </li>
            <li className="rounded-admin border border-admin-borderLight bg-admin-surfaceSoft px-3 py-2">
              قمع التحويل يتحسن تلقائيًا كلما زادت أحداث التتبع في المنصة.
            </li>
            <li className="rounded-admin border border-admin-borderLight bg-admin-surfaceSoft px-3 py-2">
              استخدم ورشة التأكد لإدارة SLA والمراجعات بسرعة.
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}