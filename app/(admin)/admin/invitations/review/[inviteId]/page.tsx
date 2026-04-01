'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

type ReviewPayload = {
  invite?: {
    id: string
    designId: string
    title: string
    orderNumber: string
    selectedOccasion: string
    groomName: string
    brideName: string
    date: string
    time: string
    locationName: string
    workflowStatus: string
    reviewStatus: string
    adminPreviewUrl: string
  }
  customer?: {
    uid: string
    name: string
    email: string
  } | null
  alen?: {
    status: string
    findings: string[]
    suggestions: string[]
  }
  reviews?: Array<{
    id: string
    action: string
    notes: string
    createdBy: string
    actorRole: string
    createdAt: string | null
  }>
}

export default function AdminReviewDetailPage() {
  const params = useParams()
  const router = useRouter()
  const inviteId = String(params?.inviteId || '')
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)

  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [payload, setPayload] = useState<ReviewPayload | null>(null)
  const [returnReason, setReturnReason] = useState('')
  const [approveNote, setApproveNote] = useState('')
  const [approveSuccess, setApproveSuccess] = useState(false)
  const [designerLoading, setDesignerLoading] = useState(false)
  const [designerSaving, setDesignerSaving] = useState(false)
  const [regeneratingPreview, setRegeneratingPreview] = useState(false)
  const [designer, setDesigner] = useState({
    layoutB: {
      groom: { xPx: 726, yPx: 539, fontSize: 54 },
      bride: { xPx: 126, yPx: 537, fontSize: 54 },
      date: { xPx: 461, yPx: 1301, fontSize: 24 },
    },
    blockStyleOverrides: {
      groom_name: { color: '#6B6B6B', fontFamily: 'Amiri', fontWeight: 400 },
      bride_name: { color: '#6B6B6B', fontFamily: 'Amiri', fontWeight: 400 },
      date: { color: '#6B6B6B', fontFamily: 'Montserrat', fontWeight: 400 },
    },
  })
  const [editForm, setEditForm] = useState({
    title: '',
    selectedOccasion: '',
    groomName: '',
    brideName: '',
    date: '',
    time: '',
    locationName: '',
  })

  const load = async () => {
    if (!user || !isAdmin || !inviteId) return
    try {
      setLoading(true)
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load review details')
      setPayload(data)
      const inv = data?.invite || {}
      setEditForm({
        title: String(inv.title || ''),
        selectedOccasion: String(inv.selectedOccasion || ''),
        groomName: String(inv.groomName || ''),
        brideName: String(inv.brideName || ''),
        date: String(inv.date || ''),
        time: String(inv.time || ''),
        locationName: String(inv.locationName || ''),
      })
    } catch (e: any) {
      setError(e?.message || 'Failed to load review details')
    } finally {
      setLoading(false)
    }
  }

  const loadDesigner = async () => {
    if (!user || !isAdmin || !inviteId) return
    try {
      setDesignerLoading(true)
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/designer`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load designer settings')
      const layout = data?.designer?.layoutB
      const styles = data?.designer?.blockStyleOverrides
      if (layout?.groom && layout?.bride && layout?.date) {
        setDesigner((prev) => ({ ...prev, layoutB: layout }))
      }
      if (styles) {
        setDesigner((prev) => ({ ...prev, blockStyleOverrides: { ...prev.blockStyleOverrides, ...styles } }))
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load designer settings')
    } finally {
      setDesignerLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, inviteId, isAdmin, user])

  useEffect(() => {
    if (!authLoading) loadDesigner()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, inviteId, isAdmin, user])

  const approveInvite = async () => {
    if (!user || !inviteId || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: approveNote }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to approve invite')
      setApproveSuccess(true)
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to approve invite')
      setApproveSuccess(false)
    } finally {
      setSubmitting(false)
    }
  }

  const returnInvite = async () => {
    if (!user || !inviteId || submitting) return
    if (!returnReason.trim()) {
      setError('سبب الإرجاع مطلوب')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/return`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: returnReason }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to return invite')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to return invite')
    } finally {
      setSubmitting(false)
    }
  }

  const saveEdits = async () => {
    if (!user || !inviteId || submitting) return
    setSubmitting(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/edit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to save edits')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to save edits')
    } finally {
      setSubmitting(false)
    }
  }

  const saveDesigner = async () => {
    if (!user || !inviteId || submitting || designerSaving) return
    setDesignerSaving(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/designer`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(designer),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to save designer settings')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to save designer settings')
    } finally {
      setDesignerSaving(false)
    }
  }

  const regeneratePreview = async () => {
    if (!user || !inviteId || regeneratingPreview) return
    setRegeneratingPreview(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch(
        `/api/admin/invitations/review/${encodeURIComponent(inviteId)}/regenerate-preview`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to regenerate preview')
      await load()
    } catch (e: any) {
      setError(e?.message || 'Failed to regenerate preview')
    } finally {
      setRegeneratingPreview(false)
    }
  }

  if (authLoading || loading) {
    return <div className="p-8 text-center text-muted">جاري تحميل الدعوة...</div>
  }

  if (!user || !isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-muted">غير مصرح بالدخول.</p>
        <Link href="/login" className="text-primary hover:text-accent">
          تسجيل الدخول
        </Link>
      </div>
    )
  }

  const invite = payload?.invite
  if (!invite) {
    return (
      <div className="p-8 text-center">
        <p className="mb-4 text-muted">الدعوة غير موجودة.</p>
        <button onClick={() => router.push('/admin/invitations/review')} className="text-primary hover:text-accent">
          العودة لقائمة المراجعة
        </button>
      </div>
    )
  }
  const isApproved =
    approveSuccess || invite.workflowStatus === 'approved' || invite.reviewStatus === 'approved'

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-3xl font-bold">مراجعة الدعوة</h1>
          <Link href="/admin/invitations/review" className="rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50">
            العودة للقائمة
          </Link>
        </div>
        {error ? <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 xl:col-span-1">
            <h2 className="mb-3 text-lg font-bold">بيانات الطلب</h2>
            <p className="mb-2 text-sm text-muted">رقم الطلب: {invite.orderNumber || '-'}</p>
            <div className="space-y-2">
              <input
                value={editForm.title}
                onChange={(event) => setEditForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="عنوان الدعوة"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={editForm.selectedOccasion}
                onChange={(event) => setEditForm((prev) => ({ ...prev, selectedOccasion: event.target.value }))}
                placeholder="نوع المناسبة"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={editForm.groomName}
                onChange={(event) => setEditForm((prev) => ({ ...prev, groomName: event.target.value }))}
                placeholder="اسم العريس"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={editForm.brideName}
                onChange={(event) => setEditForm((prev) => ({ ...prev, brideName: event.target.value }))}
                placeholder="اسم العروس"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={editForm.date}
                onChange={(event) => setEditForm((prev) => ({ ...prev, date: event.target.value }))}
                placeholder="التاريخ"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={editForm.time}
                onChange={(event) => setEditForm((prev) => ({ ...prev, time: event.target.value }))}
                placeholder="الوقت"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
              <input
                value={editForm.locationName}
                onChange={(event) => setEditForm((prev) => ({ ...prev, locationName: event.target.value }))}
                placeholder="المكان"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={saveEdits}
              disabled={submitting || isApproved}
              className="mt-3 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              حفظ التعديلات
            </button>
            <hr className="my-3" />
            <p className="text-sm">العميل: {payload?.customer?.name || '-'}</p>
            <p className="text-sm text-muted">{payload?.customer?.email || '-'}</p>
            <hr className="my-3" />
            <p className="text-sm">workflowStatus: {invite.workflowStatus || '-'}</p>
            <p className="text-sm">reviewStatus: {invite.reviewStatus || '-'}</p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 xl:col-span-1">
            <h2 className="mb-3 text-lg font-bold">فحص Alen (مساعد)</h2>
            <p className="mb-2 text-sm">الحالة: {payload?.alen?.status || '-'}</p>
            <div className="mb-3">
              <p className="mb-1 text-sm font-semibold">ملاحظات</p>
              <ul className="list-disc space-y-1 pr-5 text-sm text-textDark">
                {(payload?.alen?.findings || []).map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-1 text-sm font-semibold">اقتراحات</p>
              <ul className="list-disc space-y-1 pr-5 text-sm text-textDark">
                {(payload?.alen?.suggestions || []).map((item, idx) => (
                  <li key={`${item}-${idx}`}>{item}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 xl:col-span-1">
            <h2 className="mb-3 text-lg font-bold">المعاينة الداخلية (adminPreviewUrl)</h2>
            {invite.adminPreviewUrl ? (
              <div className="aspect-[9/16] overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
                <img src={invite.adminPreviewUrl} alt="Admin Preview" className="h-full w-full object-contain" />
              </div>
            ) : (
              <p className="text-sm text-red-600">لا يوجد adminPreviewUrl.</p>
            )}
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-gray-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold">ورشة التعديل المتقدم (نص/موقع/حجم/لون/خط)</h3>
            {invite.designId ? (
              <Link
                href={`/admin/templates/${encodeURIComponent(invite.designId)}/position-editor`}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                target="_blank"
              >
                فتح محرر النموذج الكامل
              </Link>
            ) : null}
          </div>
          <p className="mb-4 text-sm text-muted">
            عدّل الخصائص هنا ثم اضغط حفظ، وبعدها اضغط "تحديث صورة الدعوة" لتوليد معاينة داخلية جديدة.
          </p>
          {designerLoading ? <p className="mb-3 text-sm text-muted">جاري تحميل إعدادات المصمم...</p> : null}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {(['groom', 'bride', 'date'] as const).map((key) => (
              <div key={key} className="rounded-xl border border-gray-200 p-3">
                <p className="mb-2 font-semibold">{key === 'groom' ? 'العريس' : key === 'bride' ? 'العروس' : 'التاريخ'}</p>
                <div className="space-y-2">
                  <input
                    type="number"
                    value={designer.layoutB[key].xPx}
                    onChange={(event) =>
                      setDesigner((prev) => ({
                        ...prev,
                        layoutB: {
                          ...prev.layoutB,
                          [key]: { ...prev.layoutB[key], xPx: Number(event.target.value || 0) },
                        },
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    placeholder="X"
                  />
                  <input
                    type="number"
                    value={designer.layoutB[key].yPx}
                    onChange={(event) =>
                      setDesigner((prev) => ({
                        ...prev,
                        layoutB: {
                          ...prev.layoutB,
                          [key]: { ...prev.layoutB[key], yPx: Number(event.target.value || 0) },
                        },
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    placeholder="Y"
                  />
                  <input
                    type="number"
                    value={designer.layoutB[key].fontSize}
                    onChange={(event) =>
                      setDesigner((prev) => ({
                        ...prev,
                        layoutB: {
                          ...prev.layoutB,
                          [key]: { ...prev.layoutB[key], fontSize: Number(event.target.value || 0) },
                        },
                      }))
                    }
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    placeholder="Font size"
                  />
                </div>
                <hr className="my-2" />
                <div className="space-y-2">
                  <input
                    value={
                      designer.blockStyleOverrides[key === 'groom' ? 'groom_name' : key === 'bride' ? 'bride_name' : 'date']
                        ?.fontFamily || ''
                    }
                    onChange={(event) => {
                      const blockId = key === 'groom' ? 'groom_name' : key === 'bride' ? 'bride_name' : 'date'
                      setDesigner((prev) => ({
                        ...prev,
                        blockStyleOverrides: {
                          ...prev.blockStyleOverrides,
                          [blockId]: {
                            ...(prev.blockStyleOverrides as any)[blockId],
                            fontFamily: event.target.value,
                          },
                        },
                      }))
                    }}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    placeholder="Font family"
                  />
                  <input
                    value={
                      designer.blockStyleOverrides[key === 'groom' ? 'groom_name' : key === 'bride' ? 'bride_name' : 'date']
                        ?.color || ''
                    }
                    onChange={(event) => {
                      const blockId = key === 'groom' ? 'groom_name' : key === 'bride' ? 'bride_name' : 'date'
                      setDesigner((prev) => ({
                        ...prev,
                        blockStyleOverrides: {
                          ...prev.blockStyleOverrides,
                          [blockId]: {
                            ...(prev.blockStyleOverrides as any)[blockId],
                            color: event.target.value,
                          },
                        },
                      }))
                    }}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    placeholder="#6B6B6B"
                  />
                  <input
                    type="number"
                    value={
                      designer.blockStyleOverrides[key === 'groom' ? 'groom_name' : key === 'bride' ? 'bride_name' : 'date']
                        ?.fontWeight || 400
                    }
                    onChange={(event) => {
                      const blockId = key === 'groom' ? 'groom_name' : key === 'bride' ? 'bride_name' : 'date'
                      setDesigner((prev) => ({
                        ...prev,
                        blockStyleOverrides: {
                          ...prev.blockStyleOverrides,
                          [blockId]: {
                            ...(prev.blockStyleOverrides as any)[blockId],
                            fontWeight: Number(event.target.value || 400),
                          },
                        },
                      }))
                    }}
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                    placeholder="400"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={saveDesigner}
              disabled={designerSaving || isApproved}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {designerSaving ? 'جاري حفظ إعدادات المصمم...' : 'حفظ إعدادات المصمم'}
            </button>
            <button
              onClick={regeneratePreview}
              disabled={regeneratingPreview}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {regeneratingPreview ? 'جاري تحديث صورة الدعوة...' : 'تحديث صورة الدعوة'}
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="mb-2 font-bold">اعتماد الدعوة</h3>
            <textarea
              value={approveNote}
              onChange={(event) => setApproveNote(event.target.value)}
              placeholder="ملاحظة اعتماد (اختياري)"
              className="mb-3 h-24 w-full rounded-lg border border-gray-300 p-3"
              disabled={isApproved}
            />
            {isApproved ? (
              <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 font-semibold text-green-700">
                تم الاعتماد
              </div>
            ) : (
              <button
                onClick={approveInvite}
                disabled={submitting}
                className="rounded-lg bg-green-600 px-5 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-60"
              >
                اعتماد
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <h3 className="mb-2 font-bold">إرجاع للتعديل</h3>
            <textarea
              value={returnReason}
              onChange={(event) => setReturnReason(event.target.value)}
              placeholder="سبب الإرجاع (مطلوب)"
              className="mb-3 h-24 w-full rounded-lg border border-gray-300 p-3"
            />
            <button
              onClick={returnInvite}
              disabled={submitting}
              className="rounded-lg bg-amber-600 px-5 py-3 font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
            >
              إرجاع للتعديل
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

