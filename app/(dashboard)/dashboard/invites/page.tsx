'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Plus, ArrowLeft } from 'lucide-react'
import { collection, getDocs, query, where } from 'firebase/firestore'
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
        const token = await user.getIdToken()
        const draftsResponsePromise = fetch('/api/user/invite-drafts', {
          headers: { Authorization: `Bearer ${token}` },
        })

        const [ownerSnap, legacyUserSnap, draftsResponse] = await Promise.all([
          getDocs(query(collection(db, 'invites'), where('ownerId', '==', user.uid))),
          getDocs(query(collection(db, 'invites'), where('userId', '==', user.uid))),
          draftsResponsePromise,
        ])

        const inviteMap = new Map<string, any>()
        for (const d of ownerSnap.docs) inviteMap.set(d.id, { id: d.id, ...(d.data() as any), source: 'invite' })
        for (const d of legacyUserSnap.docs) {
          if (!inviteMap.has(d.id)) inviteMap.set(d.id, { id: d.id, ...(d.data() as any), source: 'invite' })
        }

        const draftsData = await draftsResponse.json().catch(() => ({}))
        const drafts = draftsResponse.ok && Array.isArray(draftsData?.drafts) ? draftsData.drafts : []
        for (const draft of drafts) {
          const templateId = String(draft?.templateId || '').trim()
          if (!templateId) continue
          const draftId = `draft_${templateId}`
          if (inviteMap.has(draftId)) continue
          const form = (draft?.formData || {}) as Record<string, any>
          inviteMap.set(draftId, {
            id: draftId,
            source: 'draft',
            designId: templateId,
            selectedOccasion: String(draft?.selectedOccasion || ''),
            packageGuests: String(draft?.packageGuests || ''),
            packagePrice: String(draft?.packagePrice || ''),
            finalUrl: String(draft?.finalUrl || ''),
            previewUrl: String(draft?.previewUrl || ''),
            title:
              `دعوة ${String(form?.groomNameAr || '')} ${String(form?.brideNameAr || '')}`.trim() ||
              'دعوة محفوظة',
            groomName: String(form?.groomNameAr || ''),
            brideName: String(form?.brideNameAr || ''),
            status: 'draft',
            paymentStatus: 'unpaid',
            inviteLockedAfterPayment: false,
            updatedAt: new Date(),
          })
        }

        const getTime = (row: any) => {
          const raw = row?.updatedAt || row?.createdAt
          if (!raw) return 0
          if (typeof raw?.toDate === 'function') return raw.toDate().getTime()
          const parsed = new Date(raw).getTime()
          return Number.isFinite(parsed) ? parsed : 0
        }

        const rows = Array.from(inviteMap.values()).sort((a, b) => getTime(b) - getTime(a))
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
              href="/packages"
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
            <p className="text-sm text-muted">ابدأ دعوة جديدة من زر &quot;دعوة جديدة&quot; بالأعلى.</p>
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
              const previewUrl =
                String(invite?.inviteImageUrl || '').trim() ||
                String(invite?.finalUrl || '').trim() ||
                String(invite?.previewUrl || '').trim()
              const cardHref = invite?.source === 'draft' && invite?.designId ? resumeHref : `/dashboard/invites/${invite.id}`

              return (
                <Link
                  key={invite.id}
                  href={cardHref}
                  className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm hover:-translate-y-0.5 hover:shadow-md transition-all"
                >
                  <div className="mb-3 overflow-hidden rounded-xl border border-gray-100 bg-bg">
                    {previewUrl ? (
                      <img src={previewUrl} alt="Preview" className="h-24 w-full object-cover" />
                    ) : (
                      <div className="flex h-24 items-center justify-center text-xs text-muted">
                        التصميم المختار: {invite?.designId || '-'}
                      </div>
                    )}
                  </div>
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
                  <p className="text-sm text-muted">القالب: {invite?.designId || '-'}</p>
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

