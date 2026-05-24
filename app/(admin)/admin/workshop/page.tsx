'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'
import { Clock3, Search, SlidersHorizontal } from 'lucide-react'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

type WorkshopInvite = {
  id: string
  orderCode: string
  ownerName: string
  workflowStatus: string
  reviewStatus: string
  adminPreviewUrl: string
  workshopEnteredAt: string | null
}

const STATUS_FILTERS = [
  { id: 'all', label: 'الكل' },
  { id: 'under_review', label: 'Under Review' },
  { id: INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE, label: 'Waiting Customer' },
  { id: INVITE_WORKFLOW_STATUS.APPROVED, label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING, label: 'Ready To Send' },
] as const

const PRIORITY_LABELS = ['عادي', 'متوسط', 'عاجل'] as const

function hoursSince(iso: string | null): number | null {
  if (!iso) return null
  const diff = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(diff)) return null
  return Math.max(0, Math.floor(diff / 3600000))
}

function slaTone(hours: number | null) {
  if (hours == null) return 'text-muted'
  if (hours >= 48) return 'text-rose-600'
  if (hours >= 24) return 'text-amber-600'
  return 'text-emerald-600'
}

export default function AdminWorkshopCenterPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [invites, setInvites] = useState<WorkshopInvite[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'sla'>('sla')

  useEffect(() => {
    const load = async () => {
      if (authLoading) return
      if (!user || !isAdmin) {
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        setError('')
        const token = await user.getIdToken()
        const q = searchQuery.trim()
        const endpoint = q
          ? `/api/admin/invitations/review?limit=200&q=${encodeURIComponent(q)}`
          : '/api/admin/invitations/review?limit=200'
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || 'Failed to load workshop queue')
        setInvites(Array.isArray(data?.invites) ? data.invites : [])
      } catch (e: any) {
        setError(e?.message || 'Failed to load workshop queue')
        setInvites([])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [authLoading, isAdmin, searchQuery, user])

  const filtered = useMemo(() => {
    let rows = [...invites]
    if (statusFilter !== 'all') {
      if (statusFilter === 'rejected') {
        rows = rows.filter((row) => row.reviewStatus === 'changes_requested')
      } else if (statusFilter === 'under_review') {
        rows = rows.filter((row) => row.workflowStatus === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW)
      } else {
        rows = rows.filter((row) => row.workflowStatus === statusFilter)
      }
    }

    rows.sort((a, b) => {
      if (sortBy === 'sla') {
        return (hoursSince(b.workshopEnteredAt) || 0) - (hoursSince(a.workshopEnteredAt) || 0)
      }
      const aTime = new Date(a.workshopEnteredAt || 0).getTime()
      const bTime = new Date(b.workshopEnteredAt || 0).getTime()
      return sortBy === 'newest' ? bTime - aTime : aTime - bTime
    })
    return rows
  }, [invites, sortBy, statusFilter])

  if (authLoading || loading) {
    return <div className="p-8 text-center text-muted">جاري تحميل ورشة التأكد...</div>
  }

  if (!user || !isAdmin) {
    return <div className="p-8 text-center text-muted">غير مصرح بالدخول.</div>
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-4 shadow-admin md:p-5">
        <h2 className="text-lg font-bold text-textDark">Workshop Center</h2>
        <p className="text-sm text-muted">مركز تشغيل ورشة التأكد — فلاتر، SLA، ومعاينة سريعة.</p>
      </section>

      <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto]">
        <label className="relative block">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ابحث عبر Order Code أو Invite ID"
            className="w-full rounded-admin border border-admin-border bg-admin-surface py-2.5 pr-10 pl-3 text-sm outline-none focus:border-primary"
          />
        </label>
        <label className="inline-flex items-center gap-2 rounded-admin border border-admin-border bg-admin-surface px-3 py-2 text-sm">
          <SlidersHorizontal className="h-4 w-4 text-muted" />
          <select
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value as typeof sortBy)}
            className="bg-transparent outline-none"
          >
            <option value="sla">SLA الأعلى</option>
            <option value="newest">الأحدث</option>
            <option value="oldest">الأقدم</option>
          </select>
        </label>
      </section>

      <section className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setStatusFilter(filter.id)}
              className={[
                'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                statusFilter === filter.id
                  ? 'border-primary bg-primarySoft text-primary'
                  : 'border-admin-border bg-admin-surface text-muted hover:text-textDark',
              ].join(' ')}
            >
              {filter.label}
            </button>
        ))}
      </section>

      {error ? (
        <div className="rounded-admin border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
          <p className="font-semibold">{error}</p>
          {error.includes('Firebase Admin') || error.includes('FIREBASE') ? (
            <ul className="mt-3 list-disc space-y-1 pr-5 text-xs leading-relaxed">
              <li>في Vercel أضف: FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY</li>
              <li>أو استخدم FIREBASE_SERVICE_ACCOUNT_BASE64 (أوثق في FIREBASE_ADMIN_SETUP.md)</li>
              <li>بعد الحفظ: Redeploy للمشروع</li>
              <li>محليًا: npm run check:firebase-admin</li>
            </ul>
          ) : null}
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((invite, index) => {
            const slaHours = hoursSince(invite.workshopEnteredAt)
            const priority = PRIORITY_LABELS[Math.min(index % PRIORITY_LABELS.length, 2)]
            return (
              <Link
                key={invite.id}
                href={`/admin/invitations/review/${invite.id}`}
                className="group overflow-hidden rounded-admin-lg border border-admin-border bg-admin-surface shadow-admin transition hover:-translate-y-0.5 hover:shadow-admin-hover"
              >
                <div className="aspect-[9/16] bg-admin-surfaceSoft">
                  {invite.adminPreviewUrl ? (
                    <img src={invite.adminPreviewUrl} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">لا توجد معاينة</div>
                  )}
                </div>
                <div className="space-y-2 p-4">
                  <InviteHeader invite={invite} priority={priority} />
                  <div className={`inline-flex items-center gap-1 text-xs ${slaTone(slaHours)}`}>
                    <Clock3 className="h-3.5 w-3.5" />
                    SLA: {slaHours == null ? '—' : `${slaHours}h`}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-admin-lg border border-dashed border-admin-border bg-admin-surface px-6 py-12 text-center text-muted">
      لا توجد دعوات مطابقة للفلاتر الحالية.
    </div>
  )
}

function InviteHeader({ invite, priority }: { invite: WorkshopInvite; priority: string }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate font-semibold text-textDark">{invite.ownerName || 'مستخدم'}</p>
        <p className="truncate text-xs text-muted">{invite.orderCode || invite.id}</p>
      </div>
      <span className="rounded-full bg-admin-goldSoft px-2 py-0.5 text-[10px] font-medium text-admin-gold">{priority}</span>
    </div>
  )
}
