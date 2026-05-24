export const ANALYTICS_EVENT_NAMES = [
  'page_view',
  'template_selected',
  'package_selected',
  'checkout_started',
  'payment_success',
  'payment_failed',
  'invitation_created',
  'invitation_sent',
  'invitation_opened',
  'rsvp_completed',
  'admin_review_started',
  'admin_review_approved',
  'user_registered',
  'workshop_entered',
  'whatsapp_send_failed',
  'webhook_failed',
] as const

export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number]

export type AnalyticsEventPayload = {
  event: AnalyticsEventName
  timestamp?: Date | string
  userId?: string | null
  invitationId?: string | null
  templateId?: string | null
  packageId?: string | null
  source?: string | null
  metadata?: Record<string, unknown>
  sessionId?: string | null
}

export type AnalyticsEventDoc = AnalyticsEventPayload & {
  id: string
  timestamp: string
  createdAt: string
}

export type DashboardPeriod = 'weekly' | 'monthly' | '3months' | 'yearly'

export type MetricTrend = {
  value: number
  previousValue: number
  changePercent: number
  sparkline: number[]
}

export type DashboardMetrics = {
  totalRevenue: MetricTrend
  revenueToday: MetricTrend
  ordersToday: MetricTrend
  successfulPayments: MetricTrend
  failedPayments: MetricTrend
  conversionRate: MetricTrend
  pendingWorkshop: MetricTrend
  approvedInvitations: MetricTrend
  invitationsSent: MetricTrend
  whatsappSuccessRate: MetricTrend
  activeUsers: MetricTrend
  newUsers: MetricTrend
}

export type ChartPoint = {
  label: string
  date: string
  revenue?: number
  orders?: number
  visitors?: number
  inviteSends?: number
  rsvpRate?: number
}

export type FunnelStep = {
  step: string
  label: string
  count: number
  rateFromPrevious: number
  rateFromStart: number
}

export type ActivityFeedItem = {
  id: string
  type: string
  title: string
  description?: string
  severity?: 'info' | 'warning' | 'critical'
  timestamp: string
  metadata?: Record<string, unknown>
}

export type TopContentItem = {
  id: string
  label: string
  value: number
  secondary?: string
}

export type AdminNotificationItem = {
  id: string
  type: string
  title: string
  message: string
  severity: 'info' | 'warning' | 'critical'
  read: boolean
  timestamp: string
  metadata?: Record<string, unknown>
}
