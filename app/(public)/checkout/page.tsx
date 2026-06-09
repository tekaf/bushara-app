'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore'
import { PhoneAuthProvider, RecaptchaVerifier, linkWithCredential, reauthenticateWithCredential } from 'firebase/auth'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import StepperHeader from '@/components/flow/StepperHeader'
import { parsePackageFromParams } from '@/lib/flow/package-selection'
import { useAuth } from '@/lib/auth/context'
import { auth, db } from '@/lib/firebase/config'
import { INVITE_REVIEW_STATUS, INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'
import { sanitizeForFirestore } from '@/lib/firebase/sanitize-doc'
import { isMoyasarCheckoutAvailable } from '@/lib/moyasar/client'

const TERMINAL_WORKFLOW_STATUSES = new Set<string>([
  INVITE_WORKFLOW_STATUS.SENT,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
])

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
  phoneNumber?: string
  phoneLocal?: string
  phoneVerified?: boolean
  phoneVerifiedAt?: string
}

type TimePeriod = 'AM' | 'PM'
type CheckoutModalStage = 'otp' | 'payment'

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

const EXPECTED_OTP_HOSTNAMES = new Set(['localhost', '127.0.0.1', 'busharh.com', 'www.busharh.com'])

function mapOtpErrorMessage(error: any) {
  const code = String(error?.code || '').toLowerCase()
  const message = String(error?.message || '').toLowerCase()
  if (code.includes('auth/captcha-check-failed') || message.includes('captcha-check-failed')) {
    return 'تعذر التحقق من أمان الطلب، يرجى تحديث الصفحة والمحاولة مرة أخرى.'
  }
  return String(error?.message || 'تعذر إرسال رمز التحقق. حاول مرة أخرى.')
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

function pickText(...values: any[]): string {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

function normalizeFormDataForInvite(formData: Record<string, any>, selectedOccasion = ''): Record<string, any> {
  const raw = formData || {}
  const invitationType =
    raw?.invitationType === 'announcement' || raw?.invitationType === 'attendance'
      ? raw.invitationType
      : 'attendance'
  const isEngagement = selectedOccasion === 'engagement'
  const isAnnouncementOnly = isEngagement && invitationType === 'announcement'
  const receptionTimeRaw =
    pickText(raw?.receptionTime, raw?.reception_time, raw?.time) ||
    formatSelectedTime12(
      String(raw?.receptionHour || raw?.reception_hour || ''),
      String(raw?.receptionMinute || raw?.reception_minute || '00'),
      (String(raw?.receptionPeriod || raw?.reception_period || 'PM') as TimePeriod) || 'PM'
    )
  const zaffaTimeRaw =
    pickText(raw?.zaffaTime, raw?.zaffa_time) ||
    formatSelectedTime12(
      String(raw?.zaffaHour || raw?.zaffa_hour || ''),
      String(raw?.zaffaMinute || raw?.zaffa_minute || '00'),
      (String(raw?.zaffaPeriod || raw?.zaffa_period || 'PM') as TimePeriod) || 'PM'
    )

  const groomNameAr = pickText(raw?.groomNameAr, raw?.groomName, raw?.groom_name)
  const brideNameAr = pickText(raw?.brideNameAr, raw?.brideName, raw?.bride_name)
  const hallLocation = pickText(raw?.hallLocation, raw?.locationText, raw?.venueText, raw?.hallName, raw?.locationName)
  const fullDateLine = pickText(raw?.fullDateLine, raw?.full_date_line)
  const dateText = pickText(raw?.dateText, raw?.date, fullDateLine)
  const weddingDayLine = pickText(
    raw?.weddingDayLine,
    raw?.wedding_day_line,
    raw?.weddingDay ? `وذلك بمشيئة الله تعالى يوم ${String(raw?.weddingDay).trim()}` : ''
  )

  return {
    ...raw,
    invitationType,
    groomNameAr,
    brideNameAr,
    groomName: groomNameAr,
    brideName: brideNameAr,
    brideFatherName: pickText(raw?.brideFatherName, raw?.fatherOfBride, raw?.father_of_bride),
    groomFatherName: pickText(raw?.groomFatherName, raw?.fatherOfGroom, raw?.father_of_groom),
    fatherOfBride: pickText(raw?.fatherOfBride, raw?.father_of_bride),
    fatherOfGroom: pickText(raw?.fatherOfGroom, raw?.father_of_groom),
    motherOfBride: pickText(raw?.motherOfBride, raw?.mother_of_bride),
    motherOfGroom: pickText(raw?.motherOfGroom, raw?.mother_of_groom),
    dateText,
    fullDateLine,
    weddingDayLine,
    hallLocation: isAnnouncementOnly ? '' : hallLocation,
    venueText: isAnnouncementOnly ? '' : pickText(raw?.venueText, hallLocation),
    locationName: isAnnouncementOnly ? '' : pickText(raw?.locationName, hallLocation),
    receptionTime: isAnnouncementOnly ? '' : receptionTimeRaw,
    zaffaTime: isEngagement ? '' : zaffaTimeRaw,
    date: pickText(raw?.date, dateText),
    engagementDate: pickText(raw?.engagementDate, raw?.date, dateText),
    noKids: Boolean(raw?.noKids),
    noPhotography: Boolean(raw?.noPhotography),
  }
}

function buildFieldsPayloadFromDraft(formData: Record<string, any>, selectedOccasion = '') {
  const normalized = normalizeFormDataForInvite(formData || {}, selectedOccasion)
  const receptionTimeValue = normalized.receptionTime || ''
  const zaffaTimeValue = normalized.zaffaTime || ''
  const isEngagement = selectedOccasion === 'engagement'

  return {
    groomNameAr: String(normalized?.groomNameAr || ''),
    brideNameAr: String(normalized?.brideNameAr || ''),
    groomName: String(normalized?.groomName || normalized?.groomNameAr || ''),
    brideName: String(normalized?.brideName || normalized?.brideNameAr || ''),
    fatherOfBride: String(normalized?.fatherOfBride || ''),
    fatherOfGroom: String(normalized?.fatherOfGroom || ''),
    brideFatherName: String(normalized?.brideFatherName || normalized?.fatherOfBride || ''),
    groomFatherName: String(normalized?.groomFatherName || normalized?.fatherOfGroom || ''),
    motherOfBride: isEngagement ? '' : String(normalized?.motherOfBride || ''),
    motherOfGroom: isEngagement ? '' : String(normalized?.motherOfGroom || ''),
    weddingDayLine: isEngagement ? '' : String(normalized?.weddingDayLine || ''),
    fullDateLine: String(normalized?.fullDateLine || ''),
    hallLocation: String(normalized?.hallLocation || ''),
    receptionTime: formatTimeLine('الاستقبال', receptionTimeValue),
    zaffaTime: isEngagement ? '' : formatTimeLine('الزفة', zaffaTimeValue),
    venueText: String(normalized?.venueText || normalized?.hallLocation || ''),
    date: String(normalized?.date || ''),
    engagementDate: String(normalized?.engagementDate || normalized?.date || ''),
    dateText: String(normalized?.dateText || ''),
    invitationType: String(normalized?.invitationType || 'attendance'),
    noKids: normalized?.noKids ? '1' : '0',
    noPhotography: normalized?.noPhotography ? '1' : '0',
  }
}

export default function CheckoutPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
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
  const [resolvedOrderCode, setResolvedOrderCode] = useState('')
  const [showPhoneVerifyModal, setShowPhoneVerifyModal] = useState(false)
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0)
  const [bypassCode, setBypassCode] = useState('')
  const [paymentError, setPaymentError] = useState('')
  const [gatewayNotice, setGatewayNotice] = useState('')
  const [checkoutModalStage, setCheckoutModalStage] = useState<CheckoutModalStage>('otp')
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null)
  const recaptchaInitializedRef = useRef(false)
  const otpInputRef = useRef<HTMLInputElement | null>(null)
  const isLocalPhoneVerifyBypassed =
    typeof window !== 'undefined' &&
    process.env.NODE_ENV === 'development' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

  useEffect(() => {
    const raw = window.sessionStorage.getItem('bushara_checkout_draft')
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as CheckoutDraft
      setDraft(parsed)
      if (parsed.phoneLocal) setPhoneInput((prev) => prev || parsed.phoneLocal || '')
      if (parsed.phoneVerified && parsed.phoneNumber) {
        const normalized = normalizeSaudiPhone(parsed.phoneNumber)
        if (normalized.ok) {
          setPhoneVerified(true)
          setVerifiedPhoneE164(normalized.e164)
          setVerifiedPhoneLocal(parsed.phoneLocal || normalized.local)
        }
      }
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
    setPhoneInput((prev) => prev || parsed.local)
  }, [user?.phoneNumber])

  useEffect(() => {
    const loadPhoneVerificationFromProfile = async () => {
      if (!user) return
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid))
        if (!userSnap.exists()) return
        const userData = userSnap.data() as any
        const profilePhoneRaw = String(userData?.phoneNumber || userData?.customerPhoneE164 || '').trim()
        const profileVerified = Boolean(userData?.phoneVerified)
        if (!profilePhoneRaw) return
        const parsed = normalizeSaudiPhone(profilePhoneRaw)
        if (!parsed.ok) return
        setPhoneInput((prev) => prev || parsed.local)
        if (profileVerified) {
          setPhoneVerified(true)
          setVerifiedPhoneE164(parsed.e164)
          setVerifiedPhoneLocal(parsed.local)
        }
      } catch (error) {
        console.error('Failed loading phone verification profile:', error)
      }
    }
    loadPhoneVerificationFromProfile()
  }, [user])

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
        recaptchaInitializedRef.current = false
      }
    }
  }, [])

  useEffect(() => {
    if (searchParams.get('payment') === 'cancelled') {
      setGatewayNotice('تم إلغاء عملية الدفع. يمكنك المحاولة مرة أخرى.')
    }
  }, [searchParams])

  const isExpectedOtpHostname = () => {
    if (typeof window === 'undefined') return false
    return EXPECTED_OTP_HOSTNAMES.has(window.location.hostname)
  }

  const logOtpDiagnostics = (phase: string) => {
    if (typeof window === 'undefined') return
    const hostname = window.location.hostname
    console.info('[OTP][CHECKOUT]', {
      phase,
      hostname,
      hostnameAllowed: EXPECTED_OTP_HOSTNAMES.has(hostname),
      recaptchaInitialized: recaptchaInitializedRef.current,
      modalOpen: showPhoneVerifyModal,
    })
  }

  const orderNumber = useMemo(() => {
    const key = draft?.templateId ? `bushara_order_number:${draft.templateId}` : ''
    if (!key) return `BSH-${Math.floor(100000 + Math.random() * 900000)}`
    const existing = typeof window !== 'undefined' ? window.sessionStorage.getItem(key) : ''
    if (existing) return existing
    const generated = `BSH-${Math.floor(100000 + Math.random() * 900000)}`
    if (typeof window !== 'undefined') window.sessionStorage.setItem(key, generated)
    return generated
  }, [draft?.templateId])
  const displayOrderCode = resolvedOrderCode || orderNumber
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
  const otpStep = otpVerificationId ? 2 : 1

  const persistPhoneVerificationArtifacts = async (phoneE164: string, phoneLocal: string) => {
    const verifiedAtIso = new Date().toISOString()
    if (draft) {
      const nextDraft: CheckoutDraft = {
        ...draft,
        phoneNumber: phoneE164,
        phoneLocal,
        phoneVerified: true,
        phoneVerifiedAt: verifiedAtIso,
      }
      setDraft(nextDraft)
      window.sessionStorage.setItem('bushara_checkout_draft', JSON.stringify(nextDraft))
    }
    if (!user) return
    try {
      await setDoc(
        doc(db, 'users', user.uid),
        {
          phoneNumber: phoneE164,
          phoneLocal,
          phoneVerified: true,
          phoneVerifiedAt: new Date(),
          updatedAt: new Date(),
        },
        { merge: true }
      )
    } catch (error) {
      console.error('Failed persisting phone verification on user profile:', error)
    }
  }

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
    setPaymentError('')
    setGatewayNotice('')
    setCheckoutModalStage(phoneVerified ? 'payment' : 'otp')
    logOtpDiagnostics('modal_opened')
  }

  const resetRecaptchaInstance = () => {
    if (!recaptchaRef.current) return
    try {
      recaptchaRef.current.clear()
    } catch {
      // Ignore reset errors; the goal is to force a clean verifier on next use.
    }
    recaptchaRef.current = null
    recaptchaInitializedRef.current = false
    logOtpDiagnostics('recaptcha_reset')
  }

  const handleClosePhoneVerifyModal = () => {
    setShowPhoneVerifyModal(false)
    resetRecaptchaInstance()
    setCheckoutModalStage('otp')
  }

  const ensureRecaptcha = () => {
    const containerId = 'checkout-phone-recaptcha'
    const containerEl = typeof document !== 'undefined' ? document.getElementById(containerId) : null
    if (!containerEl) {
      throw new Error('تعذر تهيئة أداة التحقق الأمني. يرجى تحديث الصفحة والمحاولة مرة أخرى.')
    }
    if (recaptchaRef.current) {
      // If modal was reopened, ensure verifier still points to a mounted container.
      const stillMounted = containerEl.isConnected
      if (stillMounted) return recaptchaRef.current
      resetRecaptchaInstance()
    }
    const verifier = new RecaptchaVerifier(auth, containerId, { size: 'invisible' })
    recaptchaRef.current = verifier
    recaptchaInitializedRef.current = true
    logOtpDiagnostics('recaptcha_initialized')
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
    if (!isExpectedOtpHostname()) {
      setOtpError('تعذر التحقق من أمان الطلب، يرجى تحديث الصفحة والمحاولة مرة أخرى.')
      logOtpDiagnostics('hostname_not_allowed')
      return
    }

    setOtpError('')
    setOtpStatus('')
    setOtpSending(true)
    logOtpDiagnostics('sending_otp')
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
      logOtpDiagnostics('otp_sent')
    } catch (error: any) {
      console.error('Failed sending checkout OTP:', error)
      setOtpError(mapOtpErrorMessage(error))
      if (String(error?.code || '').toLowerCase().includes('auth/captcha-check-failed')) {
        resetRecaptchaInstance()
      }
      logOtpDiagnostics('otp_send_failed')
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
      await persistPhoneVerificationArtifacts(normalized.e164, normalized.local)
      setOtpStatus('تم توثيق رقم الجوال بنجاح.')
      return true
    } catch (error: any) {
      console.error('Failed verifying checkout OTP:', error)
      setPhoneVerified(false)
      setVerifiedPhoneE164('')
      setVerifiedPhoneLocal('')
      setOtpError(mapOtpErrorMessage(error) || 'رمز التحقق غير صحيح أو منتهي الصلاحية.')
      return false
    } finally {
      setOtpVerifying(false)
    }
  }

  const handleConfirmOtpAndContinue = async () => {
    const ok = await handleVerifyOtp()
    if (!ok) return
    setPaymentError('')
    setGatewayNotice('')
    setCheckoutModalStage('payment')
  }

  const handleBypassPhoneVerifyAndContinue = async () => {
    if (authLoading) return
    if (!user) {
      alert('سجل الدخول أولاً لإكمال الدفع والمتابعة للمدعوين.')
      router.push('/login')
      return
    }
    if (!normalizedPhone.ok) {
      setOtpError(normalizedPhone.reason)
      return
    }
    setOtpError('')
    setOtpStatus('تم حفظ رقم الجوال محلياً بدون تحقق OTP.')
    setPhoneVerified(true)
    setVerifiedPhoneE164(normalizedPhone.e164)
    setVerifiedPhoneLocal(normalizedPhone.local)
    await persistPhoneVerificationArtifacts(normalizedPhone.e164, normalizedPhone.local)
    setPaymentError('')
    setGatewayNotice('')
    setCheckoutModalStage('payment')
  }

  const ensureInviteBeforePayment = async (
    overridePhone?: { phoneE164: string; phoneLocal: string }
  ): Promise<string> => {
    if (!draft?.templateId || !hasValidPackage) {
      throw new Error('لا يمكن إكمال الدفع بدون اختيار باقة.')
    }
    if (!user) {
      throw new Error('سجل الدخول أولاً لإكمال الدفع.')
    }

    const effectivePhoneE164 = overridePhone?.phoneE164 || verifiedPhoneE164
    const effectivePhoneLocal =
      overridePhone?.phoneLocal || verifiedPhoneLocal || (normalizedPhone.ok ? normalizedPhone.local : '')
    if (!effectivePhoneE164) {
      throw new Error('يرجى تأكيد رقم الجوال قبل المتابعة للدفع')
    }

    const inviteStorageKey = `bushara_active_invite_id:${draft.templateId}`
    let existingInviteId = window.sessionStorage.getItem(inviteStorageKey) || ''
    if (existingInviteId) {
      try {
        const existingSnap = await getDoc(doc(db, 'invites', existingInviteId))
        const existingWorkflow = String(existingSnap.data()?.workflowStatus || '')
        if (existingSnap.exists() && TERMINAL_WORKFLOW_STATUSES.has(existingWorkflow)) {
          existingInviteId = ''
          window.sessionStorage.removeItem(inviteStorageKey)
        }
      } catch {
        // Keep flow resilient if read fails.
      }
    }

    const normalizedFormData = normalizeFormDataForInvite(draft.formData || {}, draft.selectedOccasion || '')
    const sourceDraftId = `${user.uid}_${draft.templateId}`
    let inviteImageUrl = draft.finalUrl || draft.previewUrl || ''

    if (!inviteImageUrl) {
      try {
        const renderResponse = await fetch('/api/render/final', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            templateId: draft.templateId,
            variant: 'whatsapp_1080x1920',
            fields: buildFieldsPayloadFromDraft(normalizedFormData, draft.selectedOccasion || ''),
          }),
        })
        const renderData = await renderResponse.json().catch(() => ({}))
        if (renderResponse.ok && renderData?.url) {
          inviteImageUrl = String(renderData.url)
        }
      } catch (error) {
        console.error('Failed generating final invite image before payment:', error)
      }
    }

    const pendingInviteBase = {
      ownerId: user.uid,
      sourceDraftId,
      sourceTemplateId: draft.templateId,
      sourceDraftLinkedAt: new Date(),
      title: `دعوة ${normalizedFormData?.groomNameAr || ''} ${normalizedFormData?.brideNameAr || ''}`.trim() || 'دعوة مناسبة جديدة',
      groomNameAr: normalizedFormData?.groomNameAr || '',
      brideNameAr: normalizedFormData?.brideNameAr || '',
      groomName: normalizedFormData?.groomNameAr || '',
      brideName: normalizedFormData?.brideNameAr || '',
      brideFatherName: normalizedFormData?.fatherOfBride || '',
      groomFatherName: normalizedFormData?.fatherOfGroom || '',
      engagementDate: normalizedFormData?.engagementDate || normalizedFormData?.date || '',
      invitationType: normalizedFormData?.invitationType || 'attendance',
      fatherOfBride: normalizedFormData?.fatherOfBride || '',
      fatherOfGroom: normalizedFormData?.fatherOfGroom || '',
      motherOfBride: normalizedFormData?.motherOfBride || '',
      motherOfGroom: normalizedFormData?.motherOfGroom || '',
      date: normalizedFormData?.date || '',
      dateText: normalizedFormData?.dateText || '',
      fullDateLine: normalizedFormData?.fullDateLine || '',
      weddingDayLine: normalizedFormData?.weddingDayLine || '',
      time: normalizedFormData?.receptionTime || '',
      receptionTime: normalizedFormData?.receptionTime || '',
      zaffaTime: normalizedFormData?.zaffaTime || '',
      locationName: normalizedFormData?.hallLocation || '',
      hallLocation: normalizedFormData?.hallLocation || '',
      venueText: normalizedFormData?.venueText || normalizedFormData?.hallLocation || '',
      introText: normalizedFormData?.introText || '',
      inviteLine: normalizedFormData?.inviteLine || '',
      verseOrDua: normalizedFormData?.verseOrDua || '',
      formData: normalizedFormData,
      locationMapUrl: '',
      designId: draft.templateId,
      selectedOccasion: draft.selectedOccasion || '',
      occasionType: draft.selectedOccasion || '',
      packageId: draft.packageGuests || '',
      packageGuests: Number(draft.packageGuests || 0),
      packagePrice: Number(draft.packagePrice || 0),
      guestLimit: Number(draft.packageGuests || 0),
      finalUrl: draft.finalUrl || '',
      previewUrl: draft.previewUrl || '',
      inviteImageUrl,
      adminPreviewUrl: inviteImageUrl,
      orderNumber: displayOrderCode,
      orderStatus: 'awaiting_payment',
      dispatchMode: 'manual',
      dispatchStatus: 'pending',
      status: 'draft',
      paid: false,
      paymentStatus: 'pending',
      paymentMethod: 'moyasar',
      customerPhoneE164: effectivePhoneE164,
      customerPhoneLocal: effectivePhoneLocal,
      customerPhoneVerified: true,
      customerPhoneVerifiedAt: new Date(),
      workflowStatus: INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT,
      reviewStatus: INVITE_REVIEW_STATUS.PENDING,
      scheduledSendAt: null,
      timezone: 'Asia/Riyadh',
      sendStatusSummary: { total: 0, pending: 0, sent: 0, failed: 0 },
      lastSendAt: null,
      updatedAt: new Date(),
    }

    let inviteId = existingInviteId
    if (existingInviteId) {
      await setDoc(doc(db, 'invites', existingInviteId), sanitizeForFirestore(pendingInviteBase), { merge: true })
    } else {
      const inviteRef = await addDoc(
        collection(db, 'invites'),
        sanitizeForFirestore({ ...pendingInviteBase, createdAt: new Date() })
      )
      inviteId = inviteRef.id
      window.sessionStorage.setItem(inviteStorageKey, inviteId)
    }

    window.sessionStorage.setItem('bushara_current_invite_id', inviteId)
    window.sessionStorage.setItem(`bushara_active_invite_id:${draft.templateId}`, inviteId)

    try {
      const initOrderResponse = await fetch(`/api/user/invitations/${encodeURIComponent(inviteId)}/initialize-order`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
      })
      const initOrderData = await initOrderResponse.json().catch(() => ({}))
      const persistedOrderCode = String(initOrderData?.orderCode || '').trim()
      if (persistedOrderCode) setResolvedOrderCode(persistedOrderCode)
    } catch (error) {
      console.error('[ORDER] Failed to initialize order foundation before payment:', error)
    }

    return inviteId
  }

  const startMoyasarPayment = async (overridePhone?: { phoneE164: string; phoneLocal: string }) => {
    if (!user) {
      alert('سجل الدخول أولاً لإكمال الدفع.')
      router.push('/login')
      return
    }

    setPaymentError('')
    setGatewayNotice('')
    setPaying(true)

    if (!isMoyasarCheckoutAvailable()) {
      setPaymentError('بوابة الدفع غير مفعّلة. تأكد من إعداد مفاتيح Moyasar في بيئة التشغيل.')
      setPaying(false)
      return
    }

    try {
      const invitationId = await ensureInviteBeforePayment(overridePhone)
      if (!total || total <= 0) {
        throw new Error('مبلغ الدفع غير صالح')
      }

      const paymentResponse = await fetch('/api/payments/moyasar/create', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          invitationId,
          amount: total,
        }),
      })
      const paymentData = await paymentResponse.json().catch(() => ({}))
      if (!paymentResponse.ok) {
        throw new Error(String(paymentData?.error || 'تعذر بدء عملية الدفع'))
      }

      const paymentUrl = String(paymentData?.payment_url || '').trim()
      if (!paymentUrl) {
        throw new Error('لم يتم استلام رابط الدفع من Moyasar')
      }

      window.location.assign(paymentUrl)
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'تعذر بدء الدفع'
      setPaymentError(message)
      setPaying(false)
    }
  }

  const finalizeInviteAfterPayment = async (
    paymentMethod: 'stripe' | 'bypass_code',
    overridePhone?: { phoneE164: string; phoneLocal: string }
  ) => {
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
    const effectivePhoneE164 = overridePhone?.phoneE164 || verifiedPhoneE164
    const effectivePhoneLocal =
      overridePhone?.phoneLocal || verifiedPhoneLocal || (normalizedPhone.ok ? normalizedPhone.local : '')
    if (!effectivePhoneE164) {
      alert('يرجى تأكيد رقم الجوال قبل المتابعة للدفع')
      return
    }
    if (paying) return

    setPaying(true)
    try {
      const inviteStorageKey = `bushara_active_invite_id:${draft.templateId}`
      let existingInviteId = window.sessionStorage.getItem(inviteStorageKey) || ''
      if (existingInviteId) {
        try {
          const existingSnap = await getDoc(doc(db, 'invites', existingInviteId))
          const existingWorkflow = String(existingSnap.data()?.workflowStatus || '')
          if (existingSnap.exists() && TERMINAL_WORKFLOW_STATUSES.has(existingWorkflow)) {
            existingInviteId = ''
            window.sessionStorage.removeItem(inviteStorageKey)
          }
        } catch {
          // Keep flow resilient if read fails.
        }
      }
      let inviteId = existingInviteId
      let inviteImageUrl = draft.finalUrl || draft.previewUrl || ''
      const normalizedFormData = normalizeFormDataForInvite(draft.formData || {}, draft.selectedOccasion || '')
      const sourceDraftId = `${user.uid}_${draft.templateId}`

      if (!inviteImageUrl) {
        try {
          const renderResponse = await fetch('/api/render/final', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateId: draft.templateId,
              variant: 'whatsapp_1080x1920',
              fields: buildFieldsPayloadFromDraft(normalizedFormData, draft.selectedOccasion || ''),
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
        const invitePayload = {
          ownerId: user.uid,
          sourceDraftId,
          sourceTemplateId: draft.templateId,
          sourceDraftLinkedAt: new Date(),
          title: `دعوة ${normalizedFormData?.groomNameAr || ''} ${normalizedFormData?.brideNameAr || ''}`.trim() || 'دعوة مناسبة جديدة',
          groomNameAr: normalizedFormData?.groomNameAr || '',
          brideNameAr: normalizedFormData?.brideNameAr || '',
          groomName: normalizedFormData?.groomNameAr || '',
          brideName: normalizedFormData?.brideNameAr || '',
          brideFatherName: normalizedFormData?.fatherOfBride || '',
          groomFatherName: normalizedFormData?.fatherOfGroom || '',
          engagementDate: normalizedFormData?.engagementDate || normalizedFormData?.date || '',
          invitationType: normalizedFormData?.invitationType || 'attendance',
          fatherOfBride: normalizedFormData?.fatherOfBride || '',
          fatherOfGroom: normalizedFormData?.fatherOfGroom || '',
          motherOfBride: normalizedFormData?.motherOfBride || '',
          motherOfGroom: normalizedFormData?.motherOfGroom || '',
          date: normalizedFormData?.date || '',
          dateText: normalizedFormData?.dateText || '',
          fullDateLine: normalizedFormData?.fullDateLine || '',
          weddingDayLine: normalizedFormData?.weddingDayLine || '',
          time: normalizedFormData?.receptionTime || '',
          receptionTime: normalizedFormData?.receptionTime || '',
          zaffaTime: normalizedFormData?.zaffaTime || '',
          locationName: normalizedFormData?.hallLocation || '',
          hallLocation: normalizedFormData?.hallLocation || '',
          venueText: normalizedFormData?.venueText || normalizedFormData?.hallLocation || '',
          introText: normalizedFormData?.introText || '',
          inviteLine: normalizedFormData?.inviteLine || '',
          verseOrDua: normalizedFormData?.verseOrDua || '',
          formData: normalizedFormData,
          locationMapUrl: '',
          designId: draft.templateId,
          selectedOccasion: draft.selectedOccasion || '',
          occasionType: draft.selectedOccasion || '',
          packageId: draft.packageGuests || '',
          packageGuests: Number(draft.packageGuests || 0),
          packagePrice: Number(draft.packagePrice || 0),
          guestLimit: Number(draft.packageGuests || 0),
          finalUrl: draft.finalUrl || '',
          previewUrl: draft.previewUrl || '',
          inviteImageUrl,
          adminPreviewUrl: inviteImageUrl,
          orderNumber: displayOrderCode,
          orderStatus: 'pending_review',
          dispatchMode: 'manual',
          dispatchStatus: 'pending',
          status: 'paid',
          paymentStatus: 'paid',
          inviteLockedAfterPayment: true,
          paymentMethod,
          customerPhoneE164: effectivePhoneE164,
          customerPhoneLocal: effectivePhoneLocal,
          customerPhoneVerified: true,
          customerPhoneVerifiedAt: new Date(),
          workflowStatus: INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
          reviewStatus: INVITE_REVIEW_STATUS.PENDING,
          adminNotificationStatus: 'pending',
          workshopEnteredAt: new Date(),
          scheduledSendAt: null,
          timezone: 'Asia/Riyadh',
          sendStatusSummary: { total: 0, pending: 0, sent: 0, failed: 0 },
          lastSendAt: null,
          paidAt: new Date(),
          updatedAt: new Date(),
        }
        await setDoc(doc(db, 'invites', existingInviteId), sanitizeForFirestore(invitePayload), { merge: true })
      } else {
        const invitePayload = {
          ownerId: user.uid,
          sourceDraftId,
          sourceTemplateId: draft.templateId,
          sourceDraftLinkedAt: new Date(),
          title: `دعوة ${normalizedFormData?.groomNameAr || ''} ${normalizedFormData?.brideNameAr || ''}`.trim() || 'دعوة مناسبة جديدة',
          groomNameAr: normalizedFormData?.groomNameAr || '',
          brideNameAr: normalizedFormData?.brideNameAr || '',
          groomName: normalizedFormData?.groomNameAr || '',
          brideName: normalizedFormData?.brideNameAr || '',
          brideFatherName: normalizedFormData?.fatherOfBride || '',
          groomFatherName: normalizedFormData?.fatherOfGroom || '',
          engagementDate: normalizedFormData?.engagementDate || normalizedFormData?.date || '',
          invitationType: normalizedFormData?.invitationType || 'attendance',
          fatherOfBride: normalizedFormData?.fatherOfBride || '',
          fatherOfGroom: normalizedFormData?.fatherOfGroom || '',
          motherOfBride: normalizedFormData?.motherOfBride || '',
          motherOfGroom: normalizedFormData?.motherOfGroom || '',
          date: normalizedFormData?.date || '',
          dateText: normalizedFormData?.dateText || '',
          fullDateLine: normalizedFormData?.fullDateLine || '',
          weddingDayLine: normalizedFormData?.weddingDayLine || '',
          time: normalizedFormData?.receptionTime || '',
          receptionTime: normalizedFormData?.receptionTime || '',
          zaffaTime: normalizedFormData?.zaffaTime || '',
          locationName: normalizedFormData?.hallLocation || '',
          hallLocation: normalizedFormData?.hallLocation || '',
          venueText: normalizedFormData?.venueText || normalizedFormData?.hallLocation || '',
          introText: normalizedFormData?.introText || '',
          inviteLine: normalizedFormData?.inviteLine || '',
          verseOrDua: normalizedFormData?.verseOrDua || '',
          formData: normalizedFormData,
          locationMapUrl: '',
          designId: draft.templateId,
          selectedOccasion: draft.selectedOccasion || '',
          occasionType: draft.selectedOccasion || '',
          packageId: draft.packageGuests || '',
          packageGuests: Number(draft.packageGuests || 0),
          packagePrice: Number(draft.packagePrice || 0),
          guestLimit: Number(draft.packageGuests || 0),
          finalUrl: draft.finalUrl || '',
          previewUrl: draft.previewUrl || '',
          inviteImageUrl,
          adminPreviewUrl: inviteImageUrl,
          orderNumber: displayOrderCode,
          orderStatus: 'pending_review',
          dispatchMode: 'manual',
          dispatchStatus: 'pending',
          status: 'paid',
          paymentStatus: 'paid',
          inviteLockedAfterPayment: true,
          paymentMethod,
          customerPhoneE164: effectivePhoneE164,
          customerPhoneLocal: effectivePhoneLocal,
          customerPhoneVerified: true,
          customerPhoneVerifiedAt: new Date(),
          workflowStatus: INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
          reviewStatus: INVITE_REVIEW_STATUS.PENDING,
          adminNotificationStatus: 'pending',
          workshopEnteredAt: new Date(),
          scheduledSendAt: null,
          timezone: 'Asia/Riyadh',
          sendStatusSummary: { total: 0, pending: 0, sent: 0, failed: 0 },
          lastSendAt: null,
          paidAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        }
        const inviteRef = await addDoc(collection(db, 'invites'), sanitizeForFirestore(invitePayload))
        inviteId = inviteRef.id
        window.sessionStorage.setItem(inviteStorageKey, inviteId)
      }

      let persistedOrderCode = displayOrderCode
      try {
        const initOrderResponse = await fetch(`/api/user/invitations/${encodeURIComponent(inviteId)}/initialize-order`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${await user.getIdToken()}`,
          },
        })
        const initOrderData = await initOrderResponse.json().catch(() => ({}))
        if (!initOrderResponse.ok) {
          throw new Error(initOrderData?.error || 'تعذر إنشاء كود الطلب الرسمي')
        }
        persistedOrderCode = String(initOrderData?.orderCode || '').trim() || displayOrderCode
        if (persistedOrderCode) setResolvedOrderCode(persistedOrderCode)
      } catch (error) {
        console.error('[ORDER] Failed to initialize order foundation after checkout:', error)
      }

      window.sessionStorage.setItem('bushara_current_invite_id', inviteId)
      window.sessionStorage.setItem(`bushara_active_invite_id:${draft.templateId}`, inviteId)
      window.sessionStorage.setItem('bushara_last_order_number', persistedOrderCode)
      window.sessionStorage.setItem(
        'bushara_payment_status',
        JSON.stringify({
          orderNumber: persistedOrderCode,
          orderCode: persistedOrderCode,
          paidAt: new Date().toISOString(),
          templateId: draft.templateId,
          inviteId,
        })
      )
      const idToken = await user.getIdToken()
      if (!inviteImageUrl) {
        throw new Error('تعذر تجهيز صورة الدعوة. ارجع للتصميم ثم أعد المحاولة.')
      }

      const workshopResponse = await fetch('/api/workshop/enter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          inviteId,
          previewUrl: inviteImageUrl,
          adminPreviewUrl: inviteImageUrl,
          inviteImageUrl,
        }),
      })
      const workshopData = await workshopResponse.json().catch(() => ({}))
      if (!workshopResponse.ok) {
        const workshopErrorText = String(workshopData?.error || '')
        const isCredentialsIssue =
          workshopErrorText.includes('default credentials') ||
          workshopErrorText.includes('Project Id') ||
          workshopErrorText.includes('Admin SDK not configured')
        const isMissingPreview = workshopErrorText.toLowerCase().includes('preview')
        if (!isCredentialsIssue && !isMissingPreview) {
          throw new Error(workshopData?.error || 'تعذر إكمال معالجة الطلب بعد الدفع')
        }
        if (isMissingPreview) {
          throw new Error('تعذر تجهيز معاينة الدعوة للمراجعة. حاول مرة أخرى من صفحة التصميم.')
        }
        await setDoc(
          doc(db, 'invites', inviteId),
          sanitizeForFirestore({
            workflowStatus: INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
            reviewStatus: INVITE_REVIEW_STATUS.PENDING,
            paymentStatus: 'paid',
            status: 'paid',
            workshopEnteredAt: new Date(),
            inviteImageUrl,
            adminPreviewUrl: inviteImageUrl,
            adminNotificationStatus: 'pending',
            adminNotificationError: workshopErrorText || 'workshop_enter_pending_server',
            updatedAt: new Date(),
          }),
          { merge: true }
        )
        console.warn('[CHECKOUT] workshop enter skipped on server; invite queued locally for admin review')
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
      handleClosePhoneVerifyModal()
      router.push(`/dashboard/invites/${encodeURIComponent(inviteId)}/workshop-status`)
    } catch (error: unknown) {
      console.error('Failed to create invite after payment:', error)
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String((error as { message?: string }).message || '')
            : ''
      alert(message || 'حدث خطأ أثناء إنشاء الدعوة. حاول مرة أخرى.')
    } finally {
      setPaying(false)
    }
  }

  const handleStartPaymentFlow = async (overridePhone?: { phoneE164: string; phoneLocal: string }) => {
    if (!user) {
      alert('سجل الدخول أولاً لإكمال الدفع.')
      router.push('/login')
      return
    }
    const effectivePhoneE164 = overridePhone?.phoneE164 || verifiedPhoneE164
    const effectivePhoneLocal =
      overridePhone?.phoneLocal || verifiedPhoneLocal || (normalizedPhone.ok ? normalizedPhone.local : '')
    if (!effectivePhoneE164) {
      setPaymentError('يرجى تأكيد رقم الجوال قبل المتابعة للدفع')
      return
    }
    setPaymentError('')
    setGatewayNotice('')

    const idToken = await user.getIdToken()
    const code = String(bypassCode || '').trim()
    if (code) {
      const bypassRes = await fetch('/api/stripe/validate-bypass', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code }),
      })
      const bypassData = await bypassRes.json().catch(() => ({}))
      if (bypassRes.ok) {
        await finalizeInviteAfterPayment('bypass_code', {
          phoneE164: effectivePhoneE164,
          phoneLocal: effectivePhoneLocal,
        })
        return
      }
      if (bypassRes.status !== 403) {
        setPaymentError(String(bypassData?.error || 'تعذر التحقق من كود التجاوز.'))
        return
      }
      setPaymentError('كود التجاوز غير صحيح. يمكنك تجربة بوابة الدفع الرسمية عند عودتها للعمل.')
    }

    await startMoyasarPayment({
      phoneE164: effectivePhoneE164,
      phoneLocal: effectivePhoneLocal,
    })
  }

  const showGatewayOptions = phoneVerified && !paying
  const isOtpStage = checkoutModalStage === 'otp'

  const handleGatewayMethodClick = (_method: 'apple_pay' | 'card') => {
    void startMoyasarPayment()
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
              { id: 3, label: 'بيانات المناسبة' },
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
                    رقم الطلب: {displayOrderCode}
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
                  <p>💳 الدفع عبر Moyasar (بطاقة / Apple Pay)</p>
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
                <h3 className="text-xl font-bold text-textDark">
                  {isOtpStage ? 'توثيق رقم الجوال' : 'خيارات الدفع'}
                </h3>
                <p className="mt-1 text-sm text-muted">
                  {isOtpStage
                    ? isLocalPhoneVerifyBypassed
                      ? 'وضع محلي: أدخل رقم الجوال وسيتم حفظه مباشرة بدون OTP.'
                      : 'الخطوة 1 من 2: أدخل رقمك وتحقق بالرمز.'
                    : 'الخطوة 2 من 2: اختر وسيلة الدفع أو أدخل كود التجاوز.'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleClosePhoneVerifyModal}
                className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-gray-500 hover:bg-gray-50"
              >
                إغلاق
              </button>
            </div>

            <div className="space-y-3">
              {isOtpStage ? (
                <>
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
                        setGatewayNotice('')
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
                </>
              ) : (
                <>
                  <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                    تم توثيق رقم الجوال بنجاح: {verifiedPhoneLocal || (normalizedPhone.ok ? normalizedPhone.local : '-')}
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs text-muted">اختياري: كود تجاوز الدفع (للاستخدام الداخلي فقط)</p>
                    <input
                      type="text"
                      value={bypassCode}
                      onChange={(e) => setBypassCode(e.target.value)}
                      placeholder="أدخل كود التجاوز"
                      className="w-full rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  {showGatewayOptions ? (
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-3">
                      <p className="mb-2 text-sm font-semibold text-textDark">بوابة الدفع</p>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() => handleGatewayMethodClick('apple_pay')}
                          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          Apple Pay
                        </button>
                        <button
                          type="button"
                          onClick={() => handleGatewayMethodClick('card')}
                          className="rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
                        >
                          الدفع بالبطاقة
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {paymentError && <p className="text-xs text-red-600">{paymentError}</p>}
                  {gatewayNotice && <p className="text-xs text-amber-700">{gatewayNotice}</p>}
                  <button
                    type="button"
                    onClick={() => handleStartPaymentFlow()}
                    disabled={paying || authLoading || !user}
                    className="mt-1 h-12 w-full rounded-xl bg-primary font-semibold text-white hover:bg-accent transition-colors disabled:opacity-50"
                  >
                    {paying ? 'جارٍ المعالجة...' : 'متابعة الدفع'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutModalStage('otp')
                      setPhoneVerified(false)
                      setVerifiedPhoneE164('')
                      setVerifiedPhoneLocal('')
                      setOtpVerificationId('')
                      setPendingOtpPhoneE164('')
                      setOtpCode('')
                      setOtpError('')
                      setOtpStatus('')
                      setPaymentError('')
                      setGatewayNotice('')
                    }}
                    className="h-11 w-full rounded-xl border border-gray-300 bg-white font-semibold text-textDark hover:bg-gray-50 transition-colors"
                  >
                    تعديل رقم الجوال
                  </button>
                </>
              )}
            </div>

            {isOtpStage ? (
              <button
                type="button"
                onClick={
                  isLocalPhoneVerifyBypassed
                    ? handleBypassPhoneVerifyAndContinue
                    : otpStep === 1
                    ? handleSendOtp
                    : handleConfirmOtpAndContinue
                }
                disabled={
                  isLocalPhoneVerifyBypassed
                    ? otpSending || otpVerifying || paying || authLoading || !user
                    : otpStep === 1
                    ? otpSending || otpVerifying || !user
                    : otpSending || otpVerifying || paying || authLoading || !otpCode.trim()
                }
                className="mt-5 h-12 w-full rounded-xl bg-primary font-semibold text-white hover:bg-accent transition-colors disabled:opacity-50"
              >
                {isLocalPhoneVerifyBypassed
                  ? otpVerifying || paying
                    ? 'جارٍ الحفظ...'
                    : 'حفظ الرقم والمتابعة'
                  : otpStep === 1
                  ? otpSending
                    ? 'جارٍ إرسال الرمز...'
                    : 'إرسال رمز التحقق'
                  : otpVerifying || paying
                  ? 'جارٍ المعالجة...'
                  : 'تأكيد رقم الجوال'}
              </button>
            ) : null}

            {isOtpStage && otpStep === 2 && !isLocalPhoneVerifyBypassed ? (
              <button
                type="button"
                onClick={handleSendOtp}
                disabled={otpSending || otpVerifying || resendSecondsLeft > 0}
                className="mt-3 h-10 w-full rounded-xl border border-gray-300 bg-white text-sm font-semibold text-textDark hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {resendSecondsLeft > 0 ? `إعادة إرسال الرمز خلال ${resendSecondsLeft} ث` : 'إعادة إرسال رمز التحقق'}
              </button>
            ) : null}

            {!isLocalPhoneVerifyBypassed && <div id="checkout-phone-recaptcha" />}
          </div>
        </div>
      )}
      <Footer />
    </>
  )
}
