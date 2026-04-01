'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuth } from '@/lib/auth/context'
import { canProceedAfterWorkshop } from '@/lib/invitations/workflow'

export default function DashboardGuestsPage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [invites, setInvites] = useState<any[]>([])

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

        {loading ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-muted">جاري التحميل...</div>
        ) : invites.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm font-medium text-muted">لا توجد دعوات بعد.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {invites.map((invite) => {
              const status = String(invite?.workflowStatus || invite?.status || '-')
              const canManageGuests = canProceedAfterWorkshop(invite?.workflowStatus || invite?.status)
              return (
                <div key={invite.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <h2 className="mb-2 font-bold text-textDark">{invite?.title || 'دعوة بدون عنوان'}</h2>
                  <p className="text-sm font-medium text-muted">الحالة: {status}</p>
                  <p className="text-sm font-medium text-muted">العريس: {invite?.groomName || '-'}</p>
                  <p className="text-sm font-medium text-muted">العروس: {invite?.brideName || '-'}</p>
                  {canManageGuests ? (
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

