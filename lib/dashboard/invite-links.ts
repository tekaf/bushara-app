import { canProceedAfterWorkshop } from '@/lib/invitations/workflow'
import { isDraftInvite, isPaidInvite, type DashboardInviteRow } from '@/lib/dashboard/user-dashboard'

export function resolveDashboardInviteHref(invite: DashboardInviteRow): string {
  if (isDraftInvite(invite)) {
    const templateId = String(invite?.designId || '').trim()
    return templateId ? `/templates/${encodeURIComponent(templateId)}` : '/templates'
  }
  if (isPaidInvite(invite) && canProceedAfterWorkshop(String(invite?.workflowStatus || invite?.status || ''))) {
    return `/dashboard/invites/${encodeURIComponent(invite.id)}`
  }
  if (isPaidInvite(invite)) {
    return `/dashboard/invites/${encodeURIComponent(invite.id)}/workshop-status`
  }
  return '/checkout'
}

export function resolveDashboardInviteAction(invite: DashboardInviteRow): string {
  if (isDraftInvite(invite)) return 'أكمل التصميم'
  if (!isPaidInvite(invite)) return 'أكمل الدفع'
  if (canProceedAfterWorkshop(String(invite?.workflowStatus || invite?.status || ''))) return 'إدارة الدعوة'
  return 'متابعة الحالة'
}
