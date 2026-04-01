'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, ArrowLeft } from 'lucide-react'
import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuth } from '@/lib/auth/context'

export default function InvitesPage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [invites, setInvites] = useState<any[]>([])

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    const loadInvites = async () => {
      try {
        const hydrateFromDrafts = async () => {
          const token = await user.getIdToken()
          const response = await fetch('/api/user/invite-drafts', {
            headers: { Authorization: `Bearer ${token}` },
          })
          const data = await response.json().catch(() => ({}))
          if (!response.ok) return
          const drafts = Array.isArray(data?.drafts) ? data.drafts : []
          for (const draft of drafts) {
            const templateId = String(draft?.templateId || '')
            if (!templateId) continue
            const form = (draft?.formData || {}) as Record<string, any>
            const draftInviteId = `draft_${user.uid}_${templateId}`
            await setDoc(
              doc(db, 'invites', draftInviteId),
              {
                ownerId: user.uid,
                designId: templateId,
                title:
                  `دعوة ${form?.groomNameAr || ''} ${form?.brideNameAr || ''}`.trim() ||
                  'دعوة محفوظة',
                groomName: form?.groomNameAr || '',
                brideName: form?.brideNameAr || '',
                date: form?.date || '',
                time: form?.receptionTime || '',
                locationName: form?.hallLocation || '',
                packageId: String(form?.packageGuests || ''),
                status: 'draft',
                paymentStatus: 'unpaid',
                inviteLockedAfterPayment: false,
                updatedAt: new Date(),
              },
              { merge: true }
            )
          }
        }

        await hydrateFromDrafts()

        const snap = await getDocs(query(collection(db, 'invites'), where('ownerId', '==', user.uid)))
        const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })).sort((a, b) => {
          const aDate = a?.updatedAt?.toDate?.() || a?.createdAt?.toDate?.() || new Date(0)
          const bDate = b?.updatedAt?.toDate?.() || b?.createdAt?.toDate?.() || new Date(0)
          return bDate.getTime() - aDate.getTime()
        })
        setInvites(rows)
      } catch (error) {
        console.error('Failed loading invites:', error)
      } finally {
        setLoading(false)
      }
    }
    loadInvites()
  }, [authLoading, user])

  const paidInvites = useMemo(
    () =>
      invites.filter(
        (invite) =>
          invite?.paymentStatus === 'paid' || invite?.status === 'paid' || invite?.inviteLockedAfterPayment === true
      ),
    [invites]
  )

  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-white border-b border-primarySoft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-muted hover:text-primary transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <h1 className="text-2xl font-bold text-primary">الدعوات</h1>
            </div>
            <Link
              href="/dashboard/invites/new"
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-accent transition-colors"
            >
              <Plus size={20} />
              دعوة جديدة
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-2">باقاتي (المدفوعة)</h2>
            <p className="text-sm text-muted">هذه الدعوات تم دفعها وهي للعرض فقط بدون تعديل بيانات التصميم.</p>
            <p className="mt-3 text-primary font-semibold">{paidInvites.length} دعوة مدفوعة</p>
          </div>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-2">كل الدعوات</h2>
            <p className="text-sm text-muted">جميع الدعوات المرتبطة بحسابك.</p>
            <p className="mt-3 text-primary font-semibold">{invites.length} دعوة</p>
          </div>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center text-muted">جاري التحميل...</div>
        ) : invites.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
            <p className="text-muted mb-4">لا توجد دعوات بعد</p>
            <Link
              href="/dashboard/invites/new"
              className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-accent transition-colors"
            >
              <Plus size={20} />
              إنشاء دعوة جديدة
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {invites.map((invite) => {
              const isPaid =
                invite?.paymentStatus === 'paid' || invite?.status === 'paid' || invite?.inviteLockedAfterPayment === true
              const resumeQuery = new URLSearchParams()
              if (invite?.selectedOccasion) resumeQuery.set('occasion', String(invite.selectedOccasion))
              if (invite?.packageGuests) resumeQuery.set('packageGuests', String(invite.packageGuests))
              if (invite?.packagePrice) resumeQuery.set('packagePrice', String(invite.packagePrice))
              const resumeHref = `/templates/${invite?.designId || ''}${resumeQuery.toString() ? `?${resumeQuery.toString()}` : ''}`
              return (
                <Link
                  key={invite.id}
                  href={`/dashboard/invites/${invite.id}`}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-bold">{invite?.title || 'دعوة بدون عنوان'}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        isPaid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}
                    >
                      {isPaid ? 'مدفوعة (مقفلة)' : 'غير مدفوعة'}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted">العريس: {invite?.groomName || '-'}</p>
                  <p className="text-sm text-muted">العروس: {invite?.brideName || '-'}</p>
                  <p className="text-sm text-muted">الباقة: {invite?.packageGuests || invite?.packageId || '-'}</p>
                  <p className="text-xs text-muted mt-2">{isPaid ? 'بعد الدفع: للعرض فقط' : 'يمكنك إكمال التصميم لاحقاً'}</p>
                  {!isPaid && invite?.designId && (
                    <span className="mt-3 inline-block rounded-lg bg-primarySoft px-3 py-1.5 text-xs font-semibold text-primary">
                      متابعة التصميم: {resumeHref}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}

