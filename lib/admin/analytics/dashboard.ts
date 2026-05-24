import type { DashboardPeriod, MetricTrend } from '@/lib/analytics/types'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'
import { PACKAGE_PRICE_MAP } from '@/lib/pricing/packages'
import type { Firestore } from 'firebase-admin/firestore'

function toDate(value: unknown): Date | null {
  if (!value) return null
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate()
  }
  const d = new Date(String(value))
  return Number.isFinite(d.getTime()) ? d : null
}

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function periodRange(period: DashboardPeriod, now = new Date()) {
  const end = now
  let start: Date
  let previousStart: Date
  let previousEnd: Date
  let bucketDays: number

  switch (period) {
    case 'weekly':
      start = addDays(startOfDay(now), -6)
      previousEnd = addDays(start, -1)
      previousStart = addDays(previousEnd, -6)
      bucketDays = 1
      break
    case 'monthly':
      start = addDays(startOfDay(now), -29)
      previousEnd = addDays(start, -1)
      previousStart = addDays(previousEnd, -29)
      bucketDays = 1
      break
    case '3months':
      start = addDays(startOfDay(now), -89)
      previousEnd = addDays(start, -1)
      previousStart = addDays(previousEnd, -89)
      bucketDays = 7
      break
    case 'yearly':
    default:
      start = addDays(startOfDay(now), -364)
      previousEnd = addDays(start, -1)
      previousStart = addDays(previousEnd, -364)
      bucketDays = 30
      break
  }

  return { start, end, previousStart, previousEnd, bucketDays }
}

function buildSparkline(values: number[], buckets = 7): number[] {
  if (values.length <= buckets) return values
  const chunk = Math.ceil(values.length / buckets)
  const result: number[] = []
  for (let i = 0; i < values.length; i += chunk) {
    const slice = values.slice(i, i + chunk)
    result.push(slice.reduce((a, b) => a + b, 0))
  }
  return result.slice(-buckets)
}

function metricTrend(current: number, previous: number, sparkline: number[]): MetricTrend {
  const changePercent =
    previous === 0 ? (current > 0 ? 100 : 0) : Math.round(((current - previous) / previous) * 1000) / 10
  return { value: current, previousValue: previous, changePercent, sparkline }
}

function resolvePaymentAmount(row: Record<string, unknown>): number {
  const amount = Number(row?.amount || 0)
  if (amount > 0) return amount
  const packageId = String(row?.packageId || '').trim()
  return PACKAGE_PRICE_MAP[packageId] || 0
}

function inRange(date: Date | null, start: Date, end: Date): boolean {
  if (!date) return false
  return date >= start && date <= end
}

function bucketKey(date: Date, start: Date, bucketDays: number): string {
  const diffDays = Math.floor((startOfDay(date).getTime() - startOfDay(start).getTime()) / 86400000)
  const bucketIndex = Math.floor(diffDays / bucketDays)
  const bucketStart = addDays(startOfDay(start), bucketIndex * bucketDays)
  return bucketStart.toISOString().slice(0, 10)
}

function formatBucketLabel(key: string, bucketDays: number): string {
  const d = new Date(key)
  if (bucketDays >= 30) return d.toLocaleDateString('ar-SA', { month: 'short' })
  if (bucketDays >= 7) return `أسبوع ${Math.ceil(d.getDate() / 7)}`
  return d.toLocaleDateString('ar-SA', { weekday: 'short' })
}

async function safeQuery<T>(
  fn: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await fn()
  } catch {
    return fallback
  }
}

export async function buildDashboardAnalytics(adminDb: Firestore, period: DashboardPeriod = 'monthly') {
  const now = new Date()
  const todayStart = startOfDay(now)
  const yesterdayStart = addDays(todayStart, -1)
  const { start, end, previousStart, previousEnd, bucketDays } = periodRange(period, now)

  const [paymentsSnap, invitesSnap, usersSnap, sendLogsSnap, eventsSnap, notificationsSnap] =
    await Promise.all([
      safeQuery(() => adminDb.collection('payments').orderBy('createdAt', 'desc').limit(500).get(), null),
      safeQuery(() => adminDb.collection('invites').orderBy('updatedAt', 'desc').limit(500).get(), null),
      safeQuery(() => adminDb.collection('users').orderBy('createdAt', 'desc').limit(500).get(), null),
      safeQuery(() => adminDb.collection('send_logs').orderBy('createdAt', 'desc').limit(300).get(), null),
      safeQuery(() => adminDb.collection('analytics_events').orderBy('timestamp', 'desc').limit(400).get(), null),
      safeQuery(() => adminDb.collection('admin_notifications').orderBy('createdAt', 'desc').limit(50).get(), null),
    ])

  const payments = (paymentsSnap?.docs || []).map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Array<Record<string, unknown> & { id: string }>
  const invites = (invitesSnap?.docs || []).map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Array<Record<string, unknown> & { id: string }>
  const users = (usersSnap?.docs || []).map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Array<Record<string, unknown> & { id: string }>
  const sendLogs = (sendLogsSnap?.docs || []).map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Array<Record<string, unknown> & { id: string }>
  const events = (eventsSnap?.docs || []).map((doc) => ({ id: doc.id, ...(doc.data() as Record<string, unknown>) })) as Array<Record<string, unknown> & { id: string }>

  const paidPayments = payments.filter((p) => String(p.status) === 'paid')
  const failedPayments = payments.filter((p) => String(p.status) === 'failed')

  const totalRevenue = paidPayments.reduce((sum, p) => sum + resolvePaymentAmount(p), 0)
  const previousRevenue = paidPayments
    .filter((p) => inRange(toDate(p.createdAt), previousStart, previousEnd))
    .reduce((sum, p) => sum + resolvePaymentAmount(p), 0)
  const currentRevenue = paidPayments
    .filter((p) => inRange(toDate(p.createdAt), start, end))
    .reduce((sum, p) => sum + resolvePaymentAmount(p), 0)

  const revenueToday = paidPayments
    .filter((p) => inRange(toDate(p.createdAt), todayStart, now))
    .reduce((sum, p) => sum + resolvePaymentAmount(p), 0)
  const revenueYesterday = paidPayments
    .filter((p) => inRange(toDate(p.createdAt), yesterdayStart, addDays(todayStart, -1)))
    .reduce((sum, p) => sum + resolvePaymentAmount(p), 0)

  const ordersToday = invites.filter((i) => inRange(toDate(i.createdAt), todayStart, now)).length
  const ordersYesterday = invites.filter((i) =>
    inRange(toDate(i.createdAt), yesterdayStart, addDays(todayStart, -1))
  ).length

  const successfulPaymentsCount = paidPayments.filter((p) => inRange(toDate(p.createdAt), start, end)).length
  const previousSuccessfulPayments = paidPayments.filter((p) =>
    inRange(toDate(p.createdAt), previousStart, previousEnd)
  ).length

  const failedPaymentsCount = failedPayments.filter((p) => inRange(toDate(p.createdAt), start, end)).length
  const previousFailedPayments = failedPayments.filter((p) =>
    inRange(toDate(p.createdAt), previousStart, previousEnd)
  ).length

  const pageViews = events.filter((e) => String(e.event) === 'page_view' && inRange(toDate(e.timestamp), start, end)).length
  const checkouts = events.filter((e) => String(e.event) === 'checkout_started' && inRange(toDate(e.timestamp), start, end)).length
  const paymentSuccessEvents = events.filter(
    (e) => String(e.event) === 'payment_success' && inRange(toDate(e.timestamp), start, end)
  ).length
  const conversionRate =
    pageViews > 0 ? Math.round((paymentSuccessEvents / pageViews) * 1000) / 10 : successfulPaymentsCount > 0 && invites.length > 0 ? Math.round((successfulPaymentsCount / invites.length) * 1000) / 10 : 0

  const previousPageViews = events.filter(
    (e) => String(e.event) === 'page_view' && inRange(toDate(e.timestamp), previousStart, previousEnd)
  ).length
  const previousPaymentSuccess = events.filter(
    (e) => String(e.event) === 'payment_success' && inRange(toDate(e.timestamp), previousStart, previousEnd)
  ).length
  const previousConversion =
    previousPageViews > 0 ? Math.round((previousPaymentSuccess / previousPageViews) * 1000) / 10 : 0

  const pendingWorkshop = invites.filter(
    (i) => String(i.workflowStatus) === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW
  ).length
  const previousPendingWorkshop = invites.filter((i) => {
    const d = toDate(i.workshopEnteredAt) || toDate(i.updatedAt)
    return (
      String(i.workflowStatus) === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW &&
      inRange(d, previousStart, previousEnd)
    )
  }).length

  const approvedInvitations = invites.filter(
    (i) =>
      [
        INVITE_WORKFLOW_STATUS.APPROVED,
        INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
        INVITE_WORKFLOW_STATUS.SCHEDULED,
        INVITE_WORKFLOW_STATUS.SENDING,
        INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
        INVITE_WORKFLOW_STATUS.SENT,
      ].includes(String(i.workflowStatus) as never) ||
      String(i.reviewStatus) === 'approved'
  ).length
  const previousApproved = invites.filter((i) => {
    const d = toDate(i.updatedAt)
    return (
      inRange(d, previousStart, previousEnd) &&
      (String(i.reviewStatus) === 'approved' ||
        [
          INVITE_WORKFLOW_STATUS.APPROVED,
          INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
          INVITE_WORKFLOW_STATUS.SCHEDULED,
          INVITE_WORKFLOW_STATUS.SENDING,
          INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
          INVITE_WORKFLOW_STATUS.SENT,
        ].includes(String(i.workflowStatus) as never))
    )
  }).length

  const invitationsSent = invites.filter((i) =>
    [INVITE_WORKFLOW_STATUS.SENT, INVITE_WORKFLOW_STATUS.PARTIALLY_SENT].includes(String(i.workflowStatus) as never)
  ).length
  const previousInvitationsSent = invites.filter((i) => {
    const d = toDate(i.lastSendAt) || toDate(i.updatedAt)
    return (
      inRange(d, previousStart, previousEnd) &&
      [INVITE_WORKFLOW_STATUS.SENT, INVITE_WORKFLOW_STATUS.PARTIALLY_SENT].includes(String(i.workflowStatus) as never)
    )
  }).length

  const whatsappAccepted = sendLogs.filter((l) => String(l.status) === 'accepted').length
  const whatsappFailed = sendLogs.filter((l) => String(l.status) === 'failed').length
  const whatsappTotal = whatsappAccepted + whatsappFailed
  const whatsappSuccessRate = whatsappTotal > 0 ? Math.round((whatsappAccepted / whatsappTotal) * 1000) / 10 : 0

  const thirtyDaysAgo = addDays(todayStart, -30)
  const activeUserIds = new Set<string>()
  invites.forEach((i) => {
    const d = toDate(i.updatedAt) || toDate(i.createdAt)
    if (d && d >= thirtyDaysAgo) activeUserIds.add(String(i.ownerId || ''))
  })
  payments.forEach((p) => {
    const d = toDate(p.createdAt)
    if (d && d >= thirtyDaysAgo) activeUserIds.add(String(p.userId || ''))
  })
  activeUserIds.delete('')

  const newUsers = users.filter((u) => inRange(toDate(u.createdAt), start, end)).length
  const previousNewUsers = users.filter((u) => inRange(toDate(u.createdAt), previousStart, previousEnd)).length

  const revenueSpark = buildSparkline(
    paidPayments
      .filter((p) => inRange(toDate(p.createdAt), start, end))
      .map((p) => resolvePaymentAmount(p))
  )

  const metrics = {
    totalRevenue: metricTrend(totalRevenue, previousRevenue, revenueSpark),
    revenueToday: metricTrend(revenueToday, revenueYesterday, [revenueYesterday, revenueToday]),
    ordersToday: metricTrend(ordersToday, ordersYesterday, [ordersYesterday, ordersToday]),
    successfulPayments: metricTrend(successfulPaymentsCount, previousSuccessfulPayments, buildSparkline(paidPayments.map((p) => (inRange(toDate(p.createdAt), start, end) ? 1 : 0)))),
    failedPayments: metricTrend(failedPaymentsCount, previousFailedPayments, buildSparkline(failedPayments.map((p) => (inRange(toDate(p.createdAt), start, end) ? 1 : 0)))),
    conversionRate: metricTrend(conversionRate, previousConversion, [previousConversion, conversionRate]),
    pendingWorkshop: metricTrend(pendingWorkshop, previousPendingWorkshop, [previousPendingWorkshop, pendingWorkshop]),
    approvedInvitations: metricTrend(approvedInvitations, previousApproved, [previousApproved, approvedInvitations]),
    invitationsSent: metricTrend(invitationsSent, previousInvitationsSent, [previousInvitationsSent, invitationsSent]),
    whatsappSuccessRate: metricTrend(whatsappSuccessRate, whatsappSuccessRate, [whatsappAccepted, whatsappFailed]),
    activeUsers: metricTrend(activeUserIds.size, activeUserIds.size, [activeUserIds.size]),
    newUsers: metricTrend(newUsers, previousNewUsers, [previousNewUsers, newUsers]),
  }

  const bucketMap = new Map<string, { revenue: number; orders: number; visitors: number; inviteSends: number }>()
  const ensureBucket = (key: string) => {
    if (!bucketMap.has(key)) bucketMap.set(key, { revenue: 0, orders: 0, visitors: 0, inviteSends: 0 })
    return bucketMap.get(key)!
  }

  paidPayments.forEach((p) => {
    const d = toDate(p.createdAt)
    if (!d || !inRange(d, start, end)) return
    const key = bucketKey(d, start, bucketDays)
    ensureBucket(key).revenue += resolvePaymentAmount(p)
  })

  invites.forEach((i) => {
    const d = toDate(i.createdAt)
    if (d && inRange(d, start, end)) ensureBucket(bucketKey(d, start, bucketDays)).orders += 1
    const sendDate = toDate(i.lastSendAt)
    if (
      sendDate &&
      inRange(sendDate, start, end) &&
      [INVITE_WORKFLOW_STATUS.SENT, INVITE_WORKFLOW_STATUS.PARTIALLY_SENT].includes(String(i.workflowStatus) as never)
    ) {
      ensureBucket(bucketKey(sendDate, start, bucketDays)).inviteSends += 1
    }
  })

  events.forEach((e) => {
    const d = toDate(e.timestamp)
    if (!d || !inRange(d, start, end)) return
  if (String(e.event) === 'page_view') ensureBucket(bucketKey(d, start, bucketDays)).visitors += 1
  })

  const chartKeys: string[] = []
  for (let cursor = startOfDay(start); cursor <= end; cursor = addDays(cursor, bucketDays)) {
    chartKeys.push(cursor.toISOString().slice(0, 10))
  }

  const charts = chartKeys.map((key) => {
    const row = bucketMap.get(key) || { revenue: 0, orders: 0, visitors: 0, inviteSends: 0 }
    return {
      label: formatBucketLabel(key, bucketDays),
      date: key,
      revenue: row.revenue,
      orders: row.orders,
      visitors: row.visitors,
      inviteSends: row.inviteSends,
    }
  })

  const funnelSteps = [
    { step: 'visitor', label: 'زوار', event: 'page_view' },
    { step: 'template', label: 'اختيار تصميم', event: 'template_selected' },
    { step: 'package', label: 'اختيار باقة', event: 'package_selected' },
    { step: 'checkout', label: 'بدء الدفع', event: 'checkout_started' },
    { step: 'payment', label: 'دفع ناجح', event: 'payment_success' },
    { step: 'sent', label: 'إرسال دعوات', event: 'invitation_sent' },
  ]

  const funnelCounts = funnelSteps.map(({ event }) =>
    events.filter((e) => String(e.event) === event && inRange(toDate(e.timestamp), start, end)).length
  )

  const funnel = funnelSteps.map((step, index) => {
    const count = funnelCounts[index] || 0
    const prev = index > 0 ? funnelCounts[index - 1] || 0 : count
    const startCount = funnelCounts[0] || count || 1
    return {
      step: step.step,
      label: step.label,
      count,
      rateFromPrevious: prev > 0 ? Math.round((count / prev) * 1000) / 10 : 0,
      rateFromStart: startCount > 0 ? Math.round((count / startCount) * 1000) / 10 : 0,
    }
  })

  const templateCounts = new Map<string, number>()
  invites.forEach((i) => {
    const templateId = String(i.designId || i.templateId || '').trim()
    if (!templateId) return
    templateCounts.set(templateId, (templateCounts.get(templateId) || 0) + 1)
  })

  const packageCounts = new Map<string, number>()
  invites.forEach((i) => {
    const packageId = String(i.packageId || '').trim()
    if (!packageId) return
    packageCounts.set(packageId, (packageCounts.get(packageId) || 0) + 1)
  })

  const topTemplates = [...templateCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, value]) => ({ id, label: id.slice(0, 8), value }))

  const topPackages = [...packageCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, value]) => ({ id, label: `${id} ضيف`, value }))

  const activity = buildActivityFeed({ users, invites, payments, sendLogs, events, notificationsSnap })

  return {
    period,
    generatedAt: now.toISOString(),
    metrics,
    charts,
    funnel,
    topTemplates,
    topPackages,
    activity,
    summary: {
      totalInvites: invites.length,
      totalUsers: users.length,
      totalPayments: payments.length,
      checkoutsStarted: checkouts,
    },
  }
}

function buildActivityFeed(input: {
  users: Array<Record<string, unknown>>
  invites: Array<Record<string, unknown>>
  payments: Array<Record<string, unknown>>
  sendLogs: Array<Record<string, unknown>>
  events: Array<Record<string, unknown>>
  notificationsSnap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData> | null
}) {
  const items: Array<{
    id: string
    type: string
    title: string
    description?: string
    severity?: 'info' | 'warning' | 'critical'
    timestamp: string
    metadata?: Record<string, unknown>
  }> = []

  input.users.slice(0, 15).forEach((u) => {
    const d = toDate(u.createdAt)
    if (!d) return
    items.push({
      id: `user-${u.id}`,
      type: 'user_registered',
      title: 'مستخدم جديد',
      description: String(u.name || u.email || u.id),
      severity: 'info',
      timestamp: d.toISOString(),
    })
  })

  input.payments.slice(0, 20).forEach((p) => {
    const d = toDate(p.createdAt)
    if (!d) return
    const paid = String(p.status) === 'paid'
    items.push({
      id: `payment-${p.id}`,
      type: paid ? 'payment_success' : 'payment_failed',
      title: paid ? 'دفع ناجح' : 'فشل الدفع',
      description: `${resolvePaymentAmount(p)} ر.س`,
      severity: paid ? 'info' : 'warning',
      timestamp: d.toISOString(),
      metadata: { inviteId: p.inviteId, packageId: p.packageId },
    })
  })

  input.invites.slice(0, 25).forEach((i) => {
    const ws = String(i.workflowStatus || '')
    const d = toDate(i.workshopEnteredAt) || toDate(i.updatedAt) || toDate(i.createdAt)
    if (!d) return
    if (ws === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW) {
      items.push({
        id: `workshop-${i.id}`,
        type: 'workshop_entered',
        title: 'دعوة دخلت ورشة التأكد',
        description: String(i.orderCode || i.id),
        severity: 'info',
        timestamp: d.toISOString(),
      })
    }
    const summary = i.sendStatusSummary as { sent?: number; failed?: number } | undefined
    if (summary?.sent && summary.sent > 0) {
      items.push({
        id: `send-${i.id}`,
        type: 'invitation_sent',
        title: `تم إرسال ${summary.sent} دعوة`,
        description: String(i.orderCode || i.id),
        severity: 'info',
        timestamp: (toDate(i.lastSendAt) || d).toISOString(),
      })
    }
  })

  input.sendLogs.slice(0, 20).forEach((l) => {
    if (String(l.status) !== 'failed') return
    const d = toDate(l.createdAt)
    if (!d) return
    items.push({
      id: `wa-fail-${l.id}`,
      type: 'whatsapp_send_failed',
      title: 'فشل إرسال واتساب',
      description: String(l.error || l.inviteId || ''),
      severity: 'critical',
      timestamp: d.toISOString(),
    })
  })

  ;(input.notificationsSnap?.docs || []).slice(0, 10).forEach((doc) => {
    const row = doc.data() as Record<string, unknown>
    const d = toDate(row.createdAt)
    if (!d) return
    items.push({
      id: `notify-${doc.id}`,
      type: String(row.type || 'system_notification'),
      title: 'تنبيه نظام',
      description: String(row.customerName || row.type || doc.id),
      severity: row.emailDelivered === false ? 'warning' : 'info',
      timestamp: d.toISOString(),
      metadata: row,
    })
  })

  input.events.slice(0, 15).forEach((e) => {
    const d = toDate(e.timestamp)
    if (!d) return
    if (!['template_selected', 'admin_review_approved', 'webhook_failed'].includes(String(e.event))) return
    items.push({
      id: `event-${e.id}`,
      type: String(e.event),
      title: String(e.event),
      description: String((e.metadata as Record<string, unknown>)?.path || e.templateId || e.invitationId || ''),
      severity: String(e.event) === 'webhook_failed' ? 'critical' : 'info',
      timestamp: d.toISOString(),
    })
  })

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 30)
}

export async function buildAdminNotifications(adminDb: Firestore) {
  const items: Array<{
    id: string
    type: string
    title: string
    message: string
    severity: 'info' | 'warning' | 'critical'
    read: boolean
    timestamp: string
    metadata?: Record<string, unknown>
  }> = []

  const [notificationsSnap, failedLogsSnap, failedPaymentsSnap] = await Promise.all([
    safeQuery(() => adminDb.collection('admin_notifications').orderBy('createdAt', 'desc').limit(40).get(), null),
    safeQuery(() => adminDb.collection('send_logs').orderBy('createdAt', 'desc').limit(80).get(), null),
    safeQuery(() => adminDb.collection('payments').orderBy('createdAt', 'desc').limit(80).get(), null),
  ])

  ;(notificationsSnap?.docs || []).forEach((doc) => {
    const row = doc.data() as Record<string, unknown>
    const d = toDate(row.createdAt)
    items.push({
      id: doc.id,
      type: String(row.type || 'notification'),
      title: row.type === 'gift_package_paid' ? 'شراء باقة هدية' : 'تنبيه إداري',
      message: String(row.customerName || row.type || 'حدث جديد'),
      severity: row.emailDelivered === false ? 'warning' : 'info',
      read: Boolean(row.read),
      timestamp: d?.toISOString() || new Date().toISOString(),
      metadata: row,
    })
  })

  ;(failedLogsSnap?.docs || [])
    .filter((doc) => String((doc.data() as Record<string, unknown>).status) === 'failed')
    .slice(0, 10)
    .forEach((doc) => {
      const row = doc.data() as Record<string, unknown>
      items.push({
        id: `send-${doc.id}`,
        type: 'whatsapp_failure',
        title: 'فشل إرسال WhatsApp',
        message: String(row.error || row.inviteId || doc.id),
        severity: 'critical',
        read: false,
        timestamp: toDate(row.createdAt)?.toISOString() || new Date().toISOString(),
      })
    })

  ;(failedPaymentsSnap?.docs || [])
    .filter((doc) => String((doc.data() as Record<string, unknown>).status) === 'failed')
    .slice(0, 8)
    .forEach((doc) => {
      const row = doc.data() as Record<string, unknown>
      items.push({
        id: `pay-${doc.id}`,
        type: 'payment_failed',
        title: 'فشل دفع Stripe',
        message: `مبلغ ${resolvePaymentAmount(row)} ر.س`,
        severity: 'warning',
        read: false,
        timestamp: toDate(row.createdAt)?.toISOString() || new Date().toISOString(),
      })
    })

  return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 50)
}
