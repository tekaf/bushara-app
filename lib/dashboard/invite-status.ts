import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'
import type { DashboardInviteRow } from '@/lib/dashboard/user-dashboard'
import { isDraftInvite, isPaidInvite } from '@/lib/dashboard/user-dashboard'

export type InviteStatusBadge = {
  label: string
  className: string
}

export function getInviteStatusBadge(invite: DashboardInviteRow): InviteStatusBadge {
  const paymentStatus = String(invite?.paymentStatus || '').toLowerCase()
  const workflow = String(invite?.workflowStatus || '').trim()

  if (paymentStatus === 'failed' || paymentStatus === 'cancelled') {
    return {
      label: 'فشل الدفع',
      className: 'bg-red-50 text-red-700 border-red-100',
    }
  }

  if (isPaidInvite(invite)) {
    return {
      label: 'تم الدفع',
      className: 'bg-green-50 text-green-700 border-green-100',
    }
  }

  if (isDraftInvite(invite) || paymentStatus === 'unpaid' || invite?.status === 'draft') {
    return {
      label: 'مسودة',
      className: 'bg-gray-100 text-gray-600 border-gray-200',
    }
  }

  if (workflow === INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT || paymentStatus === 'pending') {
    return {
      label: 'بانتظار الدفع',
      className: 'bg-amber-50 text-amber-800 border-amber-100',
    }
  }

  return {
    label: 'قيد الإعداد',
    className: 'bg-slate-50 text-slate-600 border-slate-200',
  }
}
