'use client'

import type { MetricTrend } from '@/lib/analytics/types'
import type { LucideIcon } from 'lucide-react'
import { TrendingDown, TrendingUp } from 'lucide-react'

type MetricCardProps = {
  label: string
  metric: MetricTrend
  icon: LucideIcon
  format?: 'number' | 'currency' | 'percent'
  loading?: boolean
}

function formatValue(value: number, format: MetricCardProps['format']) {
  if (format === 'currency') return `${value.toLocaleString('ar-SA')} ر.س`
  if (format === 'percent') return `${value}%`
  return value.toLocaleString('ar-SA')
}

export default function MetricCard({ label, metric, icon: Icon, format = 'number', loading }: MetricCardProps) {
  const positive = metric.changePercent >= 0
  const TrendIcon = positive ? TrendingUp : TrendingDown

  return (
    <div className="group rounded-admin-lg border border-admin-border bg-admin-surface p-4 shadow-admin transition duration-300 hover:-translate-y-0.5 hover:shadow-admin-hover md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="rounded-admin bg-primarySoft/70 p-2.5">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <TrendBadge positive={positive} TrendIcon={TrendIcon} metric={metric} />
      </div>
      <p className="mb-1 text-xs text-muted">{label}</p>
      {loading ? (
        <div className="h-8 w-28 animate-pulse rounded bg-admin-borderLight" />
      ) : (
        <p className="text-2xl font-bold tracking-tight text-textDark">{formatValue(metric.value, format)}</p>
      )}
      <div className="mt-4 flex items-end justify-between gap-2">
        <p className="text-[11px] text-muted">مقارنة بالفترة السابقة</p>
        <MiniSparkline values={metric.sparkline.length ? metric.sparkline : [metric.previousValue, metric.value]} positive={positive} />
      </div>
    </div>
  )
}

function TrendBadge({
  positive,
  TrendIcon,
  metric,
}: {
  positive: boolean
  TrendIcon: typeof TrendingUp
  metric: MetricTrend
}) {
  return (
    <div
      className={[
        'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium',
        positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700',
      ].join(' ')}
    >
      <TrendIcon className="h-3 w-3" />
      {Math.abs(metric.changePercent)}%
    </div>
  )
}
function MiniSparkline({ values, positive }: { values: number[]; positive: boolean }) {
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const points = values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100
      const y = 100 - ((value - min) / range) * 100
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg viewBox="0 0 100 32" className="h-8 w-20 shrink-0">
      <polyline
        fill="none"
        stroke={positive ? '#10B981' : '#F43F5E'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  )
}
