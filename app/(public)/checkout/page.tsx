'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore'
import { PhoneAuthProvider, RecaptchaVerifier, linkWithCredential, reauthenticateWithCredential } from 'firebase/auth'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import StepperHeader from '@/components/flow/StepperHeader'
import { parsePackageFromParams } from '@/lib/flow/package-selection'
import { useAuth } from '@/lib/auth/context'
import { auth, db } from '@/lib/firebase/config'
import { INVITE_REVIEW_STATUS, INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

type CheckoutDraft = {
  templateId: string
  templateName: string
  templateType: string
  packageGuests: string
  packagePrice: string
  selectedOccasion: string
  formData: Record<string, any>
  finalUrl?: string | null
  previewUrl?: string | null
}

type TimePeriod = 'AM' | 'PM'

function normalizeArabicDigits(value: string): string {
  const arabicNums = '٠١٢٣٤٥٦٧٨٩'
  return value.replace(/[٠-٩]/g, (d) => String(arabicNums.indexOf(d)))
}

function normalizeSaudiPhone(raw: string): { ok: true; local: string; e164: string } | { ok: false; reason: string } {
  const normalized = normalizeArabicDigits(raw).replace(/[^\d+]/g, '')
  if (!normalized) return { ok: false, reason: 'أدخل رقم الجوال' }

  let candidate = normalized
  if (candidate.startsWith('00966')) candidate = `+${candidate.slice(2)}`
  if (candidate.startsWith('966')) candidate = `+${candidate}`

  if (/^5\d{8}$/.test(candidate)) candidate = `0${candidate}`
  if (/^05\d{8}$/.test(candidate)) {
    return { ok: true, local: candidate, e164: `+966${candidate.slice(1)}` }
  }
  if (/^\+9665\d{8}$/.test(candidate)) {
    return { ok: true, local: `0${candidate.slice(4)}`, e164: candidate }
  }

  return { ok: false, reason: 'رقم الجوال غير صحيح' }
}

function formatSelectedTime12(hour: string, minute: string, period: TimePeriod): string {
  if (!hour) return ''
  const hourNum = Math.min(12, Math.max(1, Number(hour) || 1))
  const minuteSafe = minute === '30' ? '30' : '00'
  const periodLabel = period === 'AM' ? 'ص' : 'م'
  return `${hourNum}:${minuteSafe} ${periodLabel}`
}

function formatTimeLine(label: string, timeValue: string): string {
  if (!timeValue) return ''
  return `${label} ${timeValue}`
}

function buildFieldsPayloadFromDraft(formData: Record<string, any>) {
  const receptionTimeValue =
    formData?.receptionTime ||
    formatSelectedTime12(
      String(formData?.receptionHour || ''),
      String(formData?.receptionMinute || '00'),
      (String(formData?.receptionPeriod || 'PM') as TimePeriod) || 'PM'
    )
  const zaffaTimeValue =
    formData?.zaffaTime ||
    formatSelectedTime12(
      String(formData?.zaffaHour || ''),
      String(formData?.zaffaMinute || '00'),
      (String(formData?.zaffaPeriod || 'PM') as TimePeriod) || 'PM'
    )

  return {
    groomNameAr: String(formData?.groomNameAr || ''),
    brideNameAr: String(formData?.brideNameAr || ''),
    fatherOfBride: String(formData?.fatherOfBride || ''),
    fatherOfGroom: String(formData?.fatherOfGroom || ''),
    motherOfBride: String(formData?.motherOfBride || ''),
    motherOfGroom: String(formData?.motherOfGroom || ''),
    weddingDayLine: formData?.weddingDay ? `وذلك بمشيئة الله تعالى يوم ${formData.weddingDay}` : '',
    fullDateLine: String(formData?.fullDateLine || ''),
    hallLocation: String(formData?.hallLocation || ''),
    receptionTime: formatTimeLine('الاستقبال', receptionTimeValue),
    zaffaTime: formatTimeLine('الزفة', zaffaTimeValue),
    venueText: String(formData?.hallLocation || ''),
    date: String(formData?.date || ''),
    dateText: String(formData?.dateText || ''),
    noKids: formData?.noKids ? '1' : '0',
    noPhotography: formData?.noPhotography ? '1' : '0',
  }
}

export default function CheckoutPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [draft, setDraft] = useState<CheckoutDraft | null>(null)
  const [paying, setPaying] = useState(false)
  const [templatePreviewUrl, setTemplatePreviewUrl] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [otpCode, setOtpCode] = useState('')
  const [otpVerificationId, setOtpVerificationId] = useState('')
  const [pendingOtpPhoneE164, setPendingOtpPhoneE164] = useState('')
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [verifiedPhoneE164, setVerifiedPhoneE164] = useState('')
  const [verifiedPhoneLocal, setVerifiedPhoneLocal] = useState('')
  const [otpSending, setOtpSending] = useState(false)
  const [otpVerifying, setOtpVerifying] = useState(false)
  const [otpStatus, setOtpStatus] = useState('')
  const [otpError, setOtpError] = useState('')
  const [showPhoneVerifyModal, setShowPhoneVerifyModal] = useState(false)
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0)
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null)
  const otpInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    const raw = window.sessionStorage.getItem('bushara_checkout_draft')
    if (!raw) return
    try {
      setDraft(JSON.parse(raw))
    } catch (error) {
      console.error('Invalid checkout draft')
    }
  }, [])

  useEffect(() => {
    if (!draft?.templateId) {
      setTemplatePreviewUrl('')
      return
    }

    const loadTemplatePreview = async () => {
      try {
        const snap = await getDoc(doc(db, 'templates', draft.templateId))
        if (!snap.exists()) {
          setTemplatePreviewUrl('')
          return
        }
        const row = snap.data() as any
        setTemplatePreviewUrl(String(row?.assets?.thumbUrl || row?.assets?.backgroundUrl || '').trim())
      } catch (error) {
        console.error('Failed to load template preview on checkout:', error)
        setTemplatePreviewUrl('')
      }
    }

    loadTemplatePreview()
  }, [draft?.templateId])

  useEffect(() => {
    const linkedPhoneRaw = String(user?.phoneNumber || '').trim()
    if (!linkedPhoneRaw) {
      return
    }
    const parsed = normalizeSaudiPhone(linkedPhoneRaw)
    if (!parsed.ok) return
    if (!phoneInput) setPhoneInput(parsed.local)
  }, [user?.phoneNumber])

  useEffect(() => {
    if (!otpVerificationId) return
    otpInputRef.current?.focus()
  }, [otpVerificationId])

  useEffect(() => {
    if (resendSecondsLeft <= 0) return
    const timer = setTimeout(() => setResendSecondsLeft((prev) => Math.max(0, prev - 1)), 1000)
    return () => clearTimeout(timer)
  }, [resendSecondsLeft])

  useEffect(() => {
    return () => {
      if (recaptchaRef.current) {
        recaptchaRef.current.clear()
        recaptchaRef.current = null
      }
    }
  }, [])

  const orderNumber = useMemo(() => {
    const key = draft?.templateId ? `bushara_order_number:${draft.templateId}` : ''
    if (!key) return `BSH-${Math.floor(100000 + Math.random() * 900000)}`
    const existing = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : ''
    if (existing) return existing
    const generated = `BSH-${Math.floor(100000 + Math.random() * 900000)}`
    if (typeof window !== 'undefined') window.sessionStorage.setItem(key, generated)
    return generated
  }, [draft?.templateId])
  const selectedPackage = useMemo(
    () => parsePackageFromParams(draft?.packageGuests || '', draft?.packagePrice || ''),
    [draft?.packageGuests, draft?.packagePrice]
  )
  const hasValidPackage = Boolean(selectedPackage)

  const basePrice = selectedPackage?.price || 0
  const total = basePrice
  const oldPrice = Number((selectedPackage as any)?.oldPrice || 0)

  const occasionLabel =
    draft?.selectedOccasion === 'wedding'
      ? 'زواج أو ملكه'
      : draft?.selectedOccasion === 'engagement'
      ? 'خطبة'
      : draft?.selectedOccasion === 'special'
      ? 'مناسبة خاصة / عامة'
      : '-'

  const normalizedPhone = normalizeSaudiPhone(phoneInput)
  const canPay = phoneVerified && !paying && !authLoading
  const otpStep = otpVerificationId ? 2 : 1

  const handleOpenPhoneVerifyModal = () => {
    if (authLoading) return
    if (!user) {
      alert('سجل الدخول أولاً لإكمال الدفع والمتابعة.')
      router.push('/login')
      return
    }
    setShowPhoneVerifyModal(true)
    setOtpError('')
    setOtpStatus('')
  }

  const ensureRecaptcha = () => {
    if (recaptchaRef.current) return recaptchaRef.current
    const containerId = 'checkout-phone-recaptcha'
    const verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
    recaptchaRef.current = verifier
    return verifier
  }

  const handleSendOtp = async () => {
    if (authLoading) return
    if (!user) {
      alert('سجل الدخول أولاً لإكمال التحقق قبل الدفع.')
      router.push('/login')
      return
    }

    if (!normalizedPhone.ok) {
      setOtpError(normalizedPhone.reason)
      return
    }

    setOtpError('')
    setOtpStatus('')
    setOtpSending(true)
    try {
      const verifier = ensureRecaptcha()
      const provider = new PhoneAuthProvider(auth)
      const verificationId = await provider.verifyPhoneNumber(normalizedPhone.e164, verifier)
      setOtpVerificationId(verificationId)
      setPendingOtpPhoneE164(normalizedPhone.e164)
      setOtpCode('')
      setPhoneVerified(false)
      setVerifiedPhoneE164('')
      setVerifiedPhoneLocal('')
      setResendSecondsLeft(30)
      setOtpStatus(`تم إرسال رمز التحقق إلى ${normalizedPhone.local}`)
    } catch (error: any) {
      console.error('Failed sending checkout OTP:', error)
      setOtpError(error?.message || 'تعذر إرسال رمز التحقق. حاول مرة أخرى.')
    } finally {
      setOtpSending(false)
    }
  }

  const handleVerifyOtp = async (): Promise<boolean> => {
    if (!user) {
      alert('سجل الدخول أولاً لإكمال التحقق قبل الدفع.')
      router.push('/login')
      return false
    }
    if (!otpVerificationId || !pendingOtpPhoneE164) {
      setOtpError('اطلب رمز التحقق أولاً.')
      return false
    }
    if (!otpCode.trim()) {
      setOtpError('أدخل رمز التحقق.')
      return false
    }

    setOtpError('')
    setOtpStatus('')
    setOtpVerifying(true)
    try {
      const credential = PhoneAuthProvider.credential(otpVerificationId, otpCode.trim())
      if (user.phoneNumber) {
        await reauthenticateWithCredential(user, credential)
      } else {
        await linkWithCredential(user, credential)
      }
      await user.reload()
      const refreshedPhone = String(auth.currentUser?.phoneNumber || user.phoneNumber || '').trim()
      const normalized = normalizeSaudiPhone(refreshedPhone)
      if (!normalized.ok || normalized.e164 !== pendingOtpPhoneE164) {
        throw new Error('تعذر توثيق رقم الجوال الحالي. حاول مجددًا.')
      }

      setPhoneVerified(true)
      setVerifiedPhoneE164(normalized.e164)
      setVerifiedPhoneLocal(normalized.local)
      setOtpStatus('تم توثيق رقم الجوال بنجاح.')
      return true
    } catch (error: any) {
      console.error('Failed verifying checkout OTP:', error)
      setPhoneVerified(false)
      setVerifiedPhoneE164('')
      setVerifiedPhoneLocal('')
      setOtpError(error?.message || 'رمز التحقق غير صحيح أو منتهي الصلاحية.')
      return false
    } finally {
      setOtpVerifying(false)
    }
  }

  const handleConfirmOtpAndContinue = async () => {
    const ok = await handleVerifyOtp()
    if (!ok) return
    await handleFakePayment()
  }

  const handleFakePayment = async () => {
    if (!draft?.templateId || !hasValidPackage) {
      alert('لا يمكن إكمال الدفع بدون اختيار باقة.')
      router.push('/packages')
      return
    }
    if (authLoading) return
    if (!user) {
      alert('سجل الدخول أولاً لإكمال الدفع والمتابعة للمدعوين.')
      router.push('/login')
      return
    }
    const effectivePhoneE164 = verifiedPhoneE164
    if (!effectivePhoneE164) {
      alert('يرجى توثيق رقم الجوال عبر OTP قبل تأكيد الدفع.')
      return
    }
    if (paying) return

    setPaying(true)
    try {
      const inviteStorageKey = `bushara_active_invite_id:${draft.templateId}`
      const existingInviteId = window.sessionStorage.getItem(inviteStorageKey) || ''
      let inviteId = existingInviteId
      let inviteImageUrl = draft.finalUrl || draft.previewUrl || ''

      if (!inviteImageUrl) {
        try {
          const renderResponse = await fetch('/api/render/final', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateId: draft.templateId,
              variant: 'whatsapp_1080x1920',
              fields: buildFieldsPayloadFromDraft(draft.formData || {}),
            }),
          })
          const renderData = await renderResponse.json().catch(() => ({}))
          if (renderResponse.ok && renderData?.url) {
            inviteImageUrl = String(renderData.url)
          }
        } catch (error) {
          console.error('Failed generating final invite image on checkout:', error)
        }
      }

      if (existingInviteId) {
        await setDoc(
          doc(db, 'invites', existingInviteId),
          {
            ownerId: user.uid,
            title:
              `دعوة ${draft.formData?.groomNameAr || ''} ${draft.formData?.brideNameAr || ''}`.trim() || 'دعوة جديدة',
            groomName: draft.formData?.groomNameAr || '',
            brideName: draft.formData?.brideNameAr || '',
            date: draft.formData?.date || '',
            time: draft.formData?.receptionTime || '',
            locationName: draft.formData?.hallLocation || '',
            locationMapUrl: '',
            designId: draft.templateId,
            packageId: draft.packageGuests || '',
            packageGuests: Number(draft.packageGuests || 0),
            packagePrice: Number(draft.packagePrice || 0),
            guestLimit: Number(draft.packageGuests || 0),
            finalUrl: draft.finalUrl || '',
            previewUrl: draft.previewUrl || '',
            inviteImageUrl,
            orderNumber,
            orderStatus: 'pending_review',
            status: 'paid',
            paymentStatus: 'paid',
            inviteLockedAfterPayment: true,
            customerPhoneE164: effectivePhoneE164,
            customerPhoneLocal: verifiedPhoneLocal || (normalizedPhone.ok ? normalizedPhone.local : ''),
            customerPhoneVerified: true,
            customerPhoneVerifiedAt: new Date(),
            workflowStatus: INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT,
            reviewStatus: INVITE_REVIEW_STATUS.PENDING,
            adminNotificationStatus: 'pending',
            scheduledSendAt: null,
            timezone: 'Asia/Riyadh',
            sendStatusSummary: { total: 0, pending: 0, sent: 0, failed: 0 },
            lastSendAt: null,
            paidAt: new Date(),
            updatedAt: new Date(),
          },
          { merge: true }
        )
      } else {
        const inviteRef = await addDoc(collection(db, 'invites'), {
          ownerId: user.uid,
          title:
            `دعوة ${draft.formData?.groomNameAr || ''} ${draft.formData?.brideNameAr || ''}`.trim() || 'دعوة جديدة',
          groomName: draft.formData?.groomNameAr || '',
          brideName: draft.formData?.brideNameAr || '',
          date: draft.formData?.date || '',
          time: draft.formData?.receptionTime || '',
          locationName: draft.formData?.hallLocation || '',
          locationMapUrl: '',
          designId: draft.templateId,
          packageId: draft.packageGuests || '',
          packageGuests: Number(draft.packageGuests || 0),
          packagePrice: Number(draft.packagePrice || 0),
          guestLimit: Number(draft.packageGuests || 0),
          finalUrl: draft.finalUrl || '',
          previewUrl: draft.previewUrl || '',
          inviteImageUrl,
          orderNumber,
          orderStatus: 'pending_review',
          status: 'paid',
          paymentStatus: 'paid',
          inviteLockedAfterPayment: true,
          customerPhoneE164: effectivePhoneE164,
          customerPhoneLocal: verifiedPhoneLocal || (normalizedPhone.ok ? normalizedPhone.local : ''),
          customerPhoneVerified: true,
          customerPhoneVerifiedAt: new Date(),
          workflowStatus: INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT,
          reviewStatus: INVITE_REVIEW_STATUS.PENDING,
          adminNotificationStatus: 'pending',
          scheduledSendAt: null,
          timezone: 'Asia/Riyadh',
          sendStatusSummary: { total: 0, pending: 0, sent: 0, failed: 0 },
          lastSendAt: null,
          paidAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        inviteId = inviteRef.id
        window.sessionStorage.setItem(inviteStorageKey, inviteId)
      }

      window.sessionStorage.setItem('bushara_current_invite_id', inviteId)
      window.sessionStorage.setItem(`bushara_active_invite_id:${draft.templateId}`, inviteId)
      window.sessionStorage.setItem('bushara_last_order_number', orderNumber)
      window.sessionStorage.setItem(
        'bushara_payment_status',
        JSON.stringify({
          orderNumber,
          paidAt: new Date().toISOString(),
          templateId: draft.templateId,
          inviteId,
        })
      )
      const idToken = await user.getIdToken()
      const workshopResponse = await fetch('/api/workshop/enter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ inviteId }),
      })
      const workshopData = await workshopResponse.json().catch(() => ({}))
      if (!workshopResponse.ok) {
        const workshopErrorText = String(workshopData?.error || '')
        const isCredentialsIssue =
          workshopErrorText.includes('default credentials') ||
          workshopErrorText.includes('Project Id') ||
          workshopErrorText.includes('Admin SDK not configured')
        if (!isCredentialsIssue) {
          throw new Error(workshopData?.error || 'تعذر إكمال معالجة الطلب بعد الدفع')
        }
        await setDoc(
          doc(db, 'invites', inviteId),
          {
            adminNotificationStatus: 'pending',
            adminNotificationError: workshopErrorText || 'workshop_enter_failed',
            updatedAt: new Date(),
          },
          { merge: true }
        )
        console.warn(
          '[CHECKOUT] workshop enter skipped due missing admin credentials, continuing local flow'
        )
      } else {
        await setDoc(
          doc(db, 'invites', inviteId),
          {
            adminNotificationStatus: workshopData?.emailDelivered ? 'delivered' : 'failed',
            adminNotificationError: workshopData?.emailDelivered ? '' : 'email_not_delivered',
            updatedAt: new Date(),
          },
          { merge: true }
        )
      }

      alert(
        'تم استلام طلبك بنجاح. قاعدين نصمم دعوة بشاره لك، وبنرسلها لك بأقرب وقت ممكن بعد المراجعة والتأكد. شكرًا لاختيارك بشاره 💜'
      )
      setShowPhoneVerifyModal(false)
      router.push(`/dashboard/invites/${encodeURIComponent(inviteId)}/workshop-status`)
    } catch (error) {
      console.error('Failed to create invite after payment:', error)
      alert('حدث خطأ أثناء إنشاء الدعوة. حاول مرة أخرى.')
    } finally {
      setPaying(false)
    }
  }

  const handleBackToEdit = () => {
    if (!draft?.templateId) {
      router.push('/templates')
      return
    }
    const query = new URLSearchParams()
    if (draft.packageGuests) query.set('packageGuests', draft.packageGuests)
    if (draft.packagePrice) query.set('packagePrice', draft.packagePrice)
    if (draft.selectedOccasion) query.set('occasion', draft.selectedOccasion)
    const qs = query.toString()
    router.push(`/templates/${draft.templateId}${qs ? `?${qs}` : ''}`)
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen px-4 pb-20 pt-32">
        <div className="container mx-auto max-w-6xl">
          <StepperHeader
            steps={[
              { id: 1, label: 'نوع المناسبة' },
              { id: 2, label: 'اختيار القالب' },
              { id: 3, label: 'بيانات العروس والعريس' },
              { id: 4, label: 'تفاصيل المناسبة' },
              { id: 5, label: 'الدفع' },
            ]}
            activeStep={5}
            onStepClick={(stepId) => {
              if (stepId < 5) handleBackToEdit()
            }}
            progressHint="باقي خطوة واحدة لإكمال دعوتك ✨"
          />
          <div className="mb-6 space-y-2">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">الفاتورة والدفع</h1>
            <p className="text-sm md:text-base text-muted">راجع تفاصيل طلبك ثم أكمل الدفع بأمان ✨</p>
          </div>

          {!draft ? (
            <div className="rounded-2xl bg-white p-8 shadow">لا توجد بيانات طلب حالياً.</div>
          ) : !hasValidPackage ? (
            <div className="rounded-2xl bg-white p-8 shadow-lg border border-red-100 space-y-4">
              <h2 className="text-2xl font-bold text-red-700">لا يمكن إنشاء فاتورة بدون باقة</h2>
              <p className="text-muted">
                يرجى اختيار باقة أولاً، ثم إكمال التصميم والدفع.
              </p>
              <button
                onClick={() => router.push('/packages')}
                className="w-full rounded-lg bg-primary py-3 font-semibold text-white hover:bg-accent transition-colors"
              >
                الذهاب إلى صفحة الباقات
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
              <div className="rounded-3xl border border-gray-200 bg-white p-6 md:p-8 shadow-sm">
                <div className="mb-6 flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-textDark">فاتورة الطلب</h2>
                  <span className="rounded-full border border-primary/20 bg-primarySoft px-3 py-1 text-xs font-semibold text-primary">
                    رقم الطلب: {orderNumber}
                  </span>
                </div>

                <div className="rounded-2xl border border-gray-100 bg-[#fdfdff] p-4 md:p-5">
                  <div className="mb-3 text-sm font-semibold text-textDark">تفاصيل الطلب</div>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-500">نوع المناسبة</span>
                      <span className="font-semibold text-textDark">{occasionLabel}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-500">القالب</span>
                      <span className="font-semibold text-textDark">{draft.templateName || `النوع ${draft.templateType}`}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-gray-500">الباقة</span>
                      <span className="font-semibold text-textDark">{draft.packageGuests || '-'} ضيف</span>
                    </div>
                  </div>
                </div>

                <div className="my-5 border-t border-dashed border-gray-200" />

                <div className="rounded-2xl border border-gray-100 p-4 md:p-5">
                  <div className="mb-3 text-sm font-semibold text-textDark">المبلغ النهائي</div>
                  <div className="space-y-2">
                    {oldPrice > basePrice && (
                      <p className="text-sm text-gray-400 line-through">{oldPrice} ريال</p>
                    )}
                    <p className="text-3xl md:text-4xl font-bold tracking-tight text-primary">{total} ريال</p>
                    <div className="pt-1 text-xs text-gray-500">شامل قيمة الباقة المختارة</div>
                  </div>
                </div>

                <button
                  onClick={handleOpenPhoneVerifyModal}
                  disabled={paying || authLoading}
                  className="mt-6 h-14 w-full rounded-2xl bg-primary font-semibold text-white shadow-sm hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {paying ? 'جارٍ تأكيد الدفع...' : 'تأكيد الدفع والمتابعة'}
                </button>

                <div className="mt-4 space-y-2 text-xs text-gray-500">
                  <p>🔒 الدفع آمن ومشفر</p>
                  <p>💳 طرق الدفع المعتمدة متاحة عند الإطلاق الكامل</p>
                  <p className="pt-1">يذهب جزء من مبلغ الشراء إلى إحسان 💚</p>
                </div>

                <button
                  onClick={handleBackToEdit}
                  className="mt-5 h-12 w-full rounded-xl border border-gray-300 bg-white font-semibold text-textDark hover:bg-gray-50 transition-colors"
                >
                  تعديل البيانات
                </button>
              </div>

              <div className="space-y-4">
                {templatePreviewUrl ? (
                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-3 text-lg font-bold text-textDark">نظرة سريعة</h2>
                    <div className="mx-auto w-44 max-w-full aspect-[9/16] overflow-hidden rounded-2xl border border-gray-200 bg-white">
                      <img
                        src={templatePreviewUrl}
                        alt="Template preview"
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="mt-4 rounded-xl border border-gray-100 bg-[#fcfbff] p-4 text-sm text-gray-600 leading-7">
                      بعد الدفع تنتقل دعوتك مباشرة إلى ورشة التأكد والمراجعة الداخلية، ثم تظهر المعاينة
                      النهائية بعد الاعتماد.
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-3 text-lg font-bold text-textDark">لماذا بشاره؟</h2>
                    <div className="space-y-2 text-sm text-gray-600">
                      <p>✔ تصميم فاخر يناسب المناسبة</p>
                      <p>✔ إرسال عبر واتساب</p>
                      <p>✔ مراجعة واعتماد قبل الإرسال</p>
                      <p>✔ سهولة إدارة المدعوين</p>
                    </div>
                    <div className="mt-4 rounded-xl border border-gray-100 bg-[#fcfbff] p-4 text-sm text-gray-600 leading-7">
                      بعد الدفع، تتم مراجعة الدعوة داخليًا قبل إتاحة المعاينة النهائية للمستخدم.
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      {showPhoneVerifyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl border border-gray-200 bg-white p-5 md:p-6 shadow-xl">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3 className="text-xl font-bold text-textDark">توثيق رقم الجوال</h3>
                <p className="mt-1 text-sm text-muted">أدخل رقمك ثم تحقق بالرمز لإكمال الدفع بأمان.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPhoneVerifyModal(false)}
                className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-500 hover:bg-gray-50"
              >
                إغلاق
              </button>
            </div>

            <div className="space-y-3">
              {otpStep === 1 ? (
                <input
                  type="tel"
                  value={phoneInput}
                  onChange={(e) => {
                    setPhoneInput(e.target.value)
                    setPhoneVerified(false)
                    setVerifiedPhoneE164('')
                    setVerifiedPhoneLocal('')
                    setOtpVerificationId('')
                    setPendingOtpPhoneE164('')
                    setOtpCode('')
                    setOtpStatus('')
                    setOtpError('')
                    setResendSecondsLeft(0)
                  }}
                  placeholder="05xxxxxxxx"
                  className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                />
              ) : (
                <>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-textDark">
                    ✔️ رقم الجوال: {normalizedPhone.ok ? normalizedPhone.local : phoneInput}
                  </div>
                  <input
                    ref={otpInputRef}
                    type="text"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    placeholder="أدخل رمز OTP"
                    className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </>
              )}
              {otpStatus && <p className="text-xs text-green-700">{otpStatus}</p>}
              {otpError && <p className="text-xs text-red-600">{otpError}</p>}
              {otpStep === 2 && resendSecondsLeft > 0 && (
                <p className="text-xs text-gray-500">إعادة إرسال الرمز خلال {resendSecondsLeft} ثانية</p>
              )}
            </div>

            <button
              type="button"
              onClick={otpStep === 1 ? handleSendOtp : handleConfirmOtpAndContinue}
              disabled={
                otpStep === 1
                  ? otpSending || otpVerifying || !user
                  : otpSending || otpVerifying || paying || authLoading || !otpCode.trim()
              }
              className="mt-5 h-12 w-full rounded-xl bg-primary font-semibold text-white hover:bg-accent transition-colors disabled:opacity-50"
            >
              {otpStep === 1
                ? otpSending
                  ? 'جارٍ إرسال الرمز...'
                  : 'إرسال رمز التحقق'
                : otpVerifying || paying
                ? 'جارٍ التأكيد...'
                : 'تأكيد الرمز والمتابعة'}
            </button>

            <div id="checkout-phone-recaptcha" />
          </div>
        </div>
      )}
      <Footer />
    </>
  )
}
