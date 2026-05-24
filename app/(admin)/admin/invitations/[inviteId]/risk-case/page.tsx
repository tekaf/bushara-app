'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

type RiskCaseWave = {
  id: string
  waveNumber: number
  waveStatus: string
  totalGuestsInWave: number
}

type RiskCaseEntry = {
  guestId: string
  guestName: string
  rawPhone: string
  normalizedPhone: string
  invitationLink: string
  shortInvitationLink: string
  whatsappLink: string
  messageText: string
  sendStatus: string
  reason: string
  waveNumber: number
  manualSendCount: number
  lastAttemptAt: string | null
  sentByAdmin: string
  sentAt: string | null
}

type RiskCasePayload = {
  invite: {
    id: string
    orderCode: string
    occasionType: string
    hostName: string
    eventDate: string
    dispatchMode: string
    dispatchState: string
  }
  dispatch: {
    dispatchId: string
    currentWave: number
    totalGuests: number
    totalWaves: number
    preparedAt: string | null
    preparedBy: string
    dispatchState: string
  }
  dispatchControl: {
    dispatchMode: string
    dispatchStatus: string
    apiHealthStatus: string
    apiFailureReason: string
    apiCheckedAt: string | null
    apiCheckedBy: string
    manualPreparedAt: string | null
    manualPreparedBy: string
  }
  messageTemplate: string
  waves: RiskCaseWave[]
  entries: RiskCaseEntry[]
}

type SharedAccessLink = {
  id: string
  allowedEmail: string
  expiresAt: string | null
  createdAt: string | null
  revokedAt: string | null
  usedAt: string | null
  lastAccessAt: string | null
  status: 'active' | 'expired' | 'revoked'
}

const BLOCKED_STATUSES = new Set([
  'blocked_invalid_phone',
  'blocked_duplicate',
  'blocked_missing_rsvp_token',
  'blocked_missing_message_context',
  'blocked_orphan',
])

const ACTIONABLE_STATUSES = new Set(['ready_manual', 'manual_retry_needed'])

function summarizeShareError(message: string): { brief: string; indexUrl: string } {
  const text = String(message || '')
  const indexUrlMatch = text.match(/https:\/\/console\.firebase\.google\.com\/[^\s)]+/i)
  if (/index/i.test(text) && /firebase|firestore/i.test(text)) {
    return {
      brief: 'يلزم إنشاء index في Firebase',
      indexUrl: indexUrlMatch ? indexUrlMatch[0] : '',
    }
  }
  return { brief: text, indexUrl: indexUrlMatch ? indexUrlMatch[0] : '' }
}

function statusLabel(status: string): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'ready_manual') return 'جاهز يدوي'
  if (normalized === 'manual_retry_needed') return 'تحتاج إعادة محاولة'
  if (normalized === 'manual_opened') return 'تم فتح واتساب'
  if (normalized === 'manually_sent') return 'تم الإرسال'
  if (normalized === 'blocked_invalid_phone') return 'محجوب: رقم غير صالح'
  if (normalized === 'blocked_duplicate') return 'محجوب: رقم مكرر'
  if (normalized === 'blocked_missing_rsvp_token') return 'محجوب: RSVP ناقص'
  if (normalized === 'blocked_missing_message_context') return 'محجوب: بيانات الرسالة ناقصة'
  if (normalized === 'blocked_orphan') return 'محجوب: علاقة غير سليمة'
  return status || '-'
}

export default function AdminRiskCasePage() {
  const params = useParams()
  const inviteId = String(params?.inviteId || '')
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)

  const [loading, setLoading] = useState(true)
  const [savingGuestId, setSavingGuestId] = useState('')
  const [error, setError] = useState('')
  const [copiedGuestId, setCopiedGuestId] = useState('')
  const [payload, setPayload] = useState<RiskCasePayload | null>(null)
  const [selectedWave, setSelectedWave] = useState<number>(1)
  const [shareEmail, setShareEmail] = useState('')
  const [sharing, setSharing] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [shareMessageTone, setShareMessageTone] = useState<'ok' | 'warn' | 'error'>('ok')
  const [accessLinks, setAccessLinks] = useState<SharedAccessLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [revokingTokenId, setRevokingTokenId] = useState('')
  const [copiedLinkId, setCopiedLinkId] = useState('')
  const [knownAccessUrls, setKnownAccessUrls] = useState<Record<string, string>>({})
  const [nowMs, setNowMs] = useState(() => Date.now())
  const [modeChanging, setModeChanging] = useState(false)
  const [modeMessage, setModeMessage] = useState('')
  const [modeMessageTone, setModeMessageTone] = useState<'ok' | 'warn' | 'error'>('ok')
  const [regenerating, setRegenerating] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(timer)
  }, [])

  const liveStatus = (link: SharedAccessLink): 'active' | 'expired' | 'revoked' => {
    if (link.revokedAt || link.status === 'revoked') return 'revoked'
    const expiresAtMs = link.expiresAt ? new Date(link.expiresAt).getTime() : 0
    if (expiresAtMs > 0 && expiresAtMs <= nowMs) return 'expired'
    return 'active'
  }

  const timeLeftLabel = (expiresAt: string | null) => {
    if (!expiresAt) return ''
    const ms = new Date(expiresAt).getTime() - nowMs
    if (ms <= 0) return 'انتهى'
    const totalHours = Math.floor(ms / (1000 * 60 * 60))
    if (totalHours < 24) return `ينتهي بعد ${totalHours} ساعة`
    const days = Math.floor(totalHours / 24)
    const hours = totalHours % 24
    return hours > 0 ? `ينتهي بعد ${days} يوم و ${hours} ساعة` : `ينتهي بعد ${days} يوم`
  }

  const loadRiskCase = async (force = false) => {
    if (!user || !isAdmin || !inviteId) return
    try {
      setLoading(true)
      setError('')
      const token = await user.getIdToken()
      const endpoint = force
        ? `/api/admin/risk-case/${encodeURIComponent(inviteId)}?force=1`
        : `/api/admin/risk-case/${encodeURIComponent(inviteId)}`
      const response = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load risk case')
      setPayload(data as RiskCasePayload)
      const firstWave = Number(data?.dispatch?.currentWave || data?.waves?.[0]?.waveNumber || 1)
      setSelectedWave(firstWave)
    } catch (e: any) {
      setError(e?.message || 'Failed to load risk case')
    } finally {
      setLoading(false)
    }
  }

  const loadAccessLinks = async () => {
    if (!user || !isAdmin || !inviteId) return
    try {
      setLoadingLinks(true)
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/risk-case/${encodeURIComponent(inviteId)}/share-access`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load access links')
      setAccessLinks(Array.isArray(data?.links) ? (data.links as SharedAccessLink[]) : [])
    } catch (e: any) {
      setShareMessage(e?.message || 'Failed to load access links')
      setShareMessageTone('error')
    } finally {
      setLoadingLinks(false)
    }
  }

  useEffect(() => {
    if (!authLoading) void loadRiskCase()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, inviteId, isAdmin, user])

  useEffect(() => {
    if (!authLoading) void loadAccessLinks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, inviteId, isAdmin, user])

  const entries = useMemo(() => payload?.entries || [], [payload?.entries])
  const waves = useMemo(() => payload?.waves || [], [payload?.waves])
  const visibleEntries = entries.filter((entry) => entry.waveNumber === selectedWave)
  const hydratedMessagePreview = useMemo(
    () => entries.find((entry) => String(entry.messageText || '').trim())?.messageText || '',
    [entries]
  )
  const shareFeedback = useMemo(() => summarizeShareError(shareMessage), [shareMessage])

  const summary = useMemo(() => {
    const ready = entries.filter((entry) => ACTIONABLE_STATUSES.has(entry.sendStatus)).length
    const sent = entries.filter((entry) => entry.sendStatus === 'manually_sent').length
    const blocked = entries.filter((entry) => BLOCKED_STATUSES.has(entry.sendStatus)).length
    const total = entries.length
    const progress = total > 0 ? Math.round((sent / total) * 100) : 0
    return { ready, sent, blocked, progress }
  }, [entries])

  const copyMessage = async (entry: RiskCaseEntry) => {
    if (!entry.messageText) return
    try {
      await navigator.clipboard.writeText(entry.messageText)
      setCopiedGuestId(entry.guestId)
      setTimeout(() => setCopiedGuestId(''), 1400)
    } catch {
      alert('تعذر نسخ الرسالة')
    }
  }

  const copyShortLink = async (entry: RiskCaseEntry) => {
    const shortLink = String(entry.shortInvitationLink || '').trim()
    if (!shortLink) return
    try {
      await navigator.clipboard.writeText(shortLink)
      setCopiedGuestId(`link_${entry.guestId}`)
      setTimeout(() => setCopiedGuestId(''), 1400)
    } catch {
      alert('تعذر نسخ الرابط')
    }
  }

  const openShortRsvp = (entry: RiskCaseEntry) => {
    const shortLink = String(entry.shortInvitationLink || '').trim()
    if (!shortLink) return
    window.open(shortLink, '_blank', 'noopener,noreferrer')
  }

  const openWhatsApp = (entry: RiskCaseEntry) => {
    if (!entry.whatsappLink) return
    if (entry.sendStatus === 'manually_sent') {
      const ok = window.confirm('تم الإرسال مسبقًا، هل تريد إعادة فتح واتساب؟')
      if (!ok) return
    }
    window.open(entry.whatsappLink, '_blank', 'noopener,noreferrer')
  }

  const updateStatus = async (entry: RiskCaseEntry, action: 'mark-sent' | 'mark-retry') => {
    if (!user) return
    try {
      setSavingGuestId(entry.guestId)
      const token = await user.getIdToken()
      const response = await fetch(
        `/api/admin/risk-case/${encodeURIComponent(inviteId)}/entries/${encodeURIComponent(entry.guestId)}/${action}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to update entry')
      await loadRiskCase()
    } catch (e: any) {
      alert(e?.message || 'Failed to update entry')
    } finally {
      setSavingGuestId('')
    }
  }

  const setDispatchMode = async (mode: 'manual' | 'api') => {
    if (!user || !isAdmin || !inviteId) return
    try {
      setModeChanging(true)
      setModeMessage('')
      setModeMessageTone('ok')
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/risk-case/${encodeURIComponent(inviteId)}/set-dispatch-mode`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to update dispatch mode')
      const apiHealth = String(data?.apiHealthStatus || '')
      const fallbackApplied = data?.fallbackApplied === true
      setModeMessage(
        fallbackApplied
          ? 'تعذر تفعيل API، وتم تحويل الطلب إلى Risk Case للإرسال اليدوي.'
          : String(data?.message || 'تم تحديث طريقة الإرسال.')
      )
      setModeMessageTone(apiHealth === 'failed' || fallbackApplied ? 'warn' : 'ok')
      await loadRiskCase()
    } catch (e: any) {
      setModeMessage(e?.message || 'Failed to update dispatch mode')
      setModeMessageTone('error')
    } finally {
      setModeChanging(false)
    }
  }

  const createSharedLink = async () => {
    if (!user || !isAdmin || !inviteId) return
    if (!shareEmail.trim()) {
      setShareMessage('أدخل البريد الإلكتروني أولًا')
      setShareMessageTone('error')
      return
    }
    try {
      setSharing(true)
      setShareMessage('')
      setShareMessageTone('ok')
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/risk-case/${encodeURIComponent(inviteId)}/share-access`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: shareEmail.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to create access link')
      const urlText = String(data?.accessUrl || data?.accessPath || '')
      if (data?.tokenId && urlText) {
        setKnownAccessUrls((prev) => ({ ...prev, [String(data.tokenId)]: urlText }))
      }
      setShareMessage(
        data?.emailSent
          ? 'تم إنشاء الرابط وإرساله إلى البريد'
          : 'تم إنشاء الرابط، لكن تعذر إرسال البريد. انسخ الرابط وأرسله يدويًا.'
      )
      setShareMessageTone(data?.emailSent ? 'ok' : 'warn')
      if (!data?.emailSent && urlText) {
        await navigator.clipboard.writeText(urlText).catch(() => undefined)
      }
      setShareEmail('')
      if (Array.isArray(data?.links)) setAccessLinks(data.links as SharedAccessLink[])
      else await loadAccessLinks()
    } catch (e: any) {
      setShareMessage(e?.message || 'Failed to create access link')
      setShareMessageTone('error')
    } finally {
      setSharing(false)
    }
  }

  const revokeLink = async (tokenId: string) => {
    if (!user || !isAdmin || !inviteId || !tokenId) return
    try {
      const ok = window.confirm('هل تريد إلغاء هذا الرابط؟ لن يتمكن المستلم من الدخول بعد ذلك.')
      if (!ok) return
      setRevokingTokenId(tokenId)
      setShareMessage('')
      const token = await user.getIdToken()
      const response = await fetch(
        `/api/admin/risk-case/${encodeURIComponent(inviteId)}/share-access/${encodeURIComponent(tokenId)}/revoke`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to revoke link')
      setShareMessage('تم إلغاء الرابط')
      setShareMessageTone('ok')
      await loadAccessLinks()
    } catch (e: any) {
      setShareMessage(e?.message || 'Failed to revoke link')
      setShareMessageTone('error')
    } finally {
      setRevokingTokenId('')
    }
  }

  const copySharedLink = async (tokenId: string) => {
    const url = knownAccessUrls[tokenId]
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopiedLinkId(tokenId)
      setTimeout(() => setCopiedLinkId(''), 1300)
    } catch {
      setShareMessage('تعذر نسخ الرابط')
      setShareMessageTone('error')
    }
  }

  const forceRegenerateEntries = async () => {
    if (!user || !isAdmin || !inviteId) return
    try {
      setRegenerating(true)
      await loadRiskCase(true)
    } catch {
      // handled inside loadRiskCase
    } finally {
      setRegenerating(false)
    }
  }

  if (authLoading || loading) return <div className="p-8 text-center text-muted">جاري تحميل بيانات Risk Case...</div>
  if (!user || !isAdmin) return <div className="p-8 text-center text-red-600">غير مصرح بالدخول.</div>
  if (!payload) return <div className="p-8 text-center text-red-600">{error || 'تعذر تحميل البيانات'}</div>

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white p-4">
          <div>
            <h1 className="text-xl font-bold">Risk Case — الإرسال اليدوي</h1>
            <p className="mt-1 text-sm text-muted">Order Code: {payload.invite.orderCode || inviteId}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={forceRegenerateEntries}
              disabled={regenerating}
              className="rounded-lg border border-primary px-3 py-2 text-sm text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              {regenerating ? 'جاري إعادة التوليد...' : 'إعادة توليد الرسائل'}
            </button>
            <Link
              href={`/admin/invitations/review/${encodeURIComponent(inviteId)}`}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
            >
              العودة إلى صفحة المراجعة
            </Link>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard title="جاهز للإرسال" value={summary.ready} tone="blue" />
          <SummaryCard title="تم الإرسال" value={summary.sent} tone="green" />
          <SummaryCard title="محجوب" value={summary.blocked} tone="red" />
          <SummaryCard title="نسبة الإنجاز" value={`${summary.progress}%`} tone="slate" />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-muted">
            <span><strong className="text-textDark">Order Code:</strong> {payload.invite.orderCode || '-'}</span>
            <span><strong className="text-textDark">نوع المناسبة:</strong> {payload.invite.occasionType || '-'}</span>
            <span><strong className="text-textDark">صاحب الدعوة:</strong> {payload.invite.hostName || '-'}</span>
            <span><strong className="text-textDark">التاريخ:</strong> {payload.invite.eventDate || '-'}</span>
            <span><strong className="text-textDark">عدد المدعوين:</strong> {payload.dispatch.totalGuests}</span>
            <span><strong className="text-textDark">عدد الموجات:</strong> {payload.dispatch.totalWaves}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">طريقة الإرسال</h2>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            <p>
              الوضع الحالي: <strong>{payload.dispatchControl.dispatchMode || payload.invite.dispatchMode || 'manual'}</strong>
            </p>
            <p>
              الحالة: <strong>{payload.dispatchControl.dispatchStatus || payload.dispatch.dispatchState || '-'}</strong>
            </p>
            <p>
              آخر اختبار API: <strong>{payload.dispatchControl.apiHealthStatus || '-'}</strong>
            </p>
            <p>
              وقت فحص API: <strong>{payload.dispatchControl.apiCheckedAt || '-'}</strong>
            </p>
          </div>
          {payload.dispatchControl.apiFailureReason ? (
            <p className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
              سبب فشل API: {payload.dispatchControl.apiFailureReason}
            </p>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setDispatchMode('manual')}
              disabled={modeChanging}
              className="rounded border border-indigo-300 px-3 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
            >
              {modeChanging ? 'جاري التحديث...' : 'اختيار Manual / Risk Case'}
            </button>
            <button
              onClick={() => setDispatchMode('api')}
              disabled={modeChanging}
              className="rounded border border-blue-300 px-3 py-1.5 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-60"
            >
              {modeChanging ? 'جاري التحديث...' : 'اختيار API'}
            </button>
            <DispatchReadinessBadge
              mode={payload.dispatchControl.dispatchMode || payload.invite.dispatchMode || 'manual'}
              apiHealthStatus={payload.dispatchControl.apiHealthStatus || ''}
              dispatchState={payload.dispatch.dispatchState || payload.dispatchControl.dispatchStatus || ''}
            />
          </div>
          {modeMessage ? (
            <p
              className={`mt-2 text-xs ${
                modeMessageTone === 'ok'
                  ? 'text-emerald-700'
                  : modeMessageTone === 'warn'
                    ? 'text-amber-700'
                    : 'text-rose-700'
              }`}
            >
              {modeMessage}
            </p>
          ) : null}
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">مشاركة رابط الإرسال اليدوي</h2>
          <div className="flex flex-wrap gap-2">
            <input
              type="email"
              value={shareEmail}
              onChange={(e) => setShareEmail(e.target.value)}
              placeholder="operator@example.com"
              className="min-w-[260px] flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              onClick={createSharedLink}
              disabled={sharing}
              className="rounded border border-primary px-3 py-2 text-sm text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              {sharing ? 'جاري الإنشاء...' : 'إرسال رابط'}
            </button>
          </div>
          {shareMessageTone === 'error' && shareFeedback.brief ? (
            <p className="mt-2 text-xs text-rose-700">{shareFeedback.brief}</p>
          ) : null}
          {shareMessageTone === 'error' && shareFeedback.indexUrl ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="max-w-full break-all rounded bg-rose-50 px-2 py-1 text-[11px] text-rose-700">
                {shareFeedback.indexUrl}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(shareFeedback.indexUrl)}
                className="rounded border border-rose-300 px-2 py-1 text-xs text-rose-700 hover:bg-rose-50"
              >
                نسخ رابط الـ index
              </button>
            </div>
          ) : null}
          <p className="mt-2 text-xs text-amber-700">
            هذا الرابط خاص بهذا الطلب فقط، ولا يمنح صلاحية دخول لوحة الأدمن.
          </p>
          {shareMessage && shareMessageTone !== 'error' ? (
            <p
              className={`mt-2 text-xs ${
                shareMessageTone === 'ok'
                  ? 'text-emerald-700'
                  : shareMessageTone === 'warn'
                    ? 'text-amber-700'
                    : 'text-rose-700'
              }`}
            >
              {shareMessage}
            </p>
          ) : null}
          <div className="mt-3 space-y-2">
            {loadingLinks ? (
              <p className="text-xs text-muted">جاري تحميل الروابط...</p>
            ) : accessLinks.length === 0 ? (
              <p className="text-xs text-muted">لا توجد روابط مشاركة بعد.</p>
            ) : (
              accessLinks.map((link) => (
                <div key={link.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 p-2 text-xs">
                  <div className="space-y-0.5">
                    <p>email: {link.allowedEmail}</p>
                    <p className="flex items-center gap-2">
                      status:
                      <StatusBadge status={liveStatus(link)} />
                    </p>
                    <p>expires: {link.expiresAt || '-'}</p>
                    {liveStatus(link) === 'active' ? <p>{timeLeftLabel(link.expiresAt)}</p> : null}
                    <p>lastAccess: {link.lastAccessAt || '-'}</p>
                    {knownAccessUrls[link.id] ? (
                      <p className="break-all text-[11px] text-muted">link: {knownAccessUrls[link.id]}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => copySharedLink(link.id)}
                      disabled={liveStatus(link) !== 'active' || !knownAccessUrls[link.id]}
                      className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {copiedLinkId === link.id ? 'تم نسخ الرابط' : 'نسخ الرابط'}
                    </button>
                    {liveStatus(link) === 'active' ? (
                      <button
                        onClick={() => revokeLink(link.id)}
                        disabled={revokingTokenId === link.id}
                        className="rounded border border-rose-300 px-2 py-1 text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                      >
                        {revokingTokenId === link.id ? 'جاري الإلغاء...' : 'Revoke'}
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">نص الرسالة</h2>
            <button
              onClick={() => navigator.clipboard.writeText(hydratedMessagePreview || payload.messageTemplate)}
              className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
            >
              نسخ النص
            </button>
          </div>
          <pre dir="rtl" className="overflow-auto rounded-lg bg-gray-50 p-4 text-sm leading-8 whitespace-pre-wrap">
            {hydratedMessagePreview || 'لا توجد رسالة جاهزة بعد. تأكد من وجود مدعوين بحالة جاهزة للإرسال.'}
          </pre>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">الموجات</h2>
          <div className="mb-4 flex flex-wrap gap-2">
            {waves.map((wave) => (
              <button
                key={wave.id}
                onClick={() => setSelectedWave(wave.waveNumber)}
                className={`rounded-lg border px-3 py-1.5 text-sm ${
                  selectedWave === wave.waveNumber
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-gray-300 bg-white hover:bg-gray-50'
                }`}
              >
                موجة {wave.waveNumber} ({wave.totalGuestsInWave})
              </button>
            ))}
          </div>

          {visibleEntries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-muted">
              لا توجد entries في هذه الموجة.
            </div>
          ) : (
            <div className="grid gap-3">
              {visibleEntries.map((entry) => {
                const blocked = BLOCKED_STATUSES.has(entry.sendStatus)
                const sent = entry.sendStatus === 'manually_sent'
                const canOpenWhatsApp = !blocked && Boolean(entry.whatsappLink)
                const canMarkSent = !blocked && ACTIONABLE_STATUSES.has(entry.sendStatus)
                return (
                  <div
                    key={entry.guestId}
                    className={`rounded-xl border p-3 ${
                      blocked || sent ? 'border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold">{entry.guestName || 'ضيف'}</p>
                        <p className="text-xs">guestId: {entry.guestId}</p>
                      </div>
                      <span className="rounded-full border border-gray-300 px-2 py-1 text-xs">{statusLabel(entry.sendStatus)}</span>
                    </div>

                    <div className="grid gap-2 text-xs md:grid-cols-2">
                      <div>الرقم الأصلي: {entry.rawPhone || '-'}</div>
                      <div>الهاتف الموحد: {entry.normalizedPhone || '-'}</div>
                      <div className="md:col-span-2 break-all">الرابط المختصر: {entry.shortInvitationLink || '-'}</div>
                      {entry.reason ? <div className="md:col-span-2 text-red-600">سبب الحجب: {entry.reason}</div> : null}
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => copyShortLink(entry)}
                        disabled={!entry.shortInvitationLink}
                        className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        {copiedGuestId === `link_${entry.guestId}` ? 'تم نسخ الرابط' : 'نسخ الرابط'}
                      </button>
                      <button
                        onClick={() => openShortRsvp(entry)}
                        disabled={!entry.shortInvitationLink}
                        className="rounded border border-indigo-300 px-3 py-1 text-xs text-indigo-700 hover:bg-indigo-50 disabled:opacity-50"
                      >
                        فتح RSVP
                      </button>
                      <button
                        onClick={() => copyMessage(entry)}
                        disabled={!entry.messageText}
                        className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                      >
                        {copiedGuestId === entry.guestId ? 'تم النسخ' : 'نسخ الرسالة'}
                      </button>
                      <button
                        onClick={() => openWhatsApp(entry)}
                        disabled={!canOpenWhatsApp}
                        className="rounded border border-emerald-300 px-3 py-1 text-xs text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {sent ? 'فتح واتساب (تم الإرسال مسبقًا)' : 'فتح واتساب'}
                      </button>
                      <button
                        onClick={() => updateStatus(entry, 'mark-sent')}
                        disabled={!canMarkSent || savingGuestId === entry.guestId}
                        className="rounded border border-blue-300 px-3 py-1 text-xs text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        {savingGuestId === entry.guestId ? 'جاري التحديث...' : 'تم الإرسال'}
                      </button>
                      <button
                        onClick={() => updateStatus(entry, 'mark-retry')}
                        disabled={blocked || savingGuestId === entry.guestId}
                        className="rounded border border-amber-300 px-3 py-1 text-xs text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                      >
                        إعادة محاولة
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryCard({ title, value, tone }: { title: string; value: string | number; tone: string }) {
  const toneMap: Record<string, string> = {
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
  }
  return (
    <div className={`rounded-xl border p-3 ${toneMap[tone] || toneMap.slate}`}>
      <p className="text-xs">{title}</p>
      <p className="mt-1 text-lg font-bold">{value}</p>
    </div>
  )
}

function StatusBadge({ status }: { status: 'active' | 'expired' | 'revoked' }) {
  const styles =
    status === 'active'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
      : status === 'expired'
        ? 'border-slate-300 bg-slate-100 text-slate-700'
        : 'border-rose-300 bg-rose-50 text-rose-700'
  const label = status === 'active' ? 'Active' : status === 'expired' ? 'Expired' : 'Revoked'
  return <span className={`rounded-full border px-2 py-0.5 ${styles}`}>{label}</span>
}

function DispatchReadinessBadge({
  mode,
  apiHealthStatus,
  dispatchState,
}: {
  mode: string
  apiHealthStatus: string
  dispatchState: string
}) {
  const normalizedMode = String(mode || '').toLowerCase()
  const normalizedApi = String(apiHealthStatus || '').toLowerCase()
  const normalizedState = String(dispatchState || '').toLowerCase()
  if (normalizedMode === 'api' && normalizedApi === 'passed') {
    return <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">API جاهز</span>
  }
  if (normalizedApi === 'failed') {
    return <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700">API فشل</span>
  }
  if (normalizedMode === 'manual' && (normalizedState === 'ready_manual' || normalizedState === 'ready')) {
    return (
      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
        Risk Case جاهز
      </span>
    )
  }
  return <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">قيد التحضير</span>
}
