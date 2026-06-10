import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

export type DashboardInviteRow = {
  id: string
  source?: 'invite' | 'draft'
  title?: string
  groomName?: string
  brideName?: string
  designId?: string
  date?: string
  time?: string
  locationName?: string
  packageGuests?: string | number
  packageId?: string
  orderCode?: string
  orderNumber?: string
  guestLimit?: number
  selectedOccasion?: string
  occasionType?: string
  status?: string
  paymentStatus?: string
  workflowStatus?: string
  inviteLockedAfterPayment?: boolean
  previewUrl?: string
  finalUrl?: string
  inviteImageUrl?: string
  adminPreviewUrl?: string
  sendStatusSummary?: {
    total?: number
    sent?: number
    failed?: number
    pending?: number
  }
  updatedAt?: unknown
  createdAt?: unknown
  lastSendAt?: unknown
  workshopApprovedAt?: unknown
  paidAt?: unknown
}

export type UserActivityItem = {
  id: string
  title: string
  description?: string
  timestamp: string
  icon: 'approval' | 'send' | 'rsvp' | 'guests' | 'payment' | 'update'
}

export function toMillis(value: unknown): number {
  if (!value) return 0
  if (typeof (value as { toDate?: () => Date })?.toDate === 'function') {
    return (value as { toDate: () => Date }).toDate().getTime()
  }
  const parsed = new Date(String(value)).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export function toIso(value: unknown): string {
  const ms = toMillis(value)
  return ms > 0 ? new Date(ms).toISOString() : new Date().toISOString()
}

export function isPaidInvite(invite: DashboardInviteRow): boolean {
  return (
    invite?.paymentStatus === 'paid' ||
    invite?.status === 'paid' ||
    invite?.inviteLockedAfterPayment === true
  )
}

export function isDraftInvite(invite: DashboardInviteRow): boolean {
  return invite?.source === 'draft' || String(invite?.id || '').startsWith('draft_')
}

export function getInvitePreviewUrl(invite: DashboardInviteRow): string {
  return String(
    invite?.adminPreviewUrl ||
      invite?.inviteImageUrl ||
      invite?.finalUrl ||
      invite?.previewUrl ||
      ''
  ).trim()
}

export function getOccasionLabel(occasion: string | undefined): string {
  const key = String(occasion || '').trim().toLowerCase()
  if (key === 'wedding') return 'زواج أو ملكة'
  if (key === 'engagement') return 'خطبة'
  if (key === 'special') return 'مناسبة خاصة'
  return 'مناسبة'
}

export function getCustomerWorkflowLabel(status: string): string {
  if (status === INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT) return 'بانتظار الاستكمال'
  if (status === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW) return 'قيد المراجعة'
  if (status === INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE) return 'تحتاج تحديثًا منك'
  if (status === INVITE_WORKFLOW_STATUS.APPROVED) return 'معتمدة'
  if (status === INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING) return 'جاهزة للإرسال'
  if (status === INVITE_WORKFLOW_STATUS.SCHEDULED) return 'مجدولة للإرسال'
  if (status === INVITE_WORKFLOW_STATUS.SENDING) return 'جاري الإرسال'
  if (status === INVITE_WORKFLOW_STATUS.PARTIALLY_SENT) return 'مكتملة جزئيًا'
  if (status === INVITE_WORKFLOW_STATUS.SENT) return 'مكتملة'
  return 'قيد الإعداد'
}

export function getWorkflowBadgeTone(status: string): {
  label: string
  className: string
} {
  if (
    status === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW ||
    status === INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE ||
    status === INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT
  ) {
    return {
      label: getCustomerWorkflowLabel(status),
      className: 'bg-amber-50 text-amber-800 border-amber-100',
    }
  }
  if (status === INVITE_WORKFLOW_STATUS.APPROVED) {
    return {
      label: 'معتمدة',
      className: 'bg-emerald-50 text-emerald-800 border-emerald-100',
    }
  }
  if (
    status === INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING ||
    status === INVITE_WORKFLOW_STATUS.SCHEDULED
  ) {
    return {
      label: getCustomerWorkflowLabel(status),
      className: 'bg-violet-50 text-violet-800 border-violet-100',
    }
  }
  if (
    status === INVITE_WORKFLOW_STATUS.SENDING ||
    status === INVITE_WORKFLOW_STATUS.PARTIALLY_SENT ||
    status === INVITE_WORKFLOW_STATUS.SENT
  ) {
    return {
      label: status === INVITE_WORKFLOW_STATUS.SENT ? 'مكتملة' : getCustomerWorkflowLabel(status),
      className: 'bg-sky-50 text-sky-800 border-sky-100',
    }
  }
  return {
    label: 'قيد الإعداد',
    className: 'bg-gray-50 text-gray-700 border-gray-100',
  }
}

const APPROVED_OR_LATER = new Set<string>([
  INVITE_WORKFLOW_STATUS.APPROVED,
  INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SENT,
])

export function isApprovedInvite(invite: DashboardInviteRow): boolean {
  const workflow = String(invite?.workflowStatus || '').trim()
  if (!workflow) {
    return isPaidInvite(invite) && !isDraftInvite(invite)
  }
  return APPROVED_OR_LATER.has(workflow)
}

/** Hero shows paid real invites; prefers admin-approved, then any paid in progress. */
export function pickFocusInvite(invites: DashboardInviteRow[]): DashboardInviteRow | null {
  const realInvites = invites.filter((row) => !isDraftInvite(row))
  if (!realInvites.length) return null

  const sorted = [...realInvites].sort(
    (a, b) => toMillis(b.updatedAt || b.createdAt) - toMillis(a.updatedAt || a.createdAt)
  )

  const paidApproved = sorted.find((row) => isPaidInvite(row) && isApprovedInvite(row))
  if (paidApproved) return paidApproved

  const paidInProgress = sorted.find((row) => isPaidInvite(row))
  if (paidInProgress) return paidInProgress

  return null
}

export function getPackageLimit(invite: DashboardInviteRow): number {
  const numeric = Number(invite?.guestLimit || invite?.packageGuests || 0)
  if (Number.isFinite(numeric) && numeric > 0) return numeric
  const packageId = String(invite?.packageId || '')
  if (packageId === '50') return 50
  if (packageId === '75') return 75
  if (packageId === '100') return 100
  if (packageId === '150') return 150
  return 0
}

export function formatInviteDate(date?: string, time?: string): string {
  const dateText = String(date || '').trim()
  if (!dateText) return 'التاريخ قيد التحديث'
  try {
    const parsed = new Date(dateText)
    const formatted = Number.isFinite(parsed.getTime())
      ? parsed.toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
      : dateText
    const timeText = String(time || '').trim()
    return timeText ? `${formatted} · ${timeText}` : formatted
  } catch {
    return dateText
  }
}

export function getCoupleDisplayName(invite: DashboardInviteRow): string {
  const groom = String(invite?.groomName || '').trim()
  const bride = String(invite?.brideName || '').trim()
  if (groom && bride) return `${groom} و${bride}`
  if (groom || bride) return groom || bride
  return String(invite?.title || 'دعوتك').trim() || 'دعوتك'
}

export function getManageInviteHref(invite: DashboardInviteRow): string {
  if (isDraftInvite(invite)) {
    const templateId = String(invite?.designId || invite?.id?.replace(/^draft_/, '') || '').trim()
    return templateId ? `/templates/${encodeURIComponent(templateId)}` : '/packages'
  }
  const workflow = String(invite?.workflowStatus || '')
  if (
    workflow === INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT ||
    workflow === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW ||
    workflow === INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE
  ) {
    return `/dashboard/invites/${encodeURIComponent(invite.id)}/workshop-status`
  }
  return `/dashboard/invites/${encodeURIComponent(invite.id)}`
}

export function getViewInviteHref(invite: DashboardInviteRow): string {
  if (isDraftInvite(invite)) {
    const preview = getInvitePreviewUrl(invite)
    return preview || getManageInviteHref(invite)
  }
  return `/invite/${encodeURIComponent(invite.id)}`
}

export function canSendInvitations(invite: DashboardInviteRow): boolean {
  if (isDraftInvite(invite) || !isPaidInvite(invite)) return false
  const workflow = String(invite?.workflowStatus || '')
  return (
    workflow === INVITE_WORKFLOW_STATUS.APPROVED ||
    workflow === INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING ||
    workflow === INVITE_WORKFLOW_STATUS.SCHEDULED ||
    workflow === INVITE_WORKFLOW_STATUS.SENDING ||
    workflow === INVITE_WORKFLOW_STATUS.PARTIALLY_SENT ||
    workflow === INVITE_WORKFLOW_STATUS.SENT
  )
}

export function buildUserActivityFeed(
  invite: DashboardInviteRow | null,
  guests: Array<{
    id?: string
    name?: string
    status?: string
    rsvpStatus?: string
    rsvpRespondedAt?: unknown
    createdAt?: unknown
    updatedAt?: unknown
  }> = []
): UserActivityItem[] {
  const items: UserActivityItem[] = []
  if (!invite) return items

  const inviteId = String(invite.id || 'invite')

  if (isPaidInvite(invite)) {
    items.push({
      id: `${inviteId}-payment`,
      title: 'اكتمل الدفع',
      description: 'تم تفعيل باقتك وبدء رحلة الدعوة.',
      timestamp: toIso(invite.paidAt || invite.updatedAt || invite.createdAt),
      icon: 'payment',
    })
  }

  const workflow = String(invite.workflowStatus || '')
  if (workflow === INVITE_WORKFLOW_STATUS.APPROVED) {
    items.push({
      id: `${inviteId}-approved`,
      title: 'تم اعتماد دعوتك',
      description: 'تصميمك جاهز للخطوة التالية.',
      timestamp: toIso(invite.workshopApprovedAt || invite.updatedAt),
      icon: 'approval',
    })
  }

  const sentCount = Number(invite.sendStatusSummary?.sent || 0)
  if (sentCount > 0) {
    items.push({
      id: `${inviteId}-sent`,
      title: `تم إرسال ${sentCount} دعوة`,
      description: 'وصلت الدعوات إلى قائمة المدعوين.',
      timestamp: toIso(invite.lastSendAt || invite.updatedAt),
      icon: 'send',
    })
  }

  const guestTotal = guests.length
  if (guestTotal > 0) {
    const latestGuestAt = guests.reduce((max, row) => {
      const ts = toMillis(row.createdAt || row.updatedAt)
      return ts > max ? ts : max
    }, 0)
    items.push({
      id: `${inviteId}-guests`,
      title: `تمت إضافة ${guestTotal} ضيف`,
      description: 'قائمة المدعوين جاهزة للمتابعة.',
      timestamp: latestGuestAt > 0 ? new Date(latestGuestAt).toISOString() : toIso(invite.updatedAt),
      icon: 'guests',
    })
  }

  for (const guest of guests) {
    const effective = String(guest.rsvpStatus || guest.status || '').trim()
    if (effective !== 'accepted' && effective !== 'declined') continue
    const name = String(guest.name || 'ضيف').trim() || 'ضيف'
    items.push({
      id: `${inviteId}-rsvp-${guest.id || name}`,
      title: effective === 'accepted' ? `${name} أكد حضوره` : `${name} اعتذر عن الحضور`,
      description: effective === 'accepted' ? 'رد إيجابي على الدعوة.' : 'تم تسجيل الاعتذار.',
      timestamp: toIso(guest.rsvpRespondedAt || guest.updatedAt || guest.createdAt),
      icon: 'rsvp',
    })
  }

  if (workflow === INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE) {
    items.push({
      id: `${inviteId}-needs-update`,
      title: 'تحتاج دعوتك تحديثًا',
      description: 'راجع ملاحظات الورشة وأكمل التعديلات.',
      timestamp: toIso(invite.updatedAt),
      icon: 'update',
    })
  }

  return items
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8)
}
