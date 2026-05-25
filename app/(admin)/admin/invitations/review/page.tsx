'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

type QueueInvite = {
  id: string
  orderCode: string
  ownerName: string
  workflowStatus: string
  reviewStatus: string
  adminPreviewUrl: string
  workshopEnteredAt: string | null
}

export default function AdminReviewQueuePage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [invites, setInvites] = useState<QueueInvite[]>([])
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const isAdmin = isAdminEmailClient(user?.email)

  useEffect(() => {
    const load = async () => {
      if (!user || !isAdmin) return
      try {
        setLoading(true)
        const token = await user.getIdToken(true)
        const q = searchQuery.trim()
        const endpoint = q
          ? `/api/admin/invitations/review?limit=120&q=${encodeURIComponent(q)}`
          : '/api/admin/invitations/review'
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(data?.error || 'Failed to load review queue')
        setInvites(Array.isArray(data?.invites) ? data.invites : [])
      } catch (e: any) {
        setError(e?.message || 'Failed to load review queue')
      } finally {
        setLoading(false)
      }
    }
    if (!authLoading) load()
  }, [authLoading, isAdmin, searchQuery, user])

  if (authLoading || loading) {
    return <div className="p-8 text-center text-muted">جاري تحميل قائمة المراجعة...</div>
  }

  if (!user || !isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-muted">غير مصرح بالدخول.</p>
        <Link href="/login" className="text-primary hover:text-accent">
          تسجيل الدخول
        </Link>
      </div>
    )
  }

  const hasError = Boolean(error)

  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-2 text-3xl font-bold">ورشة التأكد - قائمة المراجعة</h1>
        <p className="mb-6 text-muted">الدعوات التي دخلت مرحلة المراجعة بعد الدفع.</p>
        <div className="mb-4">
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ابحث عبر Order Code أو Invite ID"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-primary"
          />
        </div>

        {hasError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-right text-red-700">
            <p className="text-sm md:text-base">{error}</p>
          </div>
        ) : invites.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-muted">
            لا توجد دعوات في ورشة التأكد حاليًا.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {invites.map((invite) => (
              <Link
                key={invite.id}
                href={`/admin/invitations/review/${invite.id}`}
                className="group overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="aspect-[9/16] bg-gray-50">
                  {invite.adminPreviewUrl ? (
                    <img src={invite.adminPreviewUrl} alt="Admin Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm text-red-600">
                      لا توجد صورة للدعوة
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="truncate font-semibold text-textDark">{invite.ownerName || 'مستخدم بدون اسم'}</p>
                    <p className="text-xs text-muted">{invite.orderCode || invite.id}</p>
                  </div>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold whitespace-nowrap ${
                      invite.workflowStatus === 'approved'
                        ? 'bg-emerald-100 text-emerald-700'
                        : invite.workflowStatus === 'needs_customer_update'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}
                  >
                    {invite.workflowStatus || 'in_workshop_review'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
    </div>
  )
}

