'use client'

import Link from 'next/link'
import { getCoupleDisplayName, getInvitePreviewUrl, type DashboardInviteRow } from '@/lib/dashboard/user-dashboard'
import { getInviteStatusBadge } from '@/lib/dashboard/invite-status'

type InviteCatalogCardProps = {
  invite: DashboardInviteRow
  href: string
  actionLabel?: string
}

export default function InviteCatalogCard({ invite, href, actionLabel = 'فتح' }: InviteCatalogCardProps) {
  const badge = getInviteStatusBadge(invite)
  const previewUrl = getInvitePreviewUrl(invite)
  const title = String(invite?.title || '').trim() || getCoupleDisplayName(invite) || 'دعوة بدون عنوان'
  const orderCode = String(invite?.orderCode || invite?.orderNumber || '').trim()

  return (
    <Link
      href={href}
      className="group block overflow-hidden rounded-2xl border border-[#EBEBF3] bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
    >
      <div className="relative aspect-[9/14] overflow-hidden bg-[#F5F5F8]">
        {previewUrl ? (
          <img src={previewUrl} alt={title} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted">لا توجد معاينة بعد</div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/55 to-transparent px-3 pb-3 pt-10">
          <span
            className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${badge.className}`}
          >
            {badge.label}
          </span>
        </div>
      </div>
      <div className="space-y-1 px-3 py-3">
        <p className="truncate text-sm font-bold text-textDark">{title}</p>
        {orderCode ? <p className="text-xs text-muted">رقم الطلب: {orderCode}</p> : null}
        <p className="text-xs font-semibold text-primary">{actionLabel}</p>
      </div>
    </Link>
  )
}
