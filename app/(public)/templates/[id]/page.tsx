'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Template } from '@/lib/firebase/types'
import { formatDateForInvitation } from '@/lib/render/date-format'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import StepperHeader from '@/components/flow/StepperHeader'
import { parsePackageFromParams, readPackageFromSessionStorage } from '@/lib/flow/package-selection'

const AR_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const INVITE_FORM_DRAFT_KEY_PREFIX = 'bushara_invite_form_draft'
const HOUR_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i + 1))
const MINUTE_OPTIONS = ['00', '30'] as const
const PERIOD_OPTIONS = [
  { value: 'AM', label: 'ص' },
  { value: 'PM', label: 'م' },
] as const

type TimePeriod = 'AM' | 'PM'
type StepId = 1 | 2 | 3 | 4 | 5

function formatHijriDateLine(isoDate: string): string {
  if (!isoDate) return ''
  const date = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatGregorianDateLine(isoDate: string): string {
  if (!isoDate) return ''
  const date = new Date(`${isoDate}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ar-SA-u-ca-gregory', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function formatTimeLine(label: string, timeValue: string): string {
  if (!timeValue) return ''
  return `${label} ${timeValue}`
}

function normalizeHijriSuffix(value: string): string {
  return value.replace(/\s*هـ\s*$/u, '').trim()
}

function normalizeMinuteToHalfHour(minute: number): '00' | '30' {
  return minute >= 30 ? '30' : '00'
}

function parseSavedTime(value: string): { hour: string; minute: '00' | '30'; period: TimePeriod } {
  const fallback = { hour: '', minute: '00' as const, period: 'PM' as TimePeriod }
  if (!value) return fallback

  const twelveHourMatch = value.match(/(\d{1,2}):(\d{2})\s*(ص|م|AM|PM)/i)
  if (twelveHourMatch) {
    const hour = Math.min(12, Math.max(1, Number(twelveHourMatch[1]) || 1))
    const minute = normalizeMinuteToHalfHour(Number(twelveHourMatch[2]) || 0)
    const token = twelveHourMatch[3].toUpperCase()
    const period: TimePeriod = token === 'AM' || token === 'ص' ? 'AM' : 'PM'
    return { hour: String(hour), minute, period }
  }

  const twentyFourHourMatch = value.match(/^(\d{1,2}):(\d{2})$/)
  if (twentyFourHourMatch) {
    const hour24 = Math.min(23, Math.max(0, Number(twentyFourHourMatch[1]) || 0))
    const minute = normalizeMinuteToHalfHour(Number(twentyFourHourMatch[2]) || 0)
    const period: TimePeriod = hour24 >= 12 ? 'PM' : 'AM'
    const hour12 = hour24 % 12 || 12
    return { hour: String(hour12), minute, period }
  }

  return fallback
}

function formatSelectedTime12(hour: string, minute: string, period: TimePeriod): string {
  if (!hour) return ''
  const hourNum = Math.min(12, Math.max(1, Number(hour) || 1))
  const minuteSafe = minute === '30' ? '30' : '00'
  const periodLabel = period === 'AM' ? 'ص' : 'م'
  return `${hourNum}:${minuteSafe} ${periodLabel}`
}

export default function TemplateDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const templateId = params.id as string
  const [template, setTemplate] = useState<Template | null>(null)
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const didHydrateDraftRef = useRef(false)
  const packageGuests = searchParams.get('packageGuests') || ''
  const packagePrice = searchParams.get('packagePrice') || ''
  const selectedOccasion = searchParams.get('occasion') || ''
  const [hasValidPackage, setHasValidPackage] = useState(false)

  const [formData, setFormData] = useState({
    groomNameAr: '',
    brideNameAr: '',
    fatherOfBride: '',
    fatherOfGroom: '',
    motherOfBride: '',
    motherOfGroom: '',
    dateText: '',
    date: '',
    weddingDay: '',
    fullDateLine: '',
    hallLocation: '',
    receptionHour: '',
    receptionMinute: '00' as '00' | '30',
    receptionPeriod: 'PM' as TimePeriod,
    zaffaHour: '',
    zaffaMinute: '00' as '00' | '30',
    zaffaPeriod: 'PM' as TimePeriod,
    noKids: false,
    noPhotography: false,
  })
  const [currentStep, setCurrentStep] = useState<StepId>(2)
  const [stepErrors, setStepErrors] = useState<Record<string, string>>({})
  const [stepLoading, setStepLoading] = useState(false)
  const [autoSaveState, setAutoSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [lastSavedAt, setLastSavedAt] = useState<string>('')
  const formDraftKey = `${INVITE_FORM_DRAFT_KEY_PREFIX}:${templateId}`
  const didLoadFirestoreDraftRef = useRef(false)

  const steps: Array<{ id: StepId; label: string }> = [
    { id: 1, label: 'نوع المناسبة' },
    { id: 2, label: 'اختيار القالب' },
    { id: 3, label: 'بيانات العروس والعريس' },
    { id: 4, label: 'تفاصيل المناسبة' },
    { id: 5, label: 'الدفع' },
  ]

  const updateField = <K extends keyof typeof formData>(key: K, value: (typeof formData)[K]) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
    setStepErrors((prev) => {
      if (!prev[key as string]) return prev
      const next = { ...prev }
      delete next[key as string]
      return next
    })
  }

  const buildFieldsPayload = () => {
    return {
      groomNameAr: formData.groomNameAr,
      brideNameAr: formData.brideNameAr,
      fatherOfBride: formData.fatherOfBride,
      fatherOfGroom: formData.fatherOfGroom,
      motherOfBride: formData.motherOfBride,
      motherOfGroom: formData.motherOfGroom,
      weddingDayLine: formData.weddingDay
        ? `وذلك بمشيئة الله تعالى يوم ${formData.weddingDay}`
        : '',
      fullDateLine: formData.fullDateLine,
      hallLocation: formData.hallLocation,
      receptionTime: receptionTimeLine,
      zaffaTime: zaffaTimeLine,
      venueText: formData.hallLocation,
      date: formData.date,
      dateText: formData.dateText,
      noKids: formData.noKids ? '1' : '0',
      noPhotography: formData.noPhotography ? '1' : '0',
    }
  }

  const validateCurrentStep = (step = currentStep) => {
    const nextErrors: Record<string, string> = {}

    if (step === 2) {
      if (!formData.brideNameAr.trim()) nextErrors.brideNameAr = 'اسم العروس مطلوب'
      if (!formData.groomNameAr.trim()) nextErrors.groomNameAr = 'اسم العريس مطلوب'
      if (!formData.fatherOfBride.trim()) nextErrors.fatherOfBride = 'اسم اب العروس والعائلة مطلوب'
      if (!formData.fatherOfGroom.trim()) nextErrors.fatherOfGroom = 'اسم اب العريس والعائلة مطلوب'
      if (!formData.motherOfBride.trim()) nextErrors.motherOfBride = 'اسم ام العروس كاملا مطلوب'
      if (!formData.motherOfGroom.trim()) nextErrors.motherOfGroom = 'اسم ام العريس كاملا مطلوب'
    }

    if (step === 3) {
      if (!formData.date) nextErrors.date = 'التاريخ مطلوب'
      if (template?.type !== 'B') {
        if (!formData.hallLocation.trim()) nextErrors.hallLocation = 'اسم القاعة مطلوب'
        if (!formData.receptionHour) nextErrors.receptionHour = 'حدد وقت الاستقبال'
        if (!formData.zaffaHour) nextErrors.zaffaHour = 'حدد وقت الزفة'
      }
    }

    setStepErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const goToNextStep = async () => {
    if (!validateCurrentStep()) return
    setStepLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 220))
    setCurrentStep((prev) => Math.min(5, prev + 1) as StepId)
    setStepLoading(false)
  }

  const goToPreviousStep = () => {
    setCurrentStep((prev) => Math.max(2, prev - 1) as StepId)
  }

  const handleStepperClick = (stepId: number) => {
    const params = new URLSearchParams()
    if (packageGuests) params.set('packageGuests', packageGuests)
    if (packagePrice) params.set('packagePrice', packagePrice)
    if (selectedOccasion) params.set('occasion', selectedOccasion)
    const qs = params.toString()

    if (stepId === 1) {
      router.push(`/occasions${qs ? `?${qs}` : ''}`)
      return
    }
    if (stepId === 2) {
      router.push(`/templates${qs ? `?${qs}` : ''}`)
      return
    }
    if (stepId === 3) {
      setCurrentStep(2)
      return
    }
    if (stepId === 4) {
      setCurrentStep(3)
    }
  }

  const handleDateChange = (isoDate: string) => {
    const date = new Date(`${isoDate}T00:00:00Z`)
    const weekDay = Number.isNaN(date.getTime()) ? '' : AR_WEEKDAYS[date.getUTCDay()] || ''
    const formatted = formatDateForInvitation(isoDate)
    const gregorian = formatGregorianDateLine(isoDate)
    const hijri = normalizeHijriSuffix(formatHijriDateLine(isoDate))
    const mergedDateLine = gregorian && hijri ? `${gregorian} م  |  ${hijri} هـ` : formatted
    setFormData((prev) => ({
      ...prev,
      date: isoDate,
      dateText: formatted,
      weddingDay: weekDay,
      fullDateLine: mergedDateLine,
    }))
  }

  const receptionTimeValue = formatSelectedTime12(
    formData.receptionHour,
    formData.receptionMinute,
    formData.receptionPeriod
  )
  const zaffaTimeValue = formatSelectedTime12(formData.zaffaHour, formData.zaffaMinute, formData.zaffaPeriod)
  const receptionTimeLine = formatTimeLine('الاستقبال', receptionTimeValue)
  const zaffaTimeLine = formatTimeLine('الزفة', zaffaTimeValue)

  useEffect(() => {
    const selectedPackage = parsePackageFromParams(packageGuests, packagePrice)
    if (selectedPackage) {
      setHasValidPackage(true)
      return
    }

    const packageFromSession = readPackageFromSessionStorage()
    if (packageFromSession) {
      const params = new URLSearchParams()
      params.set('packageGuests', String(packageFromSession.guests))
      params.set('packagePrice', String(packageFromSession.price))
      if (selectedOccasion) params.set('occasion', selectedOccasion)
      router.replace(`/templates/${templateId}?${params.toString()}`)
      return
    }

    router.replace('/packages')
  }, [packageGuests, packagePrice, router, selectedOccasion, templateId])

  useEffect(() => {
    if (!hasValidPackage) return
    const fetchTemplate = async () => {
      try {
        const docRef = doc(db, 'templates', templateId)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          setTemplate({
            id: docSnap.id,
            ...docSnap.data(),
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
            updatedAt: docSnap.data().updatedAt?.toDate() || new Date(),
          } as Template)
        }
      } catch (error) {
        console.error('Error fetching template:', error)
      } finally {
        setLoading(false)
      }
    }

    if (templateId) {
      fetchTemplate()
    }
  }, [hasValidPackage, templateId])

  useEffect(() => {
    if (!templateId) return
    try {
      const raw = window.sessionStorage.getItem(formDraftKey)
      if (!raw) return
      const saved = JSON.parse(raw)
      if (saved?.formData) {
        const savedForm = saved.formData as Record<string, any>
        const parsedReception = parseSavedTime(savedForm.receptionTime || '')
        const parsedZaffa = parseSavedTime(savedForm.zaffaTime || '')
        setFormData((prev) => ({
          ...prev,
          ...savedForm,
          receptionHour: savedForm.receptionHour || parsedReception.hour,
          receptionMinute: savedForm.receptionMinute || parsedReception.minute,
          receptionPeriod: savedForm.receptionPeriod || parsedReception.period,
          zaffaHour: savedForm.zaffaHour || parsedZaffa.hour,
          zaffaMinute: savedForm.zaffaMinute || parsedZaffa.minute,
          zaffaPeriod: savedForm.zaffaPeriod || parsedZaffa.period,
        }))
      }
      if (saved?.currentStep) {
        setCurrentStep(Math.max(1, Math.min(5, Number(saved.currentStep) || 1)) as StepId)
      }
    } catch (error) {
      console.error('Failed to restore invite form draft:', error)
    } finally {
      didHydrateDraftRef.current = true
    }
  }, [formDraftKey, templateId])

  useEffect(() => {
    if (!templateId) return
    try {
      window.sessionStorage.setItem(
        formDraftKey,
        JSON.stringify({
          formData,
          currentStep,
          updatedAt: new Date().toISOString(),
        })
      )
    } catch (error) {
      console.error('Failed to persist invite form draft:', error)
    }
  }, [currentStep, formData, formDraftKey, templateId])

  useEffect(() => {
    if (!templateId || authLoading || !user || didLoadFirestoreDraftRef.current) return
    didLoadFirestoreDraftRef.current = true

    const loadRemoteDraft = async () => {
      try {
        const token = await user.getIdToken()
        const response = await fetch(`/api/user/invite-draft?templateId=${encodeURIComponent(templateId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json()
        if (!response.ok || !data?.draft) return

        const draft = data.draft as { currentStep?: number; formData?: Record<string, any>; updatedAt?: string }
        setFormData((prev) => ({ ...prev, ...(draft.formData || {}) }))
        if (draft.currentStep) {
          setCurrentStep(Math.max(1, Math.min(5, Number(draft.currentStep) || 1)) as StepId)
        }
      } catch (error) {
        console.error('Failed to load Firestore draft:', error)
      }
    }

    loadRemoteDraft()
  }, [authLoading, templateId, user])

  useEffect(() => {
    if (!templateId || authLoading || !user || !didHydrateDraftRef.current) return
    const timer = setTimeout(async () => {
      try {
        setAutoSaveState('saving')
        const token = await user.getIdToken()
        const response = await fetch('/api/user/invite-draft', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            templateId,
            currentStep,
            formData,
          }),
        })
        const data = await response.json()
        if (!response.ok) throw new Error(data?.error || 'Failed to auto-save')

        const storageKey = `bushara_active_invite_id:${templateId}`
        const existingInviteId =
          (typeof window !== 'undefined' ? window.sessionStorage.getItem(storageKey) : '') || ''
        const inviteDraftDocId =
          existingInviteId || `draft_${user.uid}_${templateId}_${Date.now().toString(36)}`
        const inviteRef = doc(db, 'invites', inviteDraftDocId)
        await setDoc(
          inviteRef,
          {
            ownerId: user.uid,
            designId: templateId,
            title:
              `دعوة ${formData.groomNameAr || ''} ${formData.brideNameAr || ''}`.trim() ||
              `دعوة ${template?.name || ''}`.trim() ||
              'دعوة جديدة',
            groomName: formData.groomNameAr || '',
            brideName: formData.brideNameAr || '',
            date: formData.date || '',
            time: receptionTimeLine || '',
            locationName: formData.hallLocation || '',
            locationMapUrl: '',
            packageId: packageGuests || '',
            packageGuests: Number(packageGuests || 0),
            packagePrice: Number(packagePrice || 0),
            selectedOccasion,
            status: 'draft',
            paymentStatus: 'unpaid',
            inviteLockedAfterPayment: false,
            updatedAt: new Date(),
          },
          { merge: true }
        )
        window.sessionStorage.setItem('bushara_current_invite_id', inviteDraftDocId)
        window.sessionStorage.setItem(storageKey, inviteDraftDocId)

        setAutoSaveState('saved')
        setLastSavedAt(data?.updatedAt || new Date().toISOString())
      } catch (error) {
        console.error('Auto-save failed:', error)
        setAutoSaveState('error')
      }
    }, 700)

    return () => clearTimeout(timer)
  }, [
    authLoading,
    currentStep,
    formData,
    packageGuests,
    packagePrice,
    receptionTimeLine,
    selectedOccasion,
    template?.name,
    templateId,
    user,
  ])

  useEffect(() => {
    if (!templateId || authLoading || !user) return
    const checkLockedInvite = async () => {
      try {
        const activeInviteId =
          (typeof window !== 'undefined'
            ? window.sessionStorage.getItem(`bushara_active_invite_id:${templateId}`) ||
              window.sessionStorage.getItem('bushara_current_invite_id')
            : '') || ''
        if (!activeInviteId) return

        const inviteSnap = await getDoc(doc(db, 'invites', activeInviteId))
        if (!inviteSnap.exists()) return
        const invite = inviteSnap.data() as any
        const isPaid =
          invite?.paymentStatus === 'paid' || invite?.status === 'paid' || invite?.inviteLockedAfterPayment === true
        if (!isPaid) return
        alert('هذه الدعوة مدفوعة ومقفلة، ولا يمكن تعديلها بعد الدفع.')
        router.replace(`/dashboard/invites/${activeInviteId}`)
      } catch (error) {
        console.error('Failed checking locked invite:', error)
      }
    }
    checkLockedInvite()
  }, [authLoading, router, templateId, user])

  const handleContinueToCheckout = () => {
    if (!hasValidPackage) {
      alert('يرجى اختيار باقة أولاً قبل إكمال الطلب.')
      router.push('/packages')
      return
    }

    const payload = {
      templateId,
      templateName: template?.name || '',
      templateType: template?.type || '',
      packageGuests,
      packagePrice,
      selectedOccasion,
      formData,
      createdAt: new Date().toISOString(),
    }
    window.sessionStorage.setItem('bushara_checkout_draft', JSON.stringify(payload))
    router.push('/checkout')
  }

  const getInputClass = (field: string, accent = 'gray') => {
    const base =
      'w-full rounded-xl px-4 py-3 outline-none transition-all bg-white'
    if (stepErrors[field]) {
      return `${base} border border-red-400 focus:ring-2 focus:ring-red-200`
    }
    if (accent === 'pink') {
      return `${base} border border-pink-200 focus:ring-2 focus:ring-pink-200`
    }
    if (accent === 'sky') {
      return `${base} border border-sky-200 focus:ring-2 focus:ring-sky-200`
    }
    if (accent === 'rose') {
      return `${base} border border-rose-200 focus:ring-2 focus:ring-rose-200`
    }
    return `${base} border border-gray-300 focus:ring-2 focus:ring-primary/25`
  }

  const renderReviewRow = (label: string, value: string) => (
    <div className="flex items-start justify-between gap-4 border-b border-gray-100 py-2.5 last:border-b-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-textDark text-left">{value || '-'}</span>
    </div>
  )

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center pt-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted">جاري التحميل...</p>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  if (!template) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center pt-32">
          <div className="text-center">
            <p className="text-muted mb-4">التصميم غير موجود</p>
            <Link href="/templates" className="text-primary hover:text-accent">
              العودة للقائمة
            </Link>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen">
        <div className="container mx-auto max-w-5xl">
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 text-muted hover:text-primary transition-colors mb-6"
          >
            <ArrowLeft size={20} />
            العودة للقائمة
          </Link>

          <div className="mb-6">
            <StepperHeader
              steps={steps}
              activeStep={currentStep <= 2 ? 3 : currentStep === 3 ? 4 : currentStep === 4 ? 4 : 5}
              onStepClick={handleStepperClick}
              progressHint={currentStep >= 4 ? 'باقي خطوة واحدة لإكمال دعوتك ✨' : 'خطواتك محفوظة تلقائيًا'}
            />
            <div className="mt-3 text-xs text-muted">
              {!user
                ? 'الحفظ التلقائي على الجهاز مفعل. سجّل الدخول للحفظ السحابي عبر Firestore.'
                : autoSaveState === 'saving'
                ? 'جاري الحفظ التلقائي...'
                : autoSaveState === 'saved'
                ? `تم الحفظ تلقائيًا${lastSavedAt ? ` (${new Date(lastSavedAt).toLocaleTimeString('ar-SA')})` : ''}`
                : autoSaveState === 'error'
                ? 'تعذر الحفظ السحابي الآن، سيتم المحاولة تلقائيًا.'
                : 'الحفظ التلقائي مفعل'}
            </div>
          </div>

          <div key={currentStep} className="step-enter rounded-3xl bg-white p-5 md:p-8 shadow-md border border-gray-100">
            {currentStep === 1 && (
              <div className="space-y-5">
                <h2 className="text-2xl md:text-3xl font-bold">اختيار النموذج</h2>
                <p className="text-muted">تأكيد النموذج المختار قبل إدخال البيانات.</p>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 md:p-5 flex flex-col md:flex-row gap-4">
                  <div className="w-full md:w-44 aspect-[9/16] rounded-xl overflow-hidden bg-white border border-gray-200">
                    {template.assets?.thumbUrl || template.assets?.backgroundUrl ? (
                      <img
                        src={template.assets?.thumbUrl || template.assets?.backgroundUrl}
                        alt={template.name}
                        className="w-full h-full object-cover"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 space-y-2">
                    <h3 className="text-xl font-bold">{template.name}</h3>
                    <p className="text-sm text-muted">النوع: {template.type}</p>
                    {(packageGuests || packagePrice || selectedOccasion) && (
                      <p className="text-sm text-primary">
                        {selectedOccasion && `المناسبة: ${selectedOccasion} - `}
                        {packageGuests && `الباقة: ${packageGuests} ضيف - `}
                        {packagePrice && `السعر: ${packagePrice} ريال`}
                      </p>
                    )}
                    <Link
                      href="/templates"
                      className="inline-flex mt-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                    >
                      تغيير النموذج
                    </Link>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-6">
                <h2 className="text-2xl md:text-3xl font-bold">بيانات العروس والعريس</h2>
                <div className="rounded-2xl border border-pink-200 bg-pink-50 p-4 md:p-5 shadow-sm">
                  <h3 className="text-xl font-bold text-pink-700 mb-4">💍 بيانات العروس</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-2 font-semibold">اسم العروس (الاسم الأول فقط) *</label>
                      <input
                        type="text"
                        value={formData.brideNameAr}
                        onChange={(e) => updateField('brideNameAr', e.target.value)}
                        className={getInputClass('brideNameAr', 'pink')}
                      />
                      {stepErrors.brideNameAr && <p className="text-xs text-red-600 mt-1">{stepErrors.brideNameAr}</p>}
                    </div>
                    <div>
                      <label className="block mb-2 font-semibold">اسم اب العروس والعائله *</label>
                      <input
                        type="text"
                        value={formData.fatherOfBride}
                        onChange={(e) => updateField('fatherOfBride', e.target.value)}
                        className={getInputClass('fatherOfBride', 'pink')}
                      />
                      {stepErrors.fatherOfBride && <p className="text-xs text-red-600 mt-1">{stepErrors.fatherOfBride}</p>}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block mb-2 font-semibold">اسم ام العروس كاملا *</label>
                      <input
                        type="text"
                        value={formData.motherOfBride}
                        onChange={(e) => updateField('motherOfBride', e.target.value)}
                        className={getInputClass('motherOfBride', 'pink')}
                      />
                      {stepErrors.motherOfBride && <p className="text-xs text-red-600 mt-1">{stepErrors.motherOfBride}</p>}
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 md:p-5 shadow-sm">
                  <h3 className="text-xl font-bold text-sky-700 mb-4">🤵 بيانات العريس</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-2 font-semibold">اسم العريس (الاسم الأول فقط) *</label>
                      <input
                        type="text"
                        value={formData.groomNameAr}
                        onChange={(e) => updateField('groomNameAr', e.target.value)}
                        className={getInputClass('groomNameAr', 'sky')}
                      />
                      {stepErrors.groomNameAr && <p className="text-xs text-red-600 mt-1">{stepErrors.groomNameAr}</p>}
                    </div>
                    <div>
                      <label className="block mb-2 font-semibold">اسم اب العريس والعائله *</label>
                      <input
                        type="text"
                        value={formData.fatherOfGroom}
                        onChange={(e) => updateField('fatherOfGroom', e.target.value)}
                        className={getInputClass('fatherOfGroom', 'sky')}
                      />
                      {stepErrors.fatherOfGroom && <p className="text-xs text-red-600 mt-1">{stepErrors.fatherOfGroom}</p>}
                    </div>
                    <div className="md:col-span-2">
                      <label className="block mb-2 font-semibold">اسم ام العريس كاملا *</label>
                      <input
                        type="text"
                        value={formData.motherOfGroom}
                        onChange={(e) => updateField('motherOfGroom', e.target.value)}
                        className={getInputClass('motherOfGroom', 'sky')}
                      />
                      {stepErrors.motherOfGroom && <p className="text-xs text-red-600 mt-1">{stepErrors.motherOfGroom}</p>}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-6">
                <h2 className="text-2xl md:text-3xl font-bold">تفاصيل المناسبة</h2>
                <div className="rounded-2xl border border-rose-200 bg-gradient-to-br from-rose-50 via-white to-pink-50 p-4 md:p-5 shadow-sm">
                  <h3 className="text-xl font-bold text-rose-700 mb-4">📅 تفاصيل المناسبة</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block mb-2 font-semibold">التاريخ *</label>
                      <input
                        type="date"
                        value={formData.date}
                        onChange={(e) => handleDateChange(e.target.value)}
                        className={getInputClass('date', 'rose')}
                      />
                      {stepErrors.date && <p className="text-xs text-red-600 mt-1">{stepErrors.date}</p>}
                    </div>
                    <div>
                      <label className="block mb-2 font-semibold">يوم العرس</label>
                      <select
                        value={formData.weddingDay}
                        onChange={(e) => updateField('weddingDay', e.target.value)}
                        className={getInputClass('weddingDay', 'rose')}
                      >
                        <option value="">اختر اليوم</option>
                        {AR_WEEKDAYS.map((day) => (
                          <option key={day} value={day}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="block mb-2 font-semibold">سطر التاريخ ميلادي وهجري</label>
                      <input
                        type="text"
                        value={formData.fullDateLine}
                        onChange={(e) => updateField('fullDateLine', e.target.value)}
                        className={getInputClass('fullDateLine', 'rose')}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block mb-2 font-semibold">اسم القاعة{template.type !== 'B' ? ' *' : ''}</label>
                      <input
                        type="text"
                        value={formData.hallLocation}
                        onChange={(e) => updateField('hallLocation', e.target.value)}
                        className={getInputClass('hallLocation', 'rose')}
                      />
                      {stepErrors.hallLocation && <p className="text-xs text-red-600 mt-1">{stepErrors.hallLocation}</p>}
                    </div>

                    {template.type !== 'B' && (
                      <>
                        <div>
                          <label className="block mb-2 font-semibold">وقت الاستقبال *</label>
                          <div className="grid grid-cols-3 gap-2">
                            <select
                              value={formData.receptionHour}
                              onChange={(e) => updateField('receptionHour', e.target.value)}
                              className={getInputClass('receptionHour', 'rose')}
                            >
                              <option value="">الساعة</option>
                              {HOUR_OPTIONS.map((hour) => (
                                <option key={`r-hour-${hour}`} value={hour}>{hour}</option>
                              ))}
                            </select>
                            <select
                              value={formData.receptionMinute}
                              onChange={(e) => updateField('receptionMinute', (e.target.value as '00' | '30') || '00')}
                              className={getInputClass('receptionMinute', 'rose')}
                            >
                              {MINUTE_OPTIONS.map((minute) => (
                                <option key={`r-minute-${minute}`} value={minute}>{minute}</option>
                              ))}
                            </select>
                            <select
                              value={formData.receptionPeriod}
                              onChange={(e) => updateField('receptionPeriod', (e.target.value as TimePeriod) || 'PM')}
                              className={getInputClass('receptionPeriod', 'rose')}
                            >
                              {PERIOD_OPTIONS.map((period) => (
                                <option key={`r-period-${period.value}`} value={period.value}>{period.label}</option>
                              ))}
                            </select>
                          </div>
                          {stepErrors.receptionHour && <p className="text-xs text-red-600 mt-1">{stepErrors.receptionHour}</p>}
                        </div>

                        <div>
                          <label className="block mb-2 font-semibold">وقت الزفة *</label>
                          <div className="grid grid-cols-3 gap-2">
                            <select
                              value={formData.zaffaHour}
                              onChange={(e) => updateField('zaffaHour', e.target.value)}
                              className={getInputClass('zaffaHour', 'rose')}
                            >
                              <option value="">الساعة</option>
                              {HOUR_OPTIONS.map((hour) => (
                                <option key={`z-hour-${hour}`} value={hour}>{hour}</option>
                              ))}
                            </select>
                            <select
                              value={formData.zaffaMinute}
                              onChange={(e) => updateField('zaffaMinute', (e.target.value as '00' | '30') || '00')}
                              className={getInputClass('zaffaMinute', 'rose')}
                            >
                              {MINUTE_OPTIONS.map((minute) => (
                                <option key={`z-minute-${minute}`} value={minute}>{minute}</option>
                              ))}
                            </select>
                            <select
                              value={formData.zaffaPeriod}
                              onChange={(e) => updateField('zaffaPeriod', (e.target.value as TimePeriod) || 'PM')}
                              className={getInputClass('zaffaPeriod', 'rose')}
                            >
                              {PERIOD_OPTIONS.map((period) => (
                                <option key={`z-period-${period.value}`} value={period.value}>{period.label}</option>
                              ))}
                            </select>
                          </div>
                          {stepErrors.zaffaHour && <p className="text-xs text-red-600 mt-1">{stepErrors.zaffaHour}</p>}
                        </div>
                      </>
                    )}

                    <label className="flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3">
                      <input
                        type="checkbox"
                        checked={formData.noKids}
                        onChange={(e) => updateField('noKids', e.target.checked)}
                      />
                      <span className="text-sm font-medium">ممنوع اصطحاب الاطفال</span>
                    </label>
                    <label className="flex items-center gap-2 rounded-xl border border-rose-200 bg-white px-4 py-3">
                      <input
                        type="checkbox"
                        checked={formData.noPhotography}
                        onChange={(e) => updateField('noPhotography', e.target.checked)}
                      />
                      <span className="text-sm font-medium">ممنوع التصوير</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 4 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-textDark">مراجعة بيانات الدعوة</h2>
                  <p className="text-sm md:text-base text-muted">تأكد من صحة المعلومات قبل الاعتماد النهائي ✨</p>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-5 md:p-8 shadow-sm">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <div className="space-y-6">
                      <h3 className="text-lg font-bold text-primary">أسماء العائلة</h3>
                      <div className="rounded-2xl border border-gray-100 bg-[#fcfbff] p-4 md:p-5 space-y-4">
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500">العروس</p>
                          <p className="text-2xl md:text-3xl font-bold text-textDark">{formData.brideNameAr || '-'}</p>
                        </div>
                        <div className="h-px bg-gray-200" />
                        <div className="space-y-1">
                          <p className="text-xs text-gray-500">العريس</p>
                          <p className="text-2xl md:text-3xl font-bold text-textDark">{formData.groomNameAr || '-'}</p>
                        </div>
                      </div>
                      <div className="rounded-2xl border border-gray-100 bg-[#fffefd] p-4 md:p-5">
                        {renderReviewRow('أب العروس والعائلة', formData.fatherOfBride)}
                        {renderReviewRow('أم العروس', formData.motherOfBride)}
                        {renderReviewRow('أب العريس والعائلة', formData.fatherOfGroom)}
                        {renderReviewRow('أم العريس', formData.motherOfGroom)}
                      </div>
                    </div>

                    <div className="space-y-6 lg:border-s lg:border-gray-100 lg:ps-8">
                      <h3 className="text-lg font-bold text-primary">تفاصيل المناسبة</h3>
                      <div className="rounded-2xl border border-gray-100 bg-[#fffefd] p-4 md:p-5">
                        {renderReviewRow('اليوم', formData.weddingDay)}
                        {renderReviewRow('التاريخ', formData.fullDateLine || formData.date)}
                        {renderReviewRow('اسم القاعة', formData.hallLocation)}
                        {template.type !== 'B' && renderReviewRow('وقت الاستقبال', receptionTimeValue)}
                        {template.type !== 'B' && renderReviewRow('وقت الزفة', zaffaTimeValue)}
                        {renderReviewRow('ممنوع اصطحاب الأطفال', formData.noKids ? 'نعم' : 'لا')}
                        {renderReviewRow('ممنوع التصوير', formData.noPhotography ? 'نعم' : 'لا')}
                      </div>

                      {(template.assets?.thumbUrl || template.assets?.backgroundUrl) && (
                        <div className="rounded-2xl border border-gray-100 bg-[#faf9ff] p-4 md:p-5">
                          <p className="mb-3 text-xs text-gray-500">معاينة مصغرة للتصميم المختار</p>
                          <div className="mx-auto w-40 max-w-full aspect-[9/16] overflow-hidden rounded-xl border border-gray-200 bg-white">
                            <img
                              src={template.assets?.thumbUrl || template.assets?.backgroundUrl}
                              alt={template.name}
                              className="h-full w-full object-cover"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {currentStep === 5 && (
              <div className="space-y-6">
                <h2 className="text-2xl md:text-3xl font-bold">الدفع</h2>
                <div className="rounded-2xl border border-primary/20 bg-primarySoft p-4 md:p-5">
                  <h3 className="text-lg font-bold mb-2">الانتقال إلى صفحة الفاتورة</h3>
                  <p className="text-sm text-muted">
                    سيتم نقل بياناتك كما هي إلى صفحة الفاتورة والدفع.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleContinueToCheckout}
                  className="w-full rounded-xl bg-primary py-3.5 font-semibold text-white hover:bg-accent transition-colors"
                >
                  متابعة إلى صفحة الدفع
                </button>
              </div>
            )}

            {currentStep === 4 && (
              <p className="mt-8 text-sm text-muted">يمكنك مراجعة المعلومات والتأكد منها قبل الاعتماد النهائي.</p>
            )}

            <div className="mt-4">
              {currentStep < 5 ? (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={goToPreviousStep}
                    disabled={currentStep === 1 || stepLoading}
                    className="h-12 w-full rounded-xl border border-gray-300 bg-white px-5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    السابق
                  </button>
                  <button
                    type="button"
                    onClick={goToNextStep}
                    disabled={stepLoading}
                    className="h-12 w-full rounded-xl bg-primary px-6 font-semibold text-white hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {stepLoading ? 'جاري الانتقال...' : 'التالي'}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={goToPreviousStep}
                  disabled={currentStep === 1 || stepLoading}
                  className="h-12 w-full sm:w-auto rounded-xl border border-gray-300 bg-white px-5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  السابق
                </button>
              )}
            </div>
          </div>
        </div>
      </main>
      <style jsx>{`
        .step-enter {
          animation: stepFadeSlide 260ms ease-out;
        }
        @keyframes stepFadeSlide {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      <Footer />
    </>
  )
}

