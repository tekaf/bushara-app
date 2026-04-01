'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

export default function AdminInvitationsOpsPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)
  const [invites, setInvites] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedInviteId, setSelectedInviteId] = useState('')
  const [statusData, setStatusData] = useState<any | null>(null)
  const [statusError, setStatusError] = useState('')

  useEffect(() => {
    if (authLoading || !user || !isAdmin) return
    const load = async () => {
      setLoading(true)
      try {
        const token = await user.getIdToken()
        const res = await fetch('/api/admin/invitations?limit=40', {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error || 'Failed to load invites')
        setInvites(Array.isArray(data?.invites) ? data.invites : [])
      } catch (e: any) {
        setStatusError(e?.message || 'Failed to load invites')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [authLoading, isAdmin, user])

  const loadOps = async (inviteId: string) => {
    if (!user || !inviteId) return
    setSelectedInviteId(inviteId)
    setStatusError('')
    try {
      const token = await user.getIdToken()
      const res = await fetch(`/api/admin/invitations/${encodeURIComponent(inviteId)}/send-status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error || 'Failed to load invite operations')
      setStatusData(data)
    } catch (e: any) {
      setStatusError(e?.message || 'Failed to load invite operations')
      setStatusData(null)
    }
  }

  if (authLoading) return <div className="p-8 text-center text-muted">جاري التحميل...</div>
  if (!user || !isAdmin) return <div className="p-8 text-center text-muted">غير مصرح بالدخول.</div>

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-3xl font-bold">إدارة الدعوات (تشغيل داخلي)</h1>
          <Link href="/admin/invitations/review" className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
            الذهاب إلى ورشة التأكد
          </Link>
        </div>
        <p className="mb-6 text-sm text-muted">
          هذه الصفحة داخلية للإدارة فقط، وتعرض معلومات التشغيل مثل jobs / logs / queue.
        </p>

        {statusError ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{statusError}</div> : null}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-bold">الدعوات</h2>
            {loading ? (
              <p className="text-sm text-muted">جاري التحميل...</p>
            ) : invites.length === 0 ? (
              <p className="text-sm text-muted">لا توجد دعوات.</p>
            ) : (
              <div className="space-y-2">
                {invites.map((inv) => (
                  <button
                    key={inv.id}
                    onClick={() => loadOps(inv.id)}
                    className={`w-full rounded-lg border p-3 text-right ${selectedInviteId === inv.id ? 'border-primary bg-primarySoft' : 'border-gray-200 hover:bg-gray-50'}`}
                  >
                    <p className="font-semibold">{inv.title || inv.id}</p>
                    <p className="text-xs text-muted">
                      {inv.id} | {inv.workflowStatus || '-'}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4">
            <h2 className="mb-3 text-lg font-bold">تشغيل الدعوة</h2>
            {!statusData ? (
              <p className="text-sm text-muted">اختر دعوة من القائمة لعرض بيانات التشغيل.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <p>workflow: {statusData?.invitation?.workflowStatus || '-'}</p>
                <p>pending: {statusData?.summary?.pendingGuests ?? 0}</p>
                <p>sent: {statusData?.summary?.sentGuests ?? 0}</p>
                <p>failed: {statusData?.summary?.failedGuests ?? 0}</p>
                <p>active jobs: {statusData?.summary?.activeJobsCount ?? 0}</p>
                <div className="rounded border border-gray-200 p-3">
                  <p className="mb-1 font-semibold">Guest Breakdown</p>
                  <p>pending: {statusData?.breakdown?.guests?.pending ?? 0}</p>
                  <p>scheduled: {statusData?.breakdown?.guests?.scheduled ?? 0}</p>
                  <p>send_pending: {statusData?.breakdown?.guests?.send_pending ?? 0}</p>
                  <p>sent: {statusData?.breakdown?.guests?.sent ?? 0}</p>
                  <p>failed: {statusData?.breakdown?.guests?.failed ?? 0}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

