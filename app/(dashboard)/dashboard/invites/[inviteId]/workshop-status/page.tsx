'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

type InviteStatus = {
  title?: string
  orderCode?: string
  orderNumber?: string
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
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

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
  const currentStage = useMemo<'paid' | 'review' | 'done'>(() => {
    if (isApproved) return 'done'
    if (isNeedsUpdate) return 'review'
    return 'review'
  }, [isApproved, isNeedsUpdate])

  const displayOrderCode = useMemo(() => {
    const code = String(invite?.orderCode || invite?.orderNumber || '').trim()
    if (code) return code
    if (!inviteId) return '-'
    if (inviteId.length <= 18) return inviteId
    return `${inviteId.slice(0, 8)}...${inviteId.slice(-6)}`
  }, [invite?.orderCode, invite?.orderNumber, inviteId])

  const handleCopyOrderId = async () => {
    const value = String(invite?.orderCode || invite?.orderNumber || inviteId || '').trim()
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopyState('copied')
      window.setTimeout(() => setCopyState('idle'), 1800)
    } catch (error) {
      console.error('Failed to copy order id:', error)
      setCopyState('failed')
      window.setTimeout(() => setCopyState('idle'), 1800)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <main className="container mx-auto max-w-4xl px-4 py-12 md:py-16">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/50 bg-white/75 p-5 shadow-[0_20px_80px_rgba(76,36,145,0.12)] backdrop-blur-xl md:p-8">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -right-12 -top-16 h-44 w-44 rounded-full bg-primary/15 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -left-10 bottom-2 h-36 w-36 rounded-full bg-violet-300/20 blur-3xl"
          />

          <div className="relative mx-auto max-w-2xl space-y-6 md:space-y-7">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-white/70 bg-white/60 shadow-[0_8px_26px_rgba(91,33,182,0.18)] backdrop-blur">
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12.5L9.5 17L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-textDark md:text-4xl">تم استلام طلبك بنجاح ✨</h1>
              <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted md:text-base">
                دعوتك الآن دخلت مرحلة المراجعة في بشارة، وبنرسلها لك فور اعتمادها بإذن الله.
              </p>
            </div>

            <div className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur md:p-5">
              <div className="mb-2 text-xs font-semibold text-primary/80 md:text-sm">رقم الطلب</div>
              <div className="flex flex-wrap items-center gap-2 md:gap-3">
                <code
                  title={String(invite?.orderCode || invite?.orderNumber || inviteId || '')}
                  className="rounded-full border border-primary/20 bg-primary/5 px-3 py-2 text-xs font-semibold tracking-wide text-textDark md:text-sm"
                >
                  {displayOrderCode}
                </code>
                <button
                  type="button"
                  onClick={handleCopyOrderId}
                  className="rounded-full border border-primary/25 bg-white px-3 py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5"
                >
                  {copyState === 'copied' ? 'تم النسخ' : copyState === 'failed' ? 'تعذر النسخ' : 'نسخ الرقم'}
                </button>
              </div>
            </div>

            <section className="rounded-2xl border border-white/60 bg-white/70 p-4 shadow-sm backdrop-blur md:p-5">
              <h2 className="mb-4 text-sm font-bold text-textDark md:text-base">حالة الطلب</h2>
              <div className="space-y-3">
                <div
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    currentStage === 'paid' || currentStage === 'review' || currentStage === 'done'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                >
                  <span>تم الدفع</span>
                  <span className="font-semibold">مكتمل</span>
                </div>
                <div
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    currentStage === 'review'
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : currentStage === 'done'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                >
                  <span>قيد المراجعة</span>
                  <span className="font-semibold">{currentStage === 'review' ? 'الحالة الحالية' : 'مكتمل'}</span>
                </div>
                <div
                  className={`flex items-center justify-between rounded-xl border px-4 py-3 text-sm ${
                    currentStage === 'done'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-gray-200 bg-gray-50 text-gray-500'
                  }`}
                >
                  <span>بانتظار الاعتماد والإرسال</span>
                  <span className="font-semibold">{currentStage === 'done' ? 'مكتمل' : 'قادم'}</span>
                </div>
              </div>
            </section>

            {loading ? (
              <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 text-sm text-muted">جاري تحميل الحالة...</div>
            ) : !invite ? (
              <div className="rounded-2xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700">الدعوة غير موجودة.</div>
            ) : (
              <>
                {isApproved ? (
                  <div className="rounded-2xl border border-green-200 bg-green-50/80 p-4 text-sm text-green-800">
                    تمت مراجعة الدعوة بنجاح، ويمكنك الآن متابعة إضافة المدعوين.
                  </div>
                ) : isNeedsUpdate ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-800">
                    نحتاج منك تحديث بعض البيانات قبل المتابعة.
                    {invite.workshopReturnReason ? (
                      <p className="mt-2">ملاحظة الفريق: {invite.workshopReturnReason}</p>
                    ) : null}
                  </div>
                ) : null}

                {invite.adminNotificationStatus === 'pending' && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-sm text-amber-800">
                    تم استلام الطلب بنجاح، وإشعار الإدارة قيد المعالجة.
                  </div>
                )}
              </>
            )}

            <div className="flex flex-col gap-3 pt-1 md:flex-row md:items-center md:justify-between">
              <Link
                href="/"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-accent md:min-w-[180px]"
              >
                الرئيسية
              </Link>
              <Link
                href="/dashboard"
                className="inline-flex h-12 items-center justify-center rounded-xl border border-primary/25 bg-white px-6 text-sm font-semibold text-primary transition-colors hover:bg-primary/5 md:min-w-[180px]"
              >
                حسابي
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

