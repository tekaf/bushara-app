'use client'

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { ChartPoint, DashboardPeriod, FunnelStep } from '@/lib/analytics/types'

const PERIODS: { id: DashboardPeriod; label: string }[] = [
  { id: 'weekly', label: 'أسبوعي' },
  { id: 'monthly', label: 'شهري' },
  { id: '3months', label: '3 أشهر' },
  { id: 'yearly', label: 'سنوي' },
]

type AdminDashboardChartsProps = {
  charts: ChartPoint[]
  funnel: FunnelStep[]
  topTemplates: Array<{ id: string; label: string; value: number }>
  topPackages: Array<{ id: string; label: string; value: number }>
  period: DashboardPeriod
  onPeriodChange: (period: DashboardPeriod) => void
  loading?: boolean
}

export default function AdminDashboardCharts({
  charts,
  funnel,
  topTemplates,
  topPackages,
  period,
  onPeriodChange,
  loading,
}: AdminDashboardChartsProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-textDark">التحليلات المرئية</h2>
          <p className="text-xs text-muted">نمو الإيرادات والطلبات والتحويل</p>
        </div>
        <div className="flex flex-wrap gap-1 rounded-admin border border-admin-border bg-admin-surface p-1">
          {PERIODS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onPeriodChange(item.id)}
              className={[
                'rounded-md px-3 py-1.5 text-xs font-medium transition',
                period === item.id ? 'bg-primary text-white shadow-sm' : 'text-muted hover:bg-admin-surfaceSoft',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <ChartCard title="نمو الإيرادات" subtitle="إجمالي المدفوعات خلال الفترة">
          {loading ? <ChartSkeleton /> : <RevenueChart data={charts} />}
        </ChartCard>
        <ChartCard title="الطلبات والزوار" subtitle="مقارنة الطلبات مع زيارات الصفحات">
          {loading ? <ChartSkeleton /> : <OrdersVisitorsChart data={charts} />}
        </ChartCard>
        <ChartCard title="قمع التحويل" subtitle="من الزائر إلى إرسال الدعوات">
          {loading ? <ChartSkeleton /> : <FunnelChart data={funnel} />}
        </ChartCard>
        <ChartCard title="إرسال الدعوات" subtitle="حجم الإرسال خلال الفترة">
          {loading ? <ChartSkeleton /> : <InviteSendsChart data={charts} />}
        </ChartCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <TopListCard title="أفضل التصاميم" items={topTemplates} loading={loading} />
        <TopListCard title="أكثر الباقات شراءً" items={topPackages} loading={loading} />
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-4 shadow-admin md:p-5">
      <ChartHeader title={title} subtitle={subtitle} />
      <div className="mt-4 h-[260px]">{children}</div>
    </section>
  )
}

function ChartHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-sm font-bold text-textDark">{title}</h3>
      <p className="text-xs text-muted">{subtitle}</p>
    </div>
  )
}

function ChartSkeleton() {
  return <div className="h-full animate-pulse rounded-admin bg-admin-borderLight" />
}

function RevenueChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <defs>
          <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#6B4EFF" stopOpacity={0.25} />
            <stop offset="95%" stopColor="#6B4EFF" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#ECECF2" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A8A9E' }} />
        <YAxis tick={{ fontSize: 11, fill: '#8A8A9E' }} />
        <Tooltip />
        <Area type="monotone" dataKey="revenue" stroke="#6B4EFF" fill="url(#revenueGradient)" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function OrdersVisitorsChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ECECF2" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A8A9E' }} />
        <YAxis tick={{ fontSize: 11, fill: '#8A8A9E' }} />
        <Tooltip />
        <Bar dataKey="orders" fill="#6B4EFF" radius={[6, 6, 0, 0]} />
        <Bar dataKey="visitors" fill="#C4A962" radius={[6, 6, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

function InviteSendsChart({ data }: { data: ChartPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="#ECECF2" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#8A8A9E' }} />
        <YAxis tick={{ fontSize: 11, fill: '#8A8A9E' }} />
        <Tooltip />
        <Area type="monotone" dataKey="inviteSends" stroke="#8B5CF6" fill="#EDE9FF" strokeWidth={2} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function FunnelChart({ data }: { data: FunnelStep[] }) {
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      {data.map((step) => (
        <div key={step.step}>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-textDark">{step.label}</span>
            <span className="text-muted">
              {step.count.toLocaleString('ar-SA')} ({step.rateFromStart}%)
            </span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-admin-borderLight">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.max(step.rateFromStart, 4)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function TopListCard({
  title,
  items,
  loading,
}: {
  title: string
  items: Array<{ id: string; label: string; value: number }>
  loading?: boolean
}) {
  const max = Math.max(...items.map((item) => item.value), 1)

  return (
    <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-4 shadow-admin md:p-5">
      <h3 className="mb-4 text-sm font-bold text-textDark">{title}</h3>
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-admin-borderLight" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted">لا توجد بيانات كافية بعد.</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="font-medium text-textDark">{item.label}</span>
                <span className="text-muted">{item.value}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-admin-borderLight">
                <TopBar width={(item.value / max) * 100} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function TopBar({ width }: { width: number }) {
  return <div className="h-full rounded-full bg-accent" style={{ width: `${width}%` }} />
}
