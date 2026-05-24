'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuth } from '@/lib/auth/context'
import { canProceedAfterWorkshop } from '@/lib/invitations/workflow'

function pickText(...values: unknown[]) {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function readPath(source: Record<string, any>, path: string): unknown {
  const parts = path.split('.')
  let current: any = source
  for (const part of parts) {
    if (!current || typeof current !== 'object' || !(part in current)) return undefined
    current = current[part]
  }
  return current
}

function getDateFromUnknown(value: any): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value?.toDate === 'function') {
    const date = value.toDate()
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null
  }
  if (typeof value === 'number') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  if (typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

function formatInviteCreatedAt(invite: Record<string, any>) {
  const date =
    getDateFromUnknown(invite?.createdAt) ||
    getDateFromUnknown(invite?.created_at) ||
    getDateFromUnknown(invite?.createdAtMs)
  if (!date) return '-'
  return new Intl.DateTimeFormat('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function resolveCoupleNames(invite: Record<string, any>) {
  const formData = (invite?.formData && typeof invite.formData === 'object' ? invite.formData : {}) as Record<string, any>
  const groomName = pickText(
    invite?.groomName,
    invite?.groomNameAr,
    readPath(formData, 'groomName'),
    readPath(formData, 'groomNameAr')
  )
  const brideName = pickText(
    invite?.brideName,
    invite?.brideNameAr,
    readPath(formData, 'brideName'),
    readPath(formData, 'brideNameAr')
  )
  return {
    groomName: groomName || '-',
    brideName: brideName || '-',
  }
}

function resolveInviteDisplayTitle(invite: Record<string, any>, groomName: string, brideName: string) {
  const explicitTitle = pickText(invite?.title)
  if (explicitTitle) return explicitTitle
  if (groomName !== '-' || brideName !== '-') return `${groomName} - ${brideName}`
  return 'دعوة بدون عنوان'
}

type InviteFilterMode = 'all' | 'ready' | 'draft' | 'under_review' | 'approved'

function normalizeSearchValue(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function isDraftInviteId(value: string) {
  return String(value || '').trim().startsWith('draft_')
}

function isPaidInvite(invite: any) {
  return (
    invite?.paymentStatus === 'paid' ||
    invite?.status === 'paid' ||
    invite?.inviteLockedAfterPayment === true
  )
}

function isDraftOnlyInvite(invite: any) {
  const prefixedAsDraft = isDraftInviteId(String(invite?.id || ''))
  if (!prefixedAsDraft) return false
  // If invite is already paid/approved, treat it as a real invitation even with legacy draft_ id.
  if (isPaidInvite(invite) || canProceedAfterWorkshop(invite?.workflowStatus || invite?.status)) return false
  return true
}

export default function DashboardGuestsPage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [invites, setInvites] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<InviteFilterMode>('all')

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }

    const load = async () => {
      try {
        const snap = await getDocs(query(collection(db, 'invites'), where('ownerId', '==', user.uid)))
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as any) }))
          .sort((a, b) => {
            const aDate = a?.updatedAt?.toDate?.() || a?.createdAt?.toDate?.() || new Date(0)
            const bDate = b?.updatedAt?.toDate?.() || b?.createdAt?.toDate?.() || new Date(0)
            return bDate.getTime() - aDate.getTime()
          })
        setInvites(rows)
      } catch (error) {
        console.error('Failed loading guest invites:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [authLoading, user])

  const classifyInvite = (invite: any) => {
    const status = String(invite?.workflowStatus || invite?.status || '-').toLowerCase()
    const isDraft = isDraftOnlyInvite(invite)
    const canManageGuests = canProceedAfterWorkshop(invite?.workflowStatus || invite?.status)
    const isApproved = status === 'approved'
    return { status, isDraft, canManageGuests, isApproved }
  }

  const filteredInvites = useMemo(() => {
    const queryText = normalizeSearchValue(searchQuery)
    return invites.filter((invite) => {
      const { status, isDraft, canManageGuests, isApproved } = classifyInvite(invite)
      const { groomName, brideName } = resolveCoupleNames(invite)
      const displayTitle = resolveInviteDisplayTitle(invite, groomName, brideName)
      const orderCode = pickText(invite?.orderCode, invite?.orderNumber, invite?.id)
      const createdAtLabel = formatInviteCreatedAt(invite)

      const matchesFilter =
        filterMode === 'all'
          ? true
          : filterMode === 'ready'
          ? canManageGuests
          : filterMode === 'draft'
          ? isDraft
          : filterMode === 'approved'
          ? isApproved
          : !isDraft && !canManageGuests

      if (!matchesFilter) return false
      if (!queryText) return true

      const searchable = normalizeSearchValue(
        [
          displayTitle,
          groomName,
          brideName,
          orderCode,
          createdAtLabel,
          status,
          invite?.designId,
          invite?.title,
        ].join(' ')
      )
      return searchable.includes(queryText)
    })
  }, [filterMode, invites, searchQuery])

  const filterCounts = useMemo(() => {
    let all = 0
    let ready = 0
    let draft = 0
    let underReview = 0
    let approved = 0
    for (const invite of invites) {
      const { isDraft, canManageGuests, isApproved } = classifyInvite(invite)
      all += 1
      if (canManageGuests) ready += 1
      if (isDraft) draft += 1
      if (!isDraft && !canManageGuests) underReview += 1
      if (isApproved) approved += 1
    }
    return { all, ready, draft, underReview, approved }
  }, [invites])

  return (
    <div className="min-h-screen bg-bg px-4 py-10">
      <div className="container mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold text-textDark">إدارة المدعوين</h1>
          <Link href="/dashboard" className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            الرجوع للوحة التحكم
          </Link>
        </div>

        <p className="mb-6 text-sm font-medium leading-6 text-muted">
          اختر الدعوة التي تريد إدارة المدعوين لها. يتم عرض الأحدث أولاً.
        </p>

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3">
            <input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="ابحث باسم الدعوة أو العريس/العروس أو كود الطلب"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <FilterChip
              active={filterMode === 'all'}
              onClick={() => setFilterMode('all')}
              label={`الكل (${filterCounts.all})`}
            />
            <FilterChip
              active={filterMode === 'ready'}
              onClick={() => setFilterMode('ready')}
              label={`جاهزة للمدعوين (${filterCounts.ready})`}
            />
            <FilterChip
              active={filterMode === 'under_review'}
              onClick={() => setFilterMode('under_review')}
              label={`تحت المراجعة (${filterCounts.underReview})`}
            />
            <FilterChip
              active={filterMode === 'approved'}
              onClick={() => setFilterMode('approved')}
              label={`معتمدة (${filterCounts.approved})`}
            />
            <FilterChip
              active={filterMode === 'draft'}
              onClick={() => setFilterMode('draft')}
              label={`Draft (${filterCounts.draft})`}
            />
          </div>
          <p className="mt-3 text-xs text-muted">
            يتم عرض {filteredInvites.length} من أصل {invites.length} دعوة
          </p>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-muted">جاري التحميل...</div>
        ) : invites.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm font-medium text-muted">لا توجد دعوات بعد.</p>
          </div>
        ) : filteredInvites.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm font-medium text-muted">لا توجد نتائج مطابقة للبحث أو الفلتر الحالي.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {filteredInvites.map((invite) => {
              const status = String(invite?.workflowStatus || invite?.status || '-')
              const isDraft = isDraftOnlyInvite(invite)
              const canManageGuests = canProceedAfterWorkshop(invite?.workflowStatus || invite?.status)
              const { groomName, brideName } = resolveCoupleNames(invite)
              const displayTitle = resolveInviteDisplayTitle(invite, groomName, brideName)
              const orderCode = pickText(invite?.orderCode, invite?.orderNumber, invite?.id)
              const createdAtLabel = formatInviteCreatedAt(invite)
              const resolvedRealInvite = isDraft
                ? invites
                    .filter((row) => !isDraftInviteId(String(row?.id || '')))
                    .filter((row) => String(row?.designId || '') === String(invite?.designId || ''))
                    .filter((row) => isPaidInvite(row) && canProceedAfterWorkshop(row?.workflowStatus || row?.status))
                    .sort((a, b) => {
                      const aDate = a?.updatedAt?.toDate?.() || a?.createdAt?.toDate?.() || new Date(0)
                      const bDate = b?.updatedAt?.toDate?.() || b?.createdAt?.toDate?.() || new Date(0)
                      return bDate.getTime() - aDate.getTime()
                    })[0] || null
                : null
              return (
                <div key={invite.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-2 font-bold text-textDark">{displayTitle}</h2>
                  <p className="text-sm font-medium text-muted">الحالة: {status}</p>
                  <p className="text-sm font-medium text-muted">كود الطلب: {orderCode}</p>
                  <p className="text-sm font-medium text-muted">تاريخ إنشاء الطلب: {createdAtLabel}</p>
                  <p className="text-sm font-medium text-muted">العريس: {groomName}</p>
                  <p className="text-sm font-medium text-muted">العروس: {brideName}</p>
                  {isDraft && resolvedRealInvite ? (
                    <Link
                      href={`/guests?invId=${encodeURIComponent(resolvedRealInvite.id)}`}
                      className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent"
                    >
                      فتح الدعوة المعتمدة وإدارة المدعوين
                    </Link>
                  ) : isDraft ? (
                    <Link
                      href={invite?.designId ? `/templates/${encodeURIComponent(invite.designId)}` : '/templates'}
                      className="mt-4 inline-flex rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-800 hover:bg-amber-100"
                    >
                      هذه نسخة draft - أكمل التصميم أولاً
                    </Link>
                  ) : canManageGuests ? (
                    <Link
                      href={`/guests?invId=${encodeURIComponent(invite.id)}`}
                      className="mt-4 inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent"
                    >
                      إدارة المدعوين
                    </Link>
                  ) : (
                    <Link
                      href={`/dashboard/invites/${encodeURIComponent(invite.id)}/workshop-status`}
                      className="mt-4 inline-flex rounded-lg border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      متابعة حالة الطلب
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active ? 'border-primary bg-primarySoft text-primary' : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  )
}

