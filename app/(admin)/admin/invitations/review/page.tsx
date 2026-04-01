'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

type QueueInvite = {
  id: string
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
  const isAdmin = isAdminEmailClient(user?.email)

  useEffect(() => {
    const load = async () => {
      if (!user || !isAdmin) return
      try {
        setLoading(true)
        const token = await user.getIdToken()
        const response = await fetch('/api/admin/invitations/review', {
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
  }, [authLoading, isAdmin, user])

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

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-2 text-3xl font-bold">ورشة التأكد - قائمة المراجعة</h1>
        <p className="mb-6 text-muted">الدعوات التي دخلت مرحلة المراجعة بعد الدفع.</p>
        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}

        {invites.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-muted">
            لا توجد دعوات بانتظار المراجعة حاليًا.
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
                  <p className="truncate font-semibold text-textDark">
                    {invite.ownerName || 'مستخدم بدون اسم'}
                  </p>
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700 whitespace-nowrap">
                    {invite.workflowStatus || 'in_workshop_review'}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

