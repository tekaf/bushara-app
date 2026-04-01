'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { addDoc, collection, doc, getDoc, setDoc } from 'firebase/firestore'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import { useAuth } from '@/lib/auth/context'
import { db } from '@/lib/firebase/config'
import { INVITE_WORKFLOW_STATUS, canProceedAfterWorkshop } from '@/lib/invitations/workflow'

type Invitee = {
  id: string
  name: string
  phoneLocal: string
  phoneE164: string
  status: 'pending' | 'sent' | 'accepted' | 'declined'
  assignedToLabel?: string
  rsvpToken?: string
}

type CheckoutDraft = {
  templateId: string
  templateName?: string
  templateType?: string
  packageGuests: string
  packagePrice: string
  selectedOccasion: string
  formData?: Record<string, any>
}

type AnalyzeResult = {
  parsed: Array<{ phoneLocal: string; phoneE164: string; name: string }>
  invalid: Array<{ line: string; reason: string }>
  found: number
  cleaned: number
  duplicates: number
}

type TabKey = 'quick_add' | 'list' | 'review'

const ACTIVE_INVITE_ID_PREFIX = 'bushara_active_invite_id'
const QUICK_ADD_DRAFT_PREFIX = 'bushara_guest_quickadd_draft'

function GuestsPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [draft, setDraft] = useState<CheckoutDraft | null>(null)
  const [inviteId, setInviteId] = useState('')
  const [invitees, setInvitees] = useState<Invitee[]>([])
  const [quota, setQuota] = useState({ total: 0, used: 0, remaining: 0 })
  const [syncState, setSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [quickText, setQuickText] = useState('')
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResult | null>(null)
  const [tab, setTab] = useState<TabKey>('quick_add')
  const [loadingGuests, setLoadingGuests] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'sent' | 'accepted' | 'declined'>('all')
  const [editingId, setEditingId] = useState('')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [toast, setToast] = useState<{ show: boolean; text: string; kind: 'success' | 'error' }>({
    show: false,
    text: '',
    kind: 'success',
  })
  const [analysisCounters, setAnalysisCounters] = useState({ found: 0, cleaned: 0, duplicates: 0, invalid: 0 })
  const [showSparkle, setShowSparkle] = useState(false)
  const [canAccess, setCanAccess] = useState(false)

  const packageLimit = useMemo(() => Number(draft?.packageGuests || 0), [draft?.packageGuests])
  const usedCount = quota.used || invitees.length
  const remainingCount = Math.max(0, (quota.total || packageLimit || 0) - usedCount)
  const inviteStorageKey = `${ACTIVE_INVITE_ID_PREFIX}:${draft?.templateId || 'default'}`
  const quickDraftKey = `${QUICK_ADD_DRAFT_PREFIX}:${draft?.templateId || 'default'}`

  const filteredInvitees = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = invitees.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false
      if (!q) return true
      return row.name.toLowerCase().includes(q) || row.phoneLocal.includes(q)
    })
    const statusPriority: Record<Invitee['status'], number> = {
      pending: 0,
      sent: 1,
      accepted: 2,
      declined: 3,
    }
    return filtered.sort((a, b) => {
      const priorityDiff = statusPriority[a.status] - statusPriority[b.status]
      if (priorityDiff !== 0) return priorityDiff
      return a.phoneLocal.localeCompare(b.phoneLocal, 'ar')
    })
  }, [invitees, search, statusFilter])

  const sendEligibleCount = useMemo(
    () =>
      invitees.filter((row) => {
        const phone = String(row.phoneE164 || '').trim()
        return Boolean(phone) && row.status !== 'sent'
      }).length,
    [invitees]
  )
  const guestStatusStats = useMemo(() => {
    const total = invitees.length
    const accepted = invitees.filter((row) => row.status === 'accepted').length
    const declined = invitees.filter((row) => row.status === 'declined').length
    const waiting = invitees.filter((row) => row.status !== 'accepted' && row.status !== 'declined').length
    const toPercent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0)
    return {
      total,
      accepted,
      declined,
      waiting,
      acceptedPct: toPercent(accepted),
      declinedPct: toPercent(declined),
      waitingPct: toPercent(waiting),
    }
  }, [invitees])
  const latestAddedGuest = useMemo(() => {
    if (!invitees.length) return null
    return invitees[0]
  }, [invitees])
  const statusDonutStyle = useMemo(() => {
    const acceptedDeg = guestStatusStats.acceptedPct * 3.6
    const declinedDeg = guestStatusStats.declinedPct * 3.6
    const waitingDeg = guestStatusStats.waitingPct * 3.6
    return {
      background: `conic-gradient(
        #9fdcc0 0deg ${acceptedDeg}deg,
        #f6c4c4 ${acceptedDeg}deg ${acceptedDeg + declinedDeg}deg,
        #f6e0a8 ${acceptedDeg + declinedDeg}deg ${acceptedDeg + declinedDeg + waitingDeg}deg,
        #edf2ef ${acceptedDeg + declinedDeg + waitingDeg}deg 360deg
      )`,
    }
  }, [guestStatusStats.acceptedPct, guestStatusStats.declinedPct, guestStatusStats.waitingPct])

  function normalizeArabicDigits(value: string): string {
    const arabicNums = '٠١٢٣٤٥٦٧٨٩'
    return value.replace(/[٠-٩]/g, (d) => String(arabicNums.indexOf(d)))
  }

  function normalizePhone(raw: string): { ok: true; local: string; e164: string } | { ok: false; reason: string } {
    const normalized = normalizeArabicDigits(raw).replace(/[^\d+]/g, '')
    if (!normalized) return { ok: false, reason: 'لا يوجد رقم' }

    let candidate = normalized
    if (candidate.startsWith('00966')) candidate = `+${candidate.slice(2)}`
    if (candidate.startsWith('966')) candidate = `+${candidate}`

    if (/^5\d{8}$/.test(candidate)) {
      candidate = `0${candidate}`
    }
    if (/^05\d{8}$/.test(candidate)) {
      return { ok: true, local: candidate, e164: `+966${candidate.slice(1)}` }
    }
    if (/^\+9665\d{8}$/.test(candidate)) {
      return { ok: true, local: `0${candidate.slice(4)}`, e164: candidate }
    }

    return { ok: false, reason: 'رقم غير مكتمل أو غير صحيح' }
  }

  function parseQuickText(input: string): AnalyzeResult {
    const lines = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    const parsed: Array<{ phoneLocal: string; phoneE164: string; name: string }> = []
    const invalid: Array<{ line: string; reason: string }> = []
    const seen = new Set<string>()
    let duplicates = 0

    for (const line of lines) {
      const tokens = line.split(/\s+/).filter(Boolean)
      const phoneToken = tokens.find((t) => /[\d+]/.test(t)) || ''
      const nameTokens = tokens.filter((t) => t !== phoneToken)
      const name = nameTokens.join(' ').trim()
      const normalized = normalizePhone(phoneToken)
      if (!normalized.ok) {
        invalid.push({ line, reason: normalized.reason })
        continue
      }
      if (seen.has(normalized.e164)) {
        duplicates += 1
        continue
      }
      seen.add(normalized.e164)
      parsed.push({
        phoneLocal: normalized.local,
        phoneE164: normalized.e164,
        name,
      })
    }

    return {
      parsed,
      invalid,
      found: lines.length,
      cleaned: parsed.length,
      duplicates,
    }
  }

  async function withAuthHeaders() {
    if (!user) throw new Error('يرجى تسجيل الدخول أولاً')
    const token = await user.getIdToken()
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  }

  async function loadGuests(targetInviteId: string) {
    if (!targetInviteId) return
    setLoadingGuests(true)
    try {
      const headers = await withAuthHeaders()
      const response = await fetch(`/api/user/invitations/${targetInviteId}/guests`, { headers })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'تعذر تحميل المدعوين')
      const rows = (Array.isArray(data?.guests) ? data.guests : []) as any[]
      setInvitees(
        rows.map((row) => ({
          id: String(row.id),
          name: String(row.name || ''),
          phoneLocal: String(row.phoneLocal || ''),
          phoneE164: String(row.phoneE164 || ''),
          status: (row.status || 'pending') as Invitee['status'],
          assignedToLabel: row.assignedToLabel || '',
          rsvpToken: row.rsvpToken || '',
        }))
      )
      setQuota({
        total: Number(data?.quota?.total || packageLimit || 0),
        used: Number(data?.quota?.used || 0),
        remaining: Number(data?.quota?.remaining || 0),
      })
    } catch (error: any) {
      setToast({ show: true, text: error?.message || 'تعذر تحميل المدعوين', kind: 'error' })
    } finally {
      setLoadingGuests(false)
    }
  }

  async function ensureInviteApproved(targetInviteId: string) {
    const inviteSnap = await getDoc(doc(db, 'invites', targetInviteId))
    if (!inviteSnap.exists()) throw new Error('الدعوة غير موجودة')
    const invite = inviteSnap.data() as any
    const workflowStatus = String(invite?.workflowStatus || '')
    if (!workflowStatus) {
      const legacyPaid =
        invite?.paymentStatus === 'paid' || invite?.status === 'paid' || invite?.inviteLockedAfterPayment === true
      if (legacyPaid) return true
    }
    if (canProceedAfterWorkshop(workflowStatus)) return true
    router.replace(`/dashboard/invites/${encodeURIComponent(targetInviteId)}/workshop-status`)
    return false
  }

  useEffect(() => {
    const templateIdFromQuery = searchParams.get('templateId') || ''
    const inviteIdFromQuery = searchParams.get('invId') || ''
    const paymentRaw = window.sessionStorage.getItem('bushara_payment_status')
    const checkoutRaw = window.sessionStorage.getItem('bushara_checkout_draft')

    // Dashboard/direct access by invite id should not depend on checkout session.
    if (inviteIdFromQuery) {
      const loadFromInvite = async () => {
        try {
          const inviteSnap = await getDoc(doc(db, 'invites', inviteIdFromQuery))
          if (!inviteSnap.exists()) {
            router.replace('/dashboard/guests')
            return
          }
          const invite = inviteSnap.data() as any
          setDraft({
            templateId: String(invite?.designId || 'manual'),
            templateName: String(invite?.title || ''),
            templateType: '',
            packageGuests: String(invite?.packageGuests || invite?.guestLimit || 0),
            packagePrice: String(invite?.packagePrice || 0),
            selectedOccasion: String(invite?.selectedOccasion || invite?.occasionType || ''),
            formData: {},
          })
          setCanAccess(true)
        } catch {
          router.replace('/dashboard/guests')
        }
      }
      loadFromInvite()
      return
    }

    if (!paymentRaw || !checkoutRaw) {
      router.replace('/dashboard/guests')
      return
    }

    try {
      const payment = JSON.parse(paymentRaw) as { templateId?: string }
      const checkout = JSON.parse(checkoutRaw) as CheckoutDraft
      if (!checkout?.templateId) {
        router.replace('/checkout')
        return
      }
      if (templateIdFromQuery && checkout.templateId !== templateIdFromQuery) {
        router.replace('/checkout')
        return
      }
      if (payment?.templateId && payment.templateId !== checkout.templateId) {
        router.replace('/checkout')
        return
      }
      setDraft(checkout)
      setCanAccess(true)
    } catch {
      router.replace('/checkout')
    }
  }, [router, searchParams])

  useEffect(() => {
    if (!draft?.templateId || authLoading) return
    if (!user) {
      router.replace('/login?next=/guests')
      return
    }

    const ensureInvite = async () => {
      const inviteIdFromQuery = searchParams.get('invId') || ''
      const currentInviteId = window.sessionStorage.getItem('bushara_current_invite_id') || ''
      const savedInviteId = inviteIdFromQuery || window.sessionStorage.getItem(inviteStorageKey) || currentInviteId
      if (savedInviteId) {
        const approved = await ensureInviteApproved(savedInviteId)
        if (!approved) return
        window.sessionStorage.setItem(inviteStorageKey, savedInviteId)
        setInviteId(savedInviteId)
        await loadGuests(savedInviteId)
        return
      }

      try {
        setSyncState('saving')
        const form = draft.formData || {}
        const title = form?.groomNameAr && form?.brideNameAr ? `دعوة ${form.groomNameAr} و ${form.brideNameAr}` : 'دعوة جديدة'
        const created = await addDoc(collection(db, 'invites'), {
          ownerId: user.uid,
          title,
          groomName: form?.groomNameAr || '',
          brideName: form?.brideNameAr || '',
          date: form?.date || '',
          time: form?.receptionTime || '',
          locationName: form?.hallLocation || '',
          locationMapUrl: '',
          designId: draft.templateId,
          packageId: String(draft.packageGuests || '50'),
          packageGuests: Number(draft.packageGuests || 0),
          packagePrice: Number(draft.packagePrice || 0),
          guestLimit: Number(draft.packageGuests || 0),
          status: 'paid',
          paymentStatus: 'paid',
          inviteLockedAfterPayment: true,
          paidAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        window.sessionStorage.setItem(inviteStorageKey, created.id)
        await setDoc(
          doc(db, 'invites', created.id),
          {
            workflowStatus: INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT,
          },
          { merge: true }
        )
        const approved = await ensureInviteApproved(created.id)
        if (!approved) return
        setInviteId(created.id)
        setSyncState('saved')
        await loadGuests(created.id)
      } catch (error) {
        setSyncState('error')
        setToast({ show: true, text: 'تعذر إنشاء سجل الدعوة', kind: 'error' })
      }
    }

    ensureInvite()
  }, [authLoading, draft, inviteStorageKey, packageLimit, router, searchParams, user])

  useEffect(() => {
    if (!draft?.templateId) return
    try {
      const raw = window.localStorage.getItem(quickDraftKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as { text?: string }
      if (typeof parsed?.text === 'string') {
        setQuickText(parsed.text)
      }
    } catch {
      // ignore invalid local draft
    }
  }, [draft?.templateId, quickDraftKey])

  useEffect(() => {
    if (!canAccess || !draft?.templateId) return
    window.localStorage.setItem(
      quickDraftKey,
      JSON.stringify({
        text: quickText,
        updatedAt: new Date().toISOString(),
      })
    )
  }, [canAccess, draft?.templateId, quickDraftKey, quickText])

  useEffect(() => {
    if (!toast.show) return
    const timer = setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2600)
    return () => clearTimeout(timer)
  }, [toast.show])

  const handleAnalyzeOnly = () => {
    const result = parseQuickText(quickText)
    setAnalyzeResult(result)
    setAnalysisCounters({ found: 0, cleaned: 0, duplicates: 0, invalid: 0 })

    const steps: Array<keyof typeof analysisCounters> = ['found', 'cleaned', 'duplicates', 'invalid']
    steps.forEach((step, idx) => {
      setTimeout(() => {
        setAnalysisCounters((prev) => ({
          ...prev,
          [step]:
            step === 'found'
              ? result.found
              : step === 'cleaned'
              ? result.cleaned
              : step === 'duplicates'
              ? result.duplicates
              : result.invalid.length,
        }))
      }, 180 * (idx + 1))
    })
  }

  const handleAnalyzeAndSave = async () => {
    if (!inviteId) {
      setToast({
        show: true,
        text: 'لم يتم تجهيز معرف الدعوة بعد. انتظر ثوانٍ ثم حاول مرة أخرى.',
        kind: 'error',
      })
      return
    }
    const result = parseQuickText(quickText)
    setAnalyzeResult(result)
    setAnalysisCounters({
      found: result.found,
      cleaned: result.cleaned,
      duplicates: result.duplicates,
      invalid: result.invalid.length,
    })
    if (result.parsed.length === 0) {
      setToast({ show: true, text: 'لا توجد أرقام صالحة للحفظ', kind: 'error' })
      return
    }
    setSyncState('saving')
    try {
      const headers = await withAuthHeaders()
      const response = await fetch(`/api/user/invitations/${inviteId}/guests`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ guests: result.parsed }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'تعذر حفظ المدعوين')
      await loadGuests(inviteId)
      setTab('list')
      setSyncState('saved')
      setShowSparkle(true)
      setTimeout(() => setShowSparkle(false), 1400)
      setToast({
        show: true,
        text:
          data?.added > 0
            ? `تم الحفظ ✓ أضيف ${data?.added || 0}، وتخطي ${data?.skipped || 0}، والإجمالي الآن ${data?.totalAfter ?? '-'} من ${data?.limit ?? '-'}`
            : `لم تتم إضافة مدعوين جدد. ${data?.message || 'جميع الأرقام موجودة مسبقًا.'}`,
        kind: 'success',
      })
    } catch (error: any) {
      setSyncState('error')
      setToast({ show: true, text: error?.message || 'فشل الحفظ', kind: 'error' })
    }
  }

  const handleStartEdit = (row: Invitee) => {
    setEditingId(row.id)
    setEditName(row.name || '')
    setEditPhone(row.phoneLocal || '')
  }

  const handleSaveEdit = async () => {
    if (!inviteId || !editingId) return
    const normalized = normalizePhone(editPhone)
    if (!normalized.ok) {
      setToast({ show: true, text: normalized.reason, kind: 'error' })
      return
    }
    try {
      const headers = await withAuthHeaders()
      const response = await fetch(`/api/user/invitations/${inviteId}/guests/${editingId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          name: editName.trim(),
          phoneLocal: normalized.local,
          phoneE164: normalized.e164,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'تعذر تعديل المدعو')
      setEditingId('')
      await loadGuests(inviteId)
      setToast({ show: true, text: 'تم تعديل المدعو', kind: 'success' })
    } catch (error: any) {
      setToast({ show: true, text: error?.message || 'فشل التعديل', kind: 'error' })
    }
  }

  const handleDelete = async (guestId: string) => {
    if (!inviteId) return
    try {
      const headers = await withAuthHeaders()
      const response = await fetch(`/api/user/invitations/${inviteId}/guests/${guestId}`, {
        method: 'DELETE',
        headers,
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data?.error || 'تعذر حذف المدعو')
      await loadGuests(inviteId)
      setToast({ show: true, text: 'تم حذف المدعو', kind: 'success' })
    } catch (error: any) {
      setToast({ show: true, text: error?.message || 'فشل الحذف', kind: 'error' })
    }
  }

  const goToWhatsAppSend = () => {
    alert('سيتم ربط الإرسال الفعلي عبر واتساب في الخطوة القادمة.')
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen px-4 pb-20 pt-32">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-6 rounded-2xl bg-white p-6 shadow-sm border border-gray-100">
            <h1 className="mb-1 text-3xl font-bold text-textDark">إدارة المدعوين</h1>
            <p className="text-sm font-medium leading-6 text-muted">
              هذه الصفحة مخصصة فقط لإدارة المدعوين ضمن الباقة، وتحضيرهم للإرسال.
            </p>
          </div>

          {!canAccess ? (
            <div className="rounded-2xl bg-white p-8 shadow text-center text-muted">
              جارٍ التحقق من حالة الدفع...
            </div>
          ) : (
            <div className="space-y-6">
              <motion.div
                whileHover={{ y: -3 }}
                className="rounded-2xl border border-primary/20 bg-primarySoft p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-bold text-lg">باقتك: {quota.total || packageLimit || 0} دعوة</p>
                    <p className="text-sm text-muted">المتبقي: {remainingCount}</p>
                    <p className="text-sm text-muted">جاهزون للإرسال: {sendEligibleCount}</p>
                  </div>
                  <div className="text-xs text-muted">
                    {syncState === 'saving'
                      ? 'جارٍ الحفظ...'
                      : syncState === 'saved'
                      ? 'تم الحفظ ✓'
                      : syncState === 'error'
                      ? 'فشل المزامنة'
                      : 'جاهز'}
                  </div>
                </div>
                <div className="mt-4 h-3 rounded-full bg-white/70 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        100,
                        Math.round(((usedCount || 0) / Math.max(1, quota.total || packageLimit || 1)) * 100)
                      )}%`,
                    }}
                  />
                </div>
              </motion.div>

              <div className="rounded-2xl bg-white p-3 shadow-sm border border-gray-100">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'quick_add' as TabKey, label: 'إضافة مدعويين' },
                    { key: 'list' as TabKey, label: 'قائمة المدعويين' },
                    { key: 'review' as TabKey, label: 'قائمة المدعويين والإرسال' },
                  ].map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setTab(item.key)}
                      className={`rounded-xl px-3 py-2 text-sm font-semibold transition-all ${
                        tab === item.key ? 'bg-primary text-white shadow-sm' : 'bg-gray-50 text-textDark hover:bg-gray-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                {tab === 'quick_add' && (
                  <motion.section
                    key="quick_add"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100"
                  >
                    <h2 className="text-xl font-bold mb-3">إضافة مدعويين</h2>
                    <p className="mb-3 text-sm text-muted leading-6">
                      أضف المدعويين بنفس أرقام هواتفهم من تطبيق الهاتف، والصقها هنا مع نسخ الأسماء أيضًا
                      أو كتابة الاسم الذي تريده بجانب الرقم.
                    </p>
                    <label className="block mb-2 text-sm font-semibold">الصق الأرقام هنا</label>
                    <textarea
                      value={quickText}
                      onChange={(e) => setQuickText(e.target.value)}
                      className="h-56 w-full rounded-xl border border-gray-300 p-4 outline-none focus:ring-2 focus:ring-primary/25"
                      placeholder={'0500000000 أحمد\n500000000\n+9665XXXXXXXX'}
                    />
                    <p className="mt-2 text-xs text-muted">تقدر تلصق: 0500000000 أحمد</p>
                    <p className="text-xs text-muted">أو: 500000000 ← النظام يضيف 0 تلقائياً</p>
                    <p className="mt-2 text-xs text-muted">
                      كل سطر يمثل مدعوًا واحدًا، وبعد التحليل يمكنك مراجعة النتائج قبل الحفظ النهائي.
                    </p>
                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleAnalyzeAndSave}
                        className="rounded-lg bg-primary px-5 py-3 font-semibold text-white hover:bg-accent transition-colors"
                      >
                        تحليل وحفظ
                      </button>
                      <button
                        type="button"
                        onClick={handleAnalyzeOnly}
                        className="rounded-lg border border-gray-300 px-5 py-3 font-semibold text-textDark hover:bg-gray-50 transition-colors"
                      >
                        تحليل فقط
                      </button>
                    </div>
                    <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div className="rounded-xl bg-gray-50 p-3">تم العثور على: <strong>{analysisCounters.found}</strong></div>
                      <div className="rounded-xl bg-gray-50 p-3">تم تنظيف: <strong>{analysisCounters.cleaned}</strong></div>
                      <div className="rounded-xl bg-gray-50 p-3">تم حذف مكرر: <strong>{analysisCounters.duplicates}</strong></div>
                      <div className="rounded-xl bg-gray-50 p-3">أخطاء: <strong>{analysisCounters.invalid}</strong></div>
                    </div>
                    {!!analyzeResult?.invalid.length && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                        <p className="font-semibold mb-2">يحتاج تعديل</p>
                        <div className="space-y-2 max-h-40 overflow-auto">
                          {analyzeResult.invalid.map((item, idx) => (
                            <div key={`${item.line}-${idx}`} className="rounded-md bg-white border border-amber-200 px-3 py-2 text-sm">
                              <p className="font-medium">{item.line}</p>
                              <p className="text-amber-700">{item.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </motion.section>
                )}

                {tab === 'list' && (
                  <motion.section
                    key="list"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100"
                  >
                    <div className="mb-4 flex flex-wrap gap-3 items-center justify-between">
                      <h2 className="text-xl font-bold">قائمة المدعويين</h2>
                      <span className="text-sm text-muted">{invitees.length} مدعو</span>
                    </div>
                    <p className="mb-4 text-sm text-muted leading-6">
                      هنا يمكنك ترتيب ومراجعة قائمة المدعويين، وتصفية الحالات، وتعديل بيانات أي مدعو قبل
                      الإرسال.
                    </p>
                    <div className="mb-4 rounded-xl border border-violet-100 bg-violet-50/60 p-4">
                      <div className="mb-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                        <div className="rounded-lg bg-white p-2 text-center">
                          <p className="text-xs text-muted">إجمالي المدعويين</p>
                          <p className="text-base font-bold text-textDark">{guestStatusStats.total}</p>
                        </div>
                        <div className="rounded-lg bg-white p-2 text-center">
                          <p className="text-xs text-muted">قبلوا</p>
                          <p className="text-base font-bold text-green-700">{guestStatusStats.accepted}</p>
                        </div>
                        <div className="rounded-lg bg-white p-2 text-center">
                          <p className="text-xs text-muted">رفضوا</p>
                          <p className="text-base font-bold text-red-700">{guestStatusStats.declined}</p>
                        </div>
                        <div className="rounded-lg bg-white p-2 text-center">
                          <p className="text-xs text-muted">بانتظار الرد</p>
                          <p className="text-base font-bold text-amber-700">{guestStatusStats.waiting}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 rounded-xl bg-white p-3 md:grid-cols-[160px_1fr] md:items-center">
                        <div className="mx-auto">
                          <div
                            className="relative h-32 w-32 rounded-full transition-all duration-500"
                            style={statusDonutStyle}
                          >
                            <div className="absolute inset-5 rounded-full bg-white shadow-inner" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="text-center leading-tight">
                                <p className="text-[10px] text-muted">الإجمالي</p>
                                <p className="text-lg font-bold text-textDark">{guestStatusStats.total}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="rounded-lg border border-violet-100 bg-violet-50/60 p-3">
                          <p className="text-sm text-indigo-900">آخر مدعو تمت إضافته:</p>
                          {latestAddedGuest ? (
                            <div className="mt-2 rounded-md bg-white p-2">
                              <p className="text-sm font-bold text-textDark">
                                {latestAddedGuest.name || 'بدون اسم'}
                              </p>
                              <p className="text-xs text-muted">{latestAddedGuest.phoneLocal}</p>
                            </div>
                          ) : (
                            <p className="mt-2 text-xs text-muted">
                              لا يوجد مدعوين مضافين حتى الآن.
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="بحث بالاسم أو الرقم"
                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 outline-none focus:ring-2 focus:ring-primary/25"
                      />
                      <div className="flex gap-2 flex-wrap">
                        {(['all', 'pending', 'accepted', 'declined'] as const).map((f) => (
                          <button
                            key={f}
                            type="button"
                            onClick={() => setStatusFilter(f)}
                            className={`rounded-lg px-3 py-2 text-sm font-medium ${
                              statusFilter === f ? 'bg-primary text-white' : 'bg-gray-100 hover:bg-gray-200'
                            }`}
                          >
                            {f === 'all'
                              ? 'الكل'
                              : f === 'pending'
                              ? 'بانتظار الرد'
                              : f === 'accepted'
                              ? 'قبلوا'
                              : 'رفضوا'}
                          </button>
                        ))}
                      </div>
                    </div>
                    {loadingGuests ? (
                      <p className="text-muted">جارٍ تحميل القائمة...</p>
                    ) : filteredInvitees.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-muted">
                        ابدأ بلصق أول رقم ✨
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {filteredInvitees.map((row) => (
                          <motion.div
                            whileHover={{ y: -2 }}
                            key={row.id}
                            className="rounded-xl border border-gray-200 p-3"
                          >
                            {editingId === row.id ? (
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                                <input
                                  value={editPhone}
                                  onChange={(e) => setEditPhone(e.target.value)}
                                  className="rounded-lg border border-gray-300 px-3 py-2"
                                />
                                <input
                                  value={editName}
                                  onChange={(e) => setEditName(e.target.value)}
                                  className="rounded-lg border border-gray-300 px-3 py-2"
                                  placeholder="اسم (اختياري)"
                                />
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    className="rounded-lg bg-primary px-3 py-2 text-white text-sm"
                                  >
                                    حفظ
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingId('')}
                                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                                  >
                                    إلغاء
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-semibold">{row.phoneLocal}</p>
                                  <p className="text-sm text-muted">{row.name || 'بدون اسم'}</p>
                                  <p className="text-xs text-muted">أضافه: {row.assignedToLabel || 'أنت'}</p>
                                  {row.rsvpToken && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const base = window.location.origin
                                        const link = `${base}/rsvp/${row.rsvpToken}?inv=${encodeURIComponent(inviteId)}`
                                        navigator.clipboard.writeText(link)
                                        setToast({ show: true, text: 'تم نسخ رابط RSVP', kind: 'success' })
                                      }}
                                      className="mt-1 text-xs text-primary underline"
                                    >
                                      نسخ رابط RSVP
                                    </button>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">
                                    {row.status === 'pending'
                                      ? 'بانتظار الرد'
                                      : row.status === 'sent'
                                      ? 'تم الإرسال'
                                      : row.status === 'accepted'
                                      ? 'قبل الدعوة'
                                      : 'رفض الدعوة'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleStartEdit(row)}
                                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
                                  >
                                    تعديل
                                  </button>
                                  {row.status === 'declined' ? (
                                    <button
                                      type="button"
                                      onClick={() => handleDelete(row.id)}
                                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50"
                                    >
                                      حذف
                                    </button>
                                  ) : (
                                    <span className="rounded-md border border-gray-200 px-3 py-1.5 text-xs text-muted">
                                      الحذف متاح للرافضين فقط
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </motion.section>
                )}

                {tab === 'review' && (
                  <motion.section
                    key="review"
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    className="rounded-2xl bg-white p-6 shadow-lg border border-gray-100"
                  >
                    <h2 className="text-xl font-bold mb-4">قائمة المدعويين والإرسال</h2>
                    <p className="mb-4 text-sm text-muted leading-6">
                      هذه الخطوة النهائية لمراجعة جودة القائمة والتأكد من الجاهزية قبل بدء الإرسال عبر
                      واتساب.
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
                      <div className="rounded-xl bg-gray-50 p-3">إجمالي الأرقام: <strong>{invitees.length}</strong></div>
                      <div className="rounded-xl bg-gray-50 p-3">مكرر: <strong>{analyzeResult?.duplicates || 0}</strong></div>
                      <div className="rounded-xl bg-gray-50 p-3">ناقص/خاطئ: <strong>{analyzeResult?.invalid.length || 0}</strong></div>
                      <div className="rounded-xl bg-gray-50 p-3">
                        بدون أسماء: <strong>{invitees.filter((x) => !x.name).length}</strong>
                      </div>
                    </div>
                    <p className="mb-4 text-sm font-medium text-muted">
                      نطاق الإرسال الحالي: سيتم استهداف <strong>{sendEligibleCount}</strong> مدعو من أصل{' '}
                      <strong>{quota.total || packageLimit || 0}</strong> مقعد في الباقة.
                    </p>
                    <button
                      type="button"
                      onClick={goToWhatsAppSend}
                      className="rounded-lg bg-primary px-5 py-3 font-semibold text-white hover:bg-accent transition-colors"
                    >
                      تأكيد وإرسال عبر واتساب
                    </button>
                  </motion.section>
                )}
              </AnimatePresence>

              {showSparkle && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="fixed bottom-6 right-6 rounded-xl bg-green-600 text-white px-4 py-3 shadow-lg"
                >
                  ✨ تم أول حفظ بنجاح
                </motion.div>
              )}
              {toast.show && (
                <div
                  className={`fixed bottom-6 left-6 rounded-xl px-4 py-3 shadow-lg text-white ${
                    toast.kind === 'success' ? 'bg-green-600' : 'bg-red-600'
                  }`}
                >
                  {toast.text}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}

export default function GuestsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <GuestsPageContent />
    </Suspense>
  )
}
