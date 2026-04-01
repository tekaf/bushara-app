'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

type InviteStatus = {
  title?: string
  workflowStatus?: string
  workshopReturnReason?: string
  adminNotificationStatus?: string
  adminNotificationError?: string
}

export default function WorkshopStatusPage() {
  const params = useParams()
  const inviteId = String(params?.inviteId || '')
  const [loading, setLoading] = useState(true)
  const [invite, setInvite] = useState<InviteStatus | null>(null)

  useEffect(() => {
    if (!inviteId) return
    const unsub = onSnapshot(
      doc(db, 'invites', inviteId),
      (snapshot) => {
        setInvite(snapshot.exists() ? (snapshot.data() as InviteStatus) : null)
        setLoading(false)
      },
      () => setLoading(false)
    )
    return () => unsub()
  }, [inviteId])

  const isApproved = useMemo(
    () => invite?.workflowStatus === INVITE_WORKFLOW_STATUS.APPROVED,
    [invite?.workflowStatus]
  )
  const isNeedsUpdate = useMemo(
    () => invite?.workflowStatus === INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
    [invite?.workflowStatus]
  )

  return (
    <div className="min-h-screen bg-bg">
      <main className="container mx-auto max-w-3xl px-4 py-16">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
          <h1 className="mb-2 text-2xl font-bold">تم استلام طلبك بنجاح</h1>
          <p className="mb-6 text-sm text-muted">رقم الطلب المرجعي: {inviteId}</p>
          {loading ? (
            <p className="text-muted">جاري تحميل الحالة...</p>
          ) : !invite ? (
            <p className="text-red-600">الدعوة غير موجودة.</p>
          ) : (
            <>
              {isApproved ? (
                <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
                  تمت مراجعة الدعوة بنجاح، ويمكنك الآن متابعة إضافة المدعوين.
                </div>
              ) : isNeedsUpdate ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                  نحتاج منك تحديث بعض البيانات قبل المتابعة.
                  {invite.workshopReturnReason ? (
                    <p className="mt-2 text-sm">ملاحظة الفريق: {invite.workshopReturnReason}</p>
                  ) : null}
                </div>
              ) : (
                <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-800">
                  قاعدين نصمم دعوة بشاره لك، وبنرسلها لك بأقرب وقت ممكن بعد المراجعة والتأكد.
                  <p className="mt-2 font-semibold">شكرًا لاختيارك بشاره 💜</p>
                </div>
              )}
              {invite.adminNotificationStatus === 'pending' && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-800">
                  تم استلام الطلب بنجاح، وإشعار الإدارة قيد المعالجة.
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                {isApproved ? (
                  <Link
                    href={`/guests?invId=${encodeURIComponent(inviteId)}`}
                    className="rounded-lg bg-primary px-5 py-3 font-semibold text-white hover:bg-accent transition-colors"
                  >
                    الانتقال إلى المدعوين
                  </Link>
                ) : null}
                <Link
                  href="/dashboard"
                  className="rounded-lg border border-gray-300 px-5 py-3 font-semibold text-textDark hover:bg-gray-50 transition-colors"
                >
                  العودة إلى لوحة المستخدم
                </Link>
                <Link
                  href="/dashboard/invites"
                  className="rounded-lg border border-gray-300 px-5 py-3 font-semibold text-textDark hover:bg-gray-50 transition-colors"
                >
                  إدارة الدعوات
                </Link>
                <Link
                  href="/packages"
                  className="rounded-lg border border-gray-300 px-5 py-3 font-semibold text-textDark hover:bg-gray-50 transition-colors"
                >
                  إدارة الباقات
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

