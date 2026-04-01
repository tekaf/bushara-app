'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { auth, db } from '@/lib/firebase/config'
import type { Invite } from '@/lib/firebase/types'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

const TIMEZONE_OPTIONS = ['Asia/Riyadh', 'Asia/Dubai', 'UTC']

function toDateTimeLocalValue(value: unknown) {
  if (!value) return ''
  const d = new Date(String(value))
  if (!Number.isFinite(d.getTime())) return ''
  const offset = d.getTimezoneOffset()
  const local = new Date(d.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

function getCustomerWorkflowLabel(status: string) {
  if (status === INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT) return 'بانتظار استكمال المعالجة'
  if (status === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW) return 'قيد المراجعة'
  if (status === INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE) return 'تحتاج تحديثًا منك'
  if (status === INVITE_WORKFLOW_STATUS.APPROVED) return 'تم الاعتماد'
  if (status === INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING) return 'جاهزة لجدولة الإرسال'
  if (status === INVITE_WORKFLOW_STATUS.SCHEDULED) return 'تمت الجدولة'
  if (status === INVITE_WORKFLOW_STATUS.SENDING) return 'جاري الإرسال'
  if (status === INVITE_WORKFLOW_STATUS.PARTIALLY_SENT) return 'تم الإرسال جزئيًا'
  if (status === INVITE_WORKFLOW_STATUS.SENT) return 'تم الإرسال'
  return 'قيد المعالجة'
}

export default function InviteDetailPage() {
  const params = useParams()
  const inviteId = params.inviteId as string
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(true)
  const [scheduleAt, setScheduleAt] = useState('')
  const [timezone, setTimezone] = useState('Asia/Riyadh')
  const [scheduleLoading, setScheduleLoading] = useState(false)
  const [rescheduleLoading, setRescheduleLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [scheduleSuccess, setScheduleSuccess] = useState('')
  const [scheduleError, setScheduleError] = useState('')
  const [guestStats, setGuestStats] = useState({
    total: 0,
    accepted: 0,
    declined: 0,
    pending: 0,
    loaded: false,
    blockedReason: '',
  })

  useEffect(() => {
    const fetchInvite = async () => {
      try {
        const inviteDoc = await getDoc(doc(db, 'invites', inviteId))
        if (inviteDoc.exists()) {
          setInvite({ id: inviteDoc.id, ...inviteDoc.data() } as Invite)
        }
      } catch (error) {
        console.error('Error fetching invite:', error)
      } finally {
        setLoading(false)
      }
    }

    if (inviteId) {
      fetchInvite()
    }
  }, [inviteId])

  useEffect(() => {
    if (!invite) return
    setScheduleAt(toDateTimeLocalValue((invite as any)?.scheduledSendAt))
    setTimezone(String((invite as any)?.timezone || 'Asia/Riyadh'))
  }, [invite])

  const isPaid =
    (invite as any)?.paymentStatus === 'paid' ||
    (invite as any)?.status === 'paid' ||
    (invite as any)?.inviteLockedAfterPayment === true
  const workflowStatus = String((invite as any)?.workflowStatus || '')
  const isWorkshopWaiting =
    workflowStatus === INVITE_WORKFLOW_STATUS.AWAITING_PAYMENT ||
    workflowStatus === INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW ||
    workflowStatus === INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE
  const canSchedule =
    workflowStatus === INVITE_WORKFLOW_STATUS.APPROVED ||
    workflowStatus === INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING
  const isAlreadyScheduled = workflowStatus === INVITE_WORKFLOW_STATUS.SCHEDULED
  const isSendingOrAfter =
    workflowStatus === INVITE_WORKFLOW_STATUS.SENDING ||
    workflowStatus === INVITE_WORKFLOW_STATUS.PARTIALLY_SENT ||
    workflowStatus === INVITE_WORKFLOW_STATUS.SENT
  const canCancelOrReschedule = isAlreadyScheduled && !isSendingOrAfter
  const customerWorkflowLabel = getCustomerWorkflowLabel(workflowStatus)
  const actionLoading = scheduleLoading || rescheduleLoading || cancelLoading

  const fetchGuestStats = useCallback(async () => {
    if (!inviteId || !isPaid) return
    try {
      const user = auth.currentUser
      if (!user) return
      const token = await user.getIdToken()
      const response = await fetch(`/api/user/invitations/${encodeURIComponent(inviteId)}/guests`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setGuestStats((prev) => ({
          ...prev,
          loaded: true,
          blockedReason: String(data?.error || 'تعذر تحميل إحصائيات المدعوين لهذه الدعوة.'),
        }))
        return
      }
      const q = data?.quota || {}
      const total = Number(q.total || 0)
      const accepted = Number(q.accepted || 0)
      const declined = Number(q.declined || 0)
      const pending = Number(q.pending || Math.max(0, total - accepted - declined))
      setGuestStats({
        total,
        accepted,
        declined,
        pending,
        loaded: true,
        blockedReason: '',
      })
    } catch (error: any) {
      setGuestStats((prev) => ({
        ...prev,
        loaded: true,
        blockedReason: error?.message || 'تعذر تحميل إحصائيات المدعوين.',
      }))
    }
  }, [inviteId, isPaid])

  useEffect(() => {
    if (!isPaid) return
    fetchGuestStats()
  }, [fetchGuestStats, isPaid])

  const handleSchedule = async () => {
    setScheduleError('')
    setScheduleSuccess('')
    if (!scheduleAt) {
      setScheduleError('يرجى اختيار وقت إرسال صحيح.')
      return
    }
    try {
      setScheduleLoading(true)
      const user = auth.currentUser
      if (!user) {
        setScheduleError('يرجى تسجيل الدخول أولًا.')
        return
      }
      const token = await user.getIdToken()
      const response = await fetch(`/api/user/invitations/${encodeURIComponent(inviteId)}/schedule-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduledSendAt: new Date(scheduleAt).toISOString(),
          timezone,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setScheduleError(String(data?.error || 'تعذر جدولة الإرسال.'))
        return
      }

      setInvite((prev) =>
        prev
          ? ({
              ...prev,
              workflowStatus: INVITE_WORKFLOW_STATUS.SCHEDULED,
              scheduledSendAt: data?.scheduledSendAt || new Date(scheduleAt).toISOString(),
              timezone,
            } as Invite)
          : prev
      )
      setScheduleSuccess('تمت جدولة الإرسال بنجاح، وحالة الدعوة أصبحت scheduled.')
      fetchGuestStats()
    } catch (error: any) {
      setScheduleError(error?.message || 'حدث خطأ غير متوقع أثناء الجدولة.')
    } finally {
      setScheduleLoading(false)
    }
  }

  const handleCancelSchedule = async () => {
    setScheduleError('')
    setScheduleSuccess('')
    try {
      setCancelLoading(true)
      const user = auth.currentUser
      if (!user) {
        setScheduleError('يرجى تسجيل الدخول أولًا.')
        return
      }
      const token = await user.getIdToken()
      const response = await fetch(`/api/user/invitations/${encodeURIComponent(inviteId)}/cancel-schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setScheduleError(String(data?.error || 'تعذر إلغاء الجدولة.'))
        return
      }

      setInvite((prev) =>
        prev
          ? ({
              ...prev,
              workflowStatus: INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
              scheduledSendAt: null,
            } as Invite)
          : prev
      )
      setScheduleSuccess('تم إلغاء الجدولة بنجاح. يمكنك اختيار موعد جديد.')
      setScheduleAt('')
      fetchGuestStats()
    } catch (error: any) {
      setScheduleError(error?.message || 'حدث خطأ غير متوقع أثناء إلغاء الجدولة.')
    } finally {
      setCancelLoading(false)
    }
  }

  const handleReschedule = async () => {
    setScheduleError('')
    setScheduleSuccess('')
    if (!scheduleAt) {
      setScheduleError('يرجى اختيار وقت جديد صالح لإعادة الجدولة.')
      return
    }
    try {
      setRescheduleLoading(true)
      const user = auth.currentUser
      if (!user) {
        setScheduleError('يرجى تسجيل الدخول أولًا.')
        return
      }
      const token = await user.getIdToken()
      const response = await fetch(`/api/user/invitations/${encodeURIComponent(inviteId)}/reschedule-send`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          scheduledSendAt: new Date(scheduleAt).toISOString(),
          timezone,
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        setScheduleError(String(data?.error || 'تعذر إعادة الجدولة.'))
        return
      }

      setInvite((prev) =>
        prev
          ? ({
              ...prev,
              workflowStatus: INVITE_WORKFLOW_STATUS.SCHEDULED,
              scheduledSendAt: data?.scheduledSendAt || new Date(scheduleAt).toISOString(),
              timezone,
            } as Invite)
          : prev
      )
      setScheduleSuccess('تمت إعادة الجدولة بنجاح.')
      fetchGuestStats()
    } catch (error: any) {
      setScheduleError(error?.message || 'حدث خطأ غير متوقع أثناء إعادة الجدولة.')
    } finally {
      setRescheduleLoading(false)
    }
  }

  const resumeQuery = new URLSearchParams()
  if ((invite as any)?.selectedOccasion) resumeQuery.set('occasion', String((invite as any).selectedOccasion))
  if ((invite as any)?.packageGuests) resumeQuery.set('packageGuests', String((invite as any).packageGuests))
  if ((invite as any)?.packagePrice) resumeQuery.set('packagePrice', String((invite as any).packagePrice))
  const resumeHref = `/templates/${(invite as any)?.designId || ''}${resumeQuery.toString() ? `?${resumeQuery.toString()}` : ''}`

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">الدعوة غير موجودة</p>
          <Link
            href="/dashboard/invites"
            className="text-primary hover:text-accent"
          >
            العودة للقائمة
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-white border-b border-primarySoft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/invites"
              className="text-muted hover:text-primary transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-bold text-primary">{invite.title}</h1>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-6">تفاصيل الدعوة</h2>
          {isPaid && (
            <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
              هذه الدعوة مدفوعة، وبيانات التصميم غير قابلة للتعديل بعد الدفع.
            </div>
          )}
          {isPaid && isWorkshopWaiting && (
            <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-800">
              تم استلام طلبك بنجاح. فريق بشاره يراجع دعوتك الآن، وسيتم تفعيل المعاينة والمتابعة فور جاهزيتها.
              <div className="mt-3">
                <Link
                  href={`/dashboard/invites/${inviteId}/workshop-status`}
                  className="inline-flex rounded-lg border border-blue-300 bg-white px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-50"
                >
                  متابعة حالة الطلب
                </Link>
              </div>
            </div>
          )}
          {isPaid && (
            <div className="mb-6 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
              <h3 className="mb-3 text-base font-bold text-indigo-900">إحصائيات الدعوة</h3>
              {!guestStats.loaded ? (
                <p className="text-sm text-indigo-800">جاري تحميل الإحصائيات...</p>
              ) : guestStats.blockedReason ? (
                <p className="text-sm text-indigo-800">{guestStats.blockedReason}</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-4">
                  <div className="rounded-lg border border-indigo-200 bg-white p-3 text-center">
                    <div className="text-xs text-indigo-500">إجمالي المدعوين</div>
                    <div className="text-lg font-bold text-indigo-900">{guestStats.total}</div>
                  </div>
                  <div className="rounded-lg border border-indigo-200 bg-white p-3 text-center">
                    <div className="text-xs text-indigo-500">الموافقون</div>
                    <div className="text-lg font-bold text-green-700">{guestStats.accepted}</div>
                  </div>
                  <div className="rounded-lg border border-indigo-200 bg-white p-3 text-center">
                    <div className="text-xs text-indigo-500">المعتذرون</div>
                    <div className="text-lg font-bold text-red-700">{guestStats.declined}</div>
                  </div>
                  <div className="rounded-lg border border-indigo-200 bg-white p-3 text-center">
                    <div className="text-xs text-indigo-500">بانتظار الرد</div>
                    <div className="text-lg font-bold text-amber-700">{guestStats.pending}</div>
                  </div>
                </div>
              )}
              <div className="mt-4">
                <Link
                  href={`/guests?invId=${encodeURIComponent(inviteId)}`}
                  className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent"
                >
                  إضافة/إدارة المدعوين
                </Link>
              </div>
            </div>
          )}
          {isPaid && (
            <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="mb-3 text-base font-bold text-amber-900">جدولة الإرسال</h3>
              <p className="mb-4 text-sm text-amber-800">
                يمكنك اختيار موعد إرسال الدعوات والمنطقة الزمنية.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-amber-900">وقت الإرسال</span>
                  <input
                    type="datetime-local"
                    value={scheduleAt}
                    onChange={(e) => setScheduleAt(e.target.value)}
                    disabled={(!canSchedule && !canCancelOrReschedule) || actionLoading}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-amber-100"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-amber-900">المنطقة الزمنية</span>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={(!canSchedule && !canCancelOrReschedule) || actionLoading}
                    className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-amber-100"
                  >
                    {TIMEZONE_OPTIONS.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <button
                  onClick={handleSchedule}
                  disabled={!canSchedule || actionLoading}
                  className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                >
                  {scheduleLoading ? 'جاري الجدولة...' : 'جدولة الإرسال'}
                </button>
                {canCancelOrReschedule && (
                  <>
                    <button
                      onClick={handleReschedule}
                      disabled={actionLoading}
                      className="inline-flex rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {rescheduleLoading ? 'جاري إعادة الجدولة...' : 'إعادة الجدولة'}
                    </button>
                    <button
                      onClick={handleCancelSchedule}
                      disabled={actionLoading}
                      className="inline-flex rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {cancelLoading ? 'جاري الإلغاء...' : 'إلغاء الجدولة'}
                    </button>
                  </>
                )}
                {isAlreadyScheduled && !scheduleSuccess && (
                  <span className="text-sm text-green-700">تمت الجدولة مسبقًا.</span>
                )}
              </div>
              {!canSchedule && !canCancelOrReschedule && (
                <p className="mt-3 text-sm text-amber-800">
                  لا يمكن جدولة الإرسال الآن. الحالة الحالية: <strong>{customerWorkflowLabel}</strong>
                </p>
              )}
              {isSendingOrAfter && (
                <p className="mt-3 text-sm text-amber-800">
                  لا يمكن الإلغاء أو إعادة الجدولة بعد بدء الإرسال. الحالة الحالية:{' '}
                  <strong>{customerWorkflowLabel}</strong>
                </p>
              )}
              {scheduleSuccess && <p className="mt-3 text-sm font-semibold text-green-700">{scheduleSuccess}</p>}
              {scheduleError && <p className="mt-3 text-sm font-semibold text-red-700">{scheduleError}</p>}
            </div>
          )}
          <div className="space-y-4">
            <div>
              <span className="text-muted">العريس:</span>
              <span className="mr-2 font-semibold">{invite.groomName}</span>
            </div>
            <div>
              <span className="text-muted">العروس:</span>
              <span className="mr-2 font-semibold">{invite.brideName}</span>
            </div>
            <div>
              <span className="text-muted">التاريخ:</span>
              <span className="mr-2 font-semibold">{invite.date}</span>
            </div>
            <div>
              <span className="text-muted">الوقت:</span>
              <span className="mr-2 font-semibold">{invite.time}</span>
            </div>
            <div>
              <span className="text-muted">المكان:</span>
              <span className="mr-2 font-semibold">{invite.locationName}</span>
            </div>
            <div>
              <span className="text-muted">الحالة:</span>
              <span className="mr-2 font-semibold">{customerWorkflowLabel}</span>
            </div>
            <div>
              <span className="text-muted">حالة الدفع:</span>
              <span className="mr-2 font-semibold">{isPaid ? 'مدفوع' : 'غير مدفوع'}</span>
            </div>
            <div>
              <span className="text-muted">حالة المراجعة:</span>
              <span className="mr-2 font-semibold">{String((invite as any)?.reviewStatus || 'pending')}</span>
            </div>
            <div>
              <span className="text-muted">قابلية التعديل:</span>
              <span className="mr-2 font-semibold">{isPaid ? 'مقفلة بعد الدفع' : 'متاحة'}</span>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t">
            {!isPaid && (invite as any)?.designId ? (
              <Link
                href={resumeHref}
                className="inline-flex rounded-lg bg-primary px-5 py-3 text-white font-semibold hover:bg-accent transition-colors"
              >
                متابعة التصميم وإكمال الخطوات
              </Link>
            ) : (
              <p className="text-muted mb-4">هذه الدعوة مكتملة الدفع ومقفلة من التعديل.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

