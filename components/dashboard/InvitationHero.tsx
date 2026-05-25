'use client'

import Link from 'next/link'
import { CalendarDays, Sparkles } from 'lucide-react'
import type { DashboardInviteRow } from '@/lib/dashboard/user-dashboard'
import {
  canSendInvitations,
  formatInviteDate,
  getCoupleDisplayName,
  getCustomerWorkflowLabel,
  getInvitePreviewUrl,
  getManageInviteHref,
  getOccasionLabel,
  getViewInviteHref,
  getWorkflowBadgeTone,
  isDraftInvite,
} from '@/lib/dashboard/user-dashboard'

type InvitationHeroProps = {
  invite: DashboardInviteRow | null
  loading?: boolean
  name?: string
}

export default function InvitationHero({ invite, loading, name }: InvitationHeroProps) {
  if (loading) {
    return (
      <section className="animate-admin-fade-in overflow-hidden rounded-[28px] border border-violet-100/80 bg-white/70 p-6 shadow-[0_20px_60px_rgba(107,78,255,0.08)] backdrop-blur md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="order-1 h-[360px] animate-pulse rounded-[24px] bg-violet-50/80 lg:order-2 lg:h-[420px] lg:w-[min(340px,38%)] lg:shrink-0" />
          <div className="order-2 flex-1 space-y-4 lg:order-1">
            <div className="h-4 w-32 animate-pulse rounded bg-gray-100" />
            <div className="h-10 w-3/4 animate-pulse rounded bg-gray-100" />
            <div className="h-5 w-1/2 animate-pulse rounded bg-gray-100" />
            <div className="h-12 w-40 animate-pulse rounded-full bg-gray-100" />
          </div>
        </div>
      </section>
    )
  }

  if (!invite) {
    return (
      <section className="animate-admin-fade-in relative overflow-hidden rounded-[28px] border border-violet-100/80 bg-gradient-to-br from-white via-violet-50/40 to-white p-8 text-center shadow-[0_20px_60px_rgba(107,78,255,0.06)] md:p-12">
        <div className="pointer-events-none absolute -left-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -right-10 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <p className="mb-2 text-sm font-medium text-muted">مرحبًا {name || 'بك'}</p>
        <h2 className="mb-3 text-2xl font-bold text-textDark md:text-3xl">ابدأ دعوتك الأولى</h2>
        <p className="mx-auto mb-8 max-w-md text-sm leading-7 text-muted">
          صمّم دعوة فاخرة خلال دقائق، وستظهر هنا معاينة حية وحالة واضحة لكل خطوة.
        </p>
        <Link
          href="/packages"
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-primary/20 transition hover:bg-accent"
        >
          <Sparkles className="h-4 w-4" />
          صمم دعوة جديدة
        </Link>
      </section>
    )
  }

  const previewUrl = getInvitePreviewUrl(invite)
  const workflowStatus = String(invite.workflowStatus || '')
  const badge = getWorkflowBadgeTone(workflowStatus)
  const manageHref = getManageInviteHref(invite)
  const viewHref = getViewInviteHref(invite)
  const sendHref = `/guests?invId=${encodeURIComponent(invite.id)}`
  const canSend = canSendInvitations(invite)
  const isDraft = isDraftInvite(invite)
  const viewExternal = viewHref.startsWith('http')

  return (
    <section className="animate-admin-fade-in relative overflow-hidden rounded-[28px] border border-violet-100/70 bg-gradient-to-br from-white via-white to-violet-50/30 p-5 shadow-[0_24px_64px_rgba(46,46,56,0.07)] backdrop-blur md:p-8">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/5 to-transparent" />

      <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-10">
        {/* Preview — top on mobile, visual left on desktop (RTL) */}
        <div className="order-1 mx-auto w-full max-w-[280px] shrink-0 lg:order-2 lg:mx-0 lg:max-w-none lg:w-[min(340px,38%)]">
          <Link
            href={manageHref}
            className="group block overflow-hidden rounded-[24px] border border-white/80 bg-white p-2 shadow-[0_16px_48px_rgba(107,78,255,0.14)] ring-1 ring-violet-100/80 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_24px_56px_rgba(107,78,255,0.18)]"
          >
            <div className="relative aspect-[9/16] overflow-hidden rounded-[18px] bg-gradient-to-br from-primarySoft/60 to-white">
              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt={getCoupleDisplayName(invite)}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
                  <Sparkles className="h-8 w-8 text-primary/60" />
                  <p className="text-sm font-medium text-muted">معاينة الدعوة قريبًا</p>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
            </div>
          </Link>
        </div>

        {/* Info — right on desktop RTL */}
        <div className="order-2 flex flex-1 flex-col lg:order-1">
          <p className="mb-3 text-sm font-medium text-muted">
            {isDraft ? 'مسودة دعوتك' : 'دعوتك الحالية'}
          </p>

          <h2 className="mb-4 text-3xl font-bold leading-tight tracking-tight text-textDark md:text-4xl lg:text-[2.35rem]">
            {getCoupleDisplayName(invite)}
          </h2>

          <div className="mb-5 flex flex-wrap items-center gap-3 text-sm text-muted">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-100 bg-white/80 px-3 py-1.5">
              <CalendarDays className="h-4 w-4 text-primary" />
              {formatInviteDate(invite.date, invite.time)}
            </span>
            <span className="rounded-full border border-gray-100 bg-white/80 px-3 py-1.5 font-medium text-textDark">
              {getOccasionLabel(invite.selectedOccasion || invite.occasionType)}
            </span>
          </div>

          <div className="mb-6">
            <span
              className={[
                'inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm font-semibold',
                badge.className,
              ].join(' ')}
            >
              {workflowStatus ? badge.label : isDraft ? 'مسودة' : getCustomerWorkflowLabel(workflowStatus)}
            </span>
          </div>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
            <Link
              href={manageHref}
              className="inline-flex items-center justify-center rounded-2xl bg-primary px-5 py-3 text-sm font-semibold text-white shadow-md shadow-primary/15 transition hover:bg-accent"
            >
              إدارة الدعوة
            </Link>
            {viewExternal ? (
              <a
                href={viewHref}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white/90 px-5 py-3 text-sm font-semibold text-textDark transition hover:border-primary/30 hover:bg-violet-50/50"
              >
                عرض الدعوة
              </a>
            ) : (
              <Link
                href={viewHref}
                className="inline-flex items-center justify-center rounded-2xl border border-gray-200 bg-white/90 px-5 py-3 text-sm font-semibold text-textDark transition hover:border-primary/30 hover:bg-violet-50/50"
              >
                عرض الدعوة
              </Link>
            )}
            {canSend ? (
              <Link
                href={sendHref}
                className="inline-flex items-center justify-center rounded-2xl border border-primary/20 bg-primarySoft/50 px-5 py-3 text-sm font-semibold text-primary transition hover:bg-primarySoft"
              >
                إرسال الدعوات
              </Link>
            ) : (
              <span className="inline-flex items-center justify-center rounded-2xl border border-dashed border-gray-200 px-5 py-3 text-sm font-medium text-muted">
                الإرسال يتاح بعد الاعتماد
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
