'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import { useAuth } from '@/lib/auth/context'
import { db } from '@/lib/firebase/config'

function PaymentCallbackContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [message, setMessage] = useState('جارٍ التحقق من حالة الدفع...')
  const [detail, setDetail] = useState(
    'تمت العودة من بوابة Moyasar. التأكيد النهائي يتم عبر الخادم وليس من هذه الصفحة وحدها.'
  )

  const invitationId = String(searchParams.get('invitationId') || searchParams.get('invId') || '').trim()
  const cancelled = searchParams.get('payment') === 'cancelled'

  useEffect(() => {
    if (cancelled) {
      setMessage('تم إلغاء عملية الدفع')
      setDetail('يمكنك العودة لصفحة الدفع والمحاولة مرة أخرى.')
      return
    }

    if (!invitationId) {
      setMessage('تعذر متابعة حالة الدفع')
      setDetail('معرّف الدعوة غير موجود في الرابط.')
      return
    }

    if (authLoading) return

    if (!user) {
      setMessage('سجّل الدخول لمتابعة حالة الدفع')
      setDetail('بعد تسجيل الدخول سنتحقق من حالة طلبك تلقائياً.')
      return
    }

    let stopped = false
    let attempts = 0
    const maxAttempts = 40

    const poll = async () => {
      if (stopped) return
      attempts += 1

      try {
        const snap = await getDoc(doc(db, 'invites', invitationId))
        const invite = snap.data() as Record<string, unknown> | undefined
        const paid =
          invite?.paymentStatus === 'paid' || invite?.paid === true || invite?.status === 'paid'

        if (paid) {
          const orderCode = String(invite?.orderCode || invite?.orderNumber || '').trim()
          if (orderCode) {
            window.sessionStorage.setItem('bushara_last_order_number', orderCode)
            window.sessionStorage.setItem(
              'bushara_payment_status',
              JSON.stringify({
                orderNumber: orderCode,
                orderCode,
                paidAt: new Date().toISOString(),
                inviteId: invitationId,
              })
            )
          }
          window.sessionStorage.setItem('bushara_current_invite_id', invitationId)

          setMessage('تم تأكيد الدفع')
          setDetail('جارٍ تحويلك لصفحة متابعة الطلب...')
          router.replace(`/dashboard/invites/${encodeURIComponent(invitationId)}/workshop-status`)
          return
        }
      } catch (error) {
        console.error('[MOYASAR_CALLBACK] poll failed', error)
      }

      if (attempts >= maxAttempts) {
        setMessage('الدفع قيد التحقق')
        setDetail(
          'إذا اكتمل الدفع بنجاح، سيُحدَّث طلبك خلال دقائق. لا حاجة لإعادة الدفع إلا إذا لم يُخصم المبلغ.'
        )
        return
      }

      setMessage('الدفع قيد التحقق...')
      setDetail(`ننتظر تأكيد Moyasar عبر الخادم (${attempts}/${maxAttempts})...`)
      window.setTimeout(poll, 3000)
    }

    poll()

    return () => {
      stopped = true
    }
  }, [authLoading, cancelled, invitationId, router, user])

  return (
    <main className="min-h-screen px-4 pb-20 pt-32">
      <div className="container mx-auto max-w-xl">
        <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm text-center space-y-4">
          <h1 className="text-2xl font-bold text-textDark">{message}</h1>
          <p className="text-sm text-muted leading-relaxed">{detail}</p>
          {invitationId ? (
            <p className="text-xs text-gray-500">رقم الدعوة: {invitationId}</p>
          ) : null}
          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              onClick={() => router.push('/checkout')}
              className="h-11 rounded-xl border border-gray-300 bg-white font-semibold text-textDark hover:bg-gray-50"
            >
              العودة للدفع
            </button>
            <button
              type="button"
              onClick={() => router.push('/dashboard/invites')}
              className="h-11 rounded-xl bg-primary font-semibold text-white hover:bg-accent"
            >
              لوحة التحكم
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

export default function PaymentCallbackPage() {
  return (
    <>
      <Navbar />
      <Suspense
        fallback={
          <main className="min-h-screen px-4 pb-20 pt-32">
            <div className="container mx-auto max-w-xl text-center text-muted">جارٍ التحميل...</div>
          </main>
        }
      >
        <PaymentCallbackContent />
      </Suspense>
      <Footer />
    </>
  )
}
