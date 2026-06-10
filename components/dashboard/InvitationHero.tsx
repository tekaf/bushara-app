'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { CalendarDays, MapPin, Sparkles } from 'lucide-react'
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
  isApprovedInvite,
  isPaidInvite,
} from '@/lib/dashboard/user-dashboard'

export type InvitationHeroStats = {
  accepted: number
  declined: number
  pending: number
  sent: number
}

type InvitationHeroProps = {
  invite: DashboardInviteRow | null
  loading?: boolean
  name?: string
  stats?: InvitationHeroStats | null
}

export default function InvitationHero({ invite, loading, name, stats }: InvitationHeroProps) {
  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-8 lg:py-12">
        <div className="grid min-h-[420px] animate-pulse gap-8 lg:grid-cols-[1fr_minmax(260px,360px)] lg:min-h-[520px]">
          <div className="space-y-5 lg:order-1">
            <div className="h-4 w-28 rounded-full bg-[#EFEFF5]" />
            <div className="h-14 w-4/5 rounded-2xl bg-[#EFEFF5]" />
            <div className="h-5 w-2/5 rounded-full bg-[#F5F5FA]" />
            <div className="h-10 w-32 rounded-full bg-[#EFEFF5]" />
          </div>
          <div className="rounded-[32px] bg-[#EFEFF5] lg:order-2" />
        </div>
      </div>
    )
  }

  if (!invite) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 lg:py-16">
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-[36px] border border-[#E8E8F0] bg-gradient-to-br from-white via-[#FBFAFF] to-[#F3F0FF] px-8 py-16 text-center shadow-[0_40px_100px_rgba(107,78,255,0.08)]"
        >
          <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
          <p className="relative mb-2 text-sm font-medium text-muted">مرحبًا {name || 'بك'}</p>
          <h1 className="relative mb-4 text-3xl font-bold tracking-tight text-textDark md:text-4xl">
            دعوتك تبدأ من هنا
          </h1>
          <p className="relative mx-auto mb-10 max-w-lg text-sm leading-8 text-muted">
            عند إتمام الدفع واعتماد التصميم، ستظهر دعوتك هنا بمعاينة حية وحالة واضحة لكل خطوة.
          </p>
          <Link
            href="/packages"
            className="relative inline-flex items-center gap-2 rounded-2xl bg-primary px-8 py-4 text-sm font-semibold text-white shadow-[0_20px_50px_rgba(107,78,255,0.28)] transition hover:bg-accent"
          >
            <Sparkles className="h-4 w-4" />
            ابدأ تصميم دعوتك
          </Link>
        </motion.section>
      </div>
    )
  }

  const previewUrl = getInvitePreviewUrl(invite)
  const workflowStatus = String(invite.workflowStatus || '')
  const badge = getWorkflowBadgeTone(workflowStatus)
  const manageHref = getManageInviteHref(invite)
  const viewHref = getViewInviteHref(invite)
  const sendHref = `/guests?invId=${encodeURIComponent(invite.id)}`
  const canSend = canSendInvitations(invite)
  const viewExternal = viewHref.startsWith('http')
  const location = String(invite.locationName || '').trim()
  const approved = isApprovedInvite(invite)
  const paid = isPaidInvite(invite)

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 lg:py-10">
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="relative overflow-hidden rounded-[36px] border border-[#EBEBF3] bg-white shadow-[0_32px_90px_rgba(31,36,51,0.07)]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,rgba(124,108,255,0.07),transparent_42%),radial-gradient(circle_at_10%_90%,rgba(139,92,246,0.05),transparent_38%)]" />

        <div className="relative grid gap-8 p-6 md:p-10 lg:min-h-[min(72vh,680px)] lg:grid-cols-[1fr_minmax(280px,380px)] lg:items-center lg:gap-12 lg:p-12">
          {/* Details — visual right in RTL (first column) */}
          <div className="flex flex-col justify-center lg:order-1">
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.2em] text-muted/90">
              {approved && paid ? 'دعوتك المعتمدة' : paid ? 'دعوتك الحالية' : 'مسودة الدعوة'}
            </p>

            <h1 className="mb-6 text-[2rem] font-bold leading-[1.12] tracking-tight text-[#1A1A24] sm:text-[2.75rem] lg:text-[3.25rem]">
              {getCoupleDisplayName(invite)}
            </h1>

            <dl className="mb-8 space-y-3 border-s border-[#F0F0F6] ps-0 lg:space-y-3.5">
              <MetaRow icon={CalendarDays} label="التاريخ" value={formatInviteDate(invite.date, invite.time)} />
              <MetaRow label="نوع المناسبة" value={getOccasionLabel(invite.selectedOccasion || invite.occasionType)} />
              {location ? <MetaRow icon={MapPin} label="المدينة" value={location} /> : null}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <dt className="sr-only">الحالة</dt>
                <dd>
                  <span
                    className={[
                      'inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-semibold',
                      badge.className,
                    ].join(' ')}
                  >
                    {workflowStatus ? badge.label : getCustomerWorkflowLabel(workflowStatus)}
                  </span>
                </dd>
              </div>
            </dl>

            {stats && stats.accepted + stats.declined + stats.pending > 0 ? (
              <div className="mb-8 grid grid-cols-3 gap-2 rounded-2xl border border-[#F0F0F6] bg-[#FAFAFC] p-3 sm:max-w-md">
                <StatPill label="حضور" value={stats.accepted} tone="text-emerald-700" />
                <StatPill label="اعتذار" value={stats.declined} tone="text-rose-700" />
                <StatPill label="بانتظار" value={stats.pending} tone="text-amber-700" />
              </div>
            ) : null}

            <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
              <Link
                href={manageHref}
                className="inline-flex h-12 items-center justify-center rounded-2xl bg-[#1A1A24] px-6 text-sm font-semibold text-white shadow-[0_12px_32px_rgba(26,26,36,0.18)] transition hover:bg-primary"
              >
                إدارة الدعوة
              </Link>
              {viewExternal ? (
                <a
                  href={viewHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#E4E4EC] bg-white px-6 text-sm font-semibold text-textDark transition hover:border-primary/30"
                >
                  عرض الدعوة
                </a>
              ) : (
                <Link
                  href={viewHref}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-[#E4E4EC] bg-white px-6 text-sm font-semibold text-textDark transition hover:border-primary/30"
                >
                  عرض الدعوة
                </Link>
              )}
              {canSend ? (
                <Link
                  href={sendHref}
                  className="inline-flex h-12 items-center justify-center rounded-2xl border border-primary/15 bg-primarySoft/40 px-6 text-sm font-semibold text-primary transition hover:bg-primarySoft"
                >
                  إرسال الدعوات
                </Link>
              ) : (
                <span className="inline-flex h-12 items-center justify-center rounded-2xl border border-dashed border-[#E0E0EA] px-6 text-sm text-muted">
                  الإرسال بعد الاعتماد
                </span>
              )}
            </div>
          </div>

          {/* Preview — visual left in RTL (second column), clickable → manage */}
          <div className="flex items-center justify-center lg:order-2">
            <Link
              href={manageHref}
              className="group relative block w-full max-w-[300px] transition duration-500 hover:-translate-y-1 lg:max-w-none"
            >
              <div className="absolute -inset-3 rounded-[40px] bg-gradient-to-br from-primary/15 via-transparent to-accent/10 opacity-0 blur-2xl transition group-hover:opacity-100" />
              <div className="relative overflow-hidden rounded-[32px] border border-[#ECECF2] bg-[#FAFAFC] p-2.5 shadow-[0_28px_70px_rgba(107,78,255,0.14)] ring-1 ring-white">
                <div className="relative aspect-[3/4] overflow-hidden rounded-[26px] bg-gradient-to-b from-[#F5F3FF] to-white sm:aspect-[9/14]">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt={getCoupleDisplayName(invite)}
                      className="h-full w-full object-cover transition duration-700 group-hover:scale-[1.03]"
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                      <Sparkles className="h-10 w-10 text-primary/40" />
                      <p className="px-6 text-sm font-medium text-muted">معاينة الدعوة قيد التجهيز</p>
                    </div>
                  )}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/30 to-transparent opacity-0 transition group-hover:opacity-100" />
                </div>
              </div>
              <p className="mt-3 text-center text-xs font-medium text-muted transition group-hover:text-primary">
                اضغط لإدارة الدعوة
              </p>
            </Link>
          </div>
        </div>
      </motion.section>
    </div>
  )
}

function MetaRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof CalendarDays
  label: string
  value: string
}) {
  return (
    <div className="flex items-start gap-3 text-sm">
      {Icon ? (
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary/70" aria-hidden />
      ) : (
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" aria-hidden />
      )}
      <div>
        <dt className="text-xs font-medium text-muted">{label}</dt>
        <dd className="mt-0.5 font-semibold text-[#2E2E38]">{value}</dd>
      </div>
    </div>
  )
}

function StatPill({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="text-center">
      <p className={`text-xl font-bold ${tone}`}>{value}</p>
      <p className="text-[11px] text-muted">{label}</p>
    </div>
  )
}
