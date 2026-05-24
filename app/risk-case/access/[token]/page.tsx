'use client'

import { useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { useEffect } from 'react'

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
  whatsappLink: string
  messageText: string
  sendStatus: string
  reason: string
  waveNumber: number
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
    currentWave: number
    totalGuests: number
    totalWaves: number
    dispatchState: string
  }
  messageTemplate: string
  waves: RiskCaseWave[]
  entries: RiskCaseEntry[]
  access?: {
    tokenId: string
    allowedEmail: string
    expiresAt: string | null
  }
}

const BLOCKED_STATUSES = new Set([
  'blocked_invalid_phone',
  'blocked_duplicate',
  'blocked_missing_rsvp_token',
  'blocked_missing_message_context',
  'blocked_orphan',
])

const ACTIONABLE_STATUSES = new Set(['ready_manual', 'manual_retry_needed'])

export default function RiskCaseAccessPage() {
  const params = useParams()
  const token = String(params?.token || '')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<RiskCasePayload | null>(null)
  const [selectedWave, setSelectedWave] = useState(1)
  const [savingGuestId, setSavingGuestId] = useState('')
  const [copiedGuestId, setCopiedGuestId] = useState('')

  const loadData = async () => {
    if (!token) return
    try {
      setLoading(true)
      setError('')
      const response = await fetch(`/api/risk-case/access/${encodeURIComponent(token)}`)
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load access page')
      setPayload(data as RiskCasePayload)
      setSelectedWave(Number(data?.dispatch?.currentWave || data?.waves?.[0]?.waveNumber || 1))
    } catch (e: any) {
      setError(e?.message || 'Failed to load access page')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const entries = payload?.entries || []
  const waves = payload?.waves || []
  const visibleEntries = entries.filter((entry) => entry.waveNumber === selectedWave)
  const summary = useMemo(() => {
    const ready = entries.filter((entry) => ACTIONABLE_STATUSES.has(entry.sendStatus)).length
    const sent = entries.filter((entry) => entry.sendStatus === 'manually_sent').length
    const blocked = entries.filter((entry) => BLOCKED_STATUSES.has(entry.sendStatus)).length
    const total = entries.length
    const remaining = Math.max(0, total - sent - blocked)
    const progress = total > 0 ? Math.round((sent / total) * 100) : 0
    return { ready, sent, blocked, remaining, progress }
  }, [entries])

  const copyMessage = async (entry: RiskCaseEntry) => {
    if (!entry.messageText) return
    try {
      await navigator.clipboard.writeText(entry.messageText)
      setCopiedGuestId(entry.guestId)
      setTimeout(() => setCopiedGuestId(''), 1200)
    } catch {
      alert('تعذر النسخ')
    }
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
    try {
      setSavingGuestId(entry.guestId)
      const response = await fetch(
        `/api/risk-case/access/${encodeURIComponent(token)}/entries/${encodeURIComponent(entry.guestId)}/${action}`,
        { method: 'POST' }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to update entry')
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Failed to update entry')
    } finally {
      setSavingGuestId('')
    }
  }

  if (loading) return <div className="p-8 text-center text-muted">جاري تحميل رابط التشغيل...</div>
  if (error || !payload) return <div className="p-8 text-center text-red-600">{error || 'الرابط غير صالح'}</div>

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="mx-auto max-w-7xl space-y-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h1 className="text-xl font-bold">Risk Case Operator Access</h1>
          <p className="text-sm text-muted">
            الطلب: {payload.invite.orderCode || payload.invite.id} - البريد المسموح: {payload.access?.allowedEmail || '-'}
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Order Code" value={payload.invite.orderCode || '-'} />
          <InfoCard label="Invite ID" value={payload.invite.id} mono />
          <InfoCard label="نوع المناسبة" value={payload.invite.occasionType || '-'} />
          <InfoCard label="صاحب الدعوة" value={payload.invite.hostName || '-'} />
          <InfoCard label="التاريخ" value={payload.invite.eventDate || '-'} />
          <InfoCard label="dispatchMode" value={payload.invite.dispatchMode} />
          <InfoCard label="dispatchState" value={payload.dispatch.dispatchState} />
          <InfoCard label="totalGuests" value={String(payload.dispatch.totalGuests)} />
          <InfoCard label="totalWaves" value={String(payload.dispatch.totalWaves)} />
          <InfoCard label="expiresAt" value={payload.access?.expiresAt || '-'} />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">نص الرسالة</h2>
            <button
              onClick={() => navigator.clipboard.writeText(payload.messageTemplate)}
              className="rounded border border-gray-300 px-3 py-1 text-xs hover:bg-gray-50"
            >
              نسخ النص
            </button>
          </div>
          <pre className="overflow-auto rounded-lg bg-gray-50 p-3 text-sm whitespace-pre-wrap">{payload.messageTemplate}</pre>
        </div>

        <div className="grid gap-3 md:grid-cols-5">
          <SummaryCard title="جاهز للإرسال" value={summary.ready} tone="blue" />
          <SummaryCard title="تم الإرسال" value={summary.sent} tone="green" />
          <SummaryCard title="محجوب" value={summary.blocked} tone="red" />
          <SummaryCard title="المتبقي" value={summary.remaining} tone="amber" />
          <SummaryCard title="نسبة الإنجاز" value={`${summary.progress}%`} tone="slate" />
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h2 className="mb-3 text-base font-semibold">Waves</h2>
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
                Wave {wave.waveNumber} ({wave.totalGuestsInWave})
              </button>
            ))}
          </div>

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
                    <span className="rounded-full border border-gray-300 px-2 py-1 text-xs">{entry.sendStatus}</span>
                  </div>
                  <div className="grid gap-2 text-xs md:grid-cols-2">
                    <div>الرقم الأصلي: {entry.rawPhone || '-'}</div>
                    <div>normalized: {entry.normalizedPhone || '-'}</div>
                    <div className="md:col-span-2 break-all">invitationLink: {entry.invitationLink || '-'}</div>
                    <div className="md:col-span-2 break-all">whatsappLink: {entry.whatsappLink || '-'}</div>
                    {entry.reason ? <div className="md:col-span-2 text-red-600">السبب: {entry.reason}</div> : null}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
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
        </div>
      </div>
    </div>
  )
}

function InfoCard({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-sm font-semibold ${mono ? 'font-mono' : ''}`}>{value || '-'}</p>
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
