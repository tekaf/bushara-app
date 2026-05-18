'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'
import type { PreviousExample } from '@/lib/firebase/types'
import { ArrowDown, ArrowLeft, ArrowUp, Save, Trash2, Upload } from 'lucide-react'

type EditableExample = PreviousExample & { sortOrder: number }
type DraftFields = { title: string; sortOrder: string; status: 'draft' | 'published'; file: File | null }

export default function PreviousExamplesAdminPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [sortOrder, setSortOrder] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('published')
  const [file, setFile] = useState<File | null>(null)
  const [items, setItems] = useState<EditableExample[]>([])
  const [draftById, setDraftById] = useState<Record<string, DraftFields>>({})

  const canSubmit = useMemo(() => !!title.trim() && !!file && !submitting, [title, file, submitting])

  const loadItems = async () => {
    if (!user) return
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/admin/previous-examples', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'فشل تحميل الدعوات السابقة')
      }
      const rows: EditableExample[] = (data?.items || [])
        .map((item: any) => {
          return {
            id: item.id,
            title: item?.title || 'دعوة سابقة',
            sortOrder: Number.isFinite(Number(item?.sortOrder)) ? Number(item.sortOrder) : 9999,
            status: item?.status || 'published',
            sourceType: item?.sourceType || 'image',
            assets: item?.assets || {},
            createdAt: new Date(item?.createdAt || 0),
            updatedAt: new Date(item?.updatedAt || 0),
          } as EditableExample
        })
        .sort((a: EditableExample, b: EditableExample) => {
          if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder
          return b.createdAt.getTime() - a.createdAt.getTime()
        })
      setItems(rows)
      setDraftById(
        rows.reduce((acc: Record<string, DraftFields>, row: EditableExample) => {
          acc[row.id] = {
            title: row.title,
            sortOrder: String(row.sortOrder),
            status: row.status === 'draft' ? 'draft' : 'published',
            file: null,
          }
          return acc
        }, {})
      )
    } catch (error) {
      console.error('Failed to load previous examples:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (!user || !isAdmin) {
      setLoading(false)
      return
    }
    loadItems()
  }, [authLoading, isAdmin, user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || !canSubmit || !file) return

    try {
      setSubmitting(true)
      const token = await user.getIdToken()
      const formData = new FormData()
      formData.append('title', title.trim())
      if (sortOrder.trim()) {
        formData.append('sortOrder', sortOrder.trim())
      }
      formData.append('status', status)
      formData.append('file', file)

      const response = await fetch('/api/admin/previous-examples', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'فشل رفع الدعوة السابقة')
      }

      setTitle('')
      setSortOrder('')
      setStatus('published')
      setFile(null)
      const input = document.getElementById('previous-example-file') as HTMLInputElement | null
      if (input) input.value = ''
      await loadItems()
    } catch (error: any) {
      alert(error?.message || 'فشل الرفع')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateItem = async (id: string) => {
    if (!user) return
    const draft = draftById[id]
    if (!draft || !draft.title.trim()) {
      alert('يرجى إدخال اسم الدعوة')
      return
    }
    try {
      setSavingId(id)
      const token = await user.getIdToken()
      const formData = new FormData()
      formData.append('title', draft.title.trim())
      formData.append('sortOrder', draft.sortOrder || '9999')
      formData.append('status', draft.status || 'published')
      if (draft.file) {
        formData.append('file', draft.file)
      }
      const response = await fetch(`/api/admin/previous-examples/${id}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'فشل تحديث الدعوة')
      }
      await loadItems()
    } catch (error: any) {
      alert(error?.message || 'فشل التحديث')
    } finally {
      setSavingId(null)
    }
  }

  const bumpSortOrder = async (id: string, delta: number) => {
    const current = Number(draftById[id]?.sortOrder || 0)
    const next = String(current + delta)
    setDraftById((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { title: '', sortOrder: '0', status: 'published', file: null }), sortOrder: next },
    }))
  }

  const handleDelete = async (id: string) => {
    if (!user) return
    if (!window.confirm('هل تريد حذف هذه الدعوة السابقة؟')) return
    try {
      setDeletingId(id)
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/previous-examples/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'فشل الحذف')
      }
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (error: any) {
      alert(error?.message || 'فشل الحذف')
    } finally {
      setDeletingId(null)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
          <p className="text-muted mb-6">
            {!user
              ? 'You must be logged in to access this page.'
              : 'Your account is logged in, but does not have admin access.'}
          </p>
          <a
            href="/login"
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors inline-block"
          >
            {!user ? 'Go to Login' : 'Back to Home'}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/admin" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div>
              <h1 className="text-3xl font-bold">الدعوات السابقة</h1>
              <p className="text-muted">ارفع أعمالك السابقة لتظهر تلقائيًا في شريط الصفحة الرئيسية.</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="md:col-span-1">
              <label className="block mb-2 font-semibold">عنوان الدعوة</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                placeholder="مثال: دعوة عرس - قصر النخيل"
                required
              />
            </div>

            <div className="md:col-span-1">
              <label className="block mb-2 font-semibold">الملف</label>
              <input
                id="previous-example-file"
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                required
              />
              <p className="mt-2 text-xs text-muted">مدعوم: PDF / PNG / JPG / WEBP</p>
            </div>

            <div className="md:col-span-1">
              <label className="block mb-2 font-semibold">الترتيب</label>
              <input
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg"
                placeholder="مثال: 10"
              />
            </div>

            <div className="md:col-span-1">
              <label className="block mb-2 font-semibold">الحالة</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value === 'draft' ? 'draft' : 'published')}
                className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3"
              >
                <option value="published">منشورة</option>
                <option value="draft">غير منشورة</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  جاري الرفع...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  رفع وإضافة للشريط
                </>
              )}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-2xl p-6 shadow-sm">
          {items.length === 0 ? (
            <div className="text-center py-12 text-muted">
              <Upload className="w-10 h-10 mx-auto mb-3 opacity-70" />
              لا توجد دعوات سابقة مرفوعة حتى الآن.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-2xl border border-gray-200 overflow-hidden bg-white">
                  <div className="aspect-[9/16] bg-gray-100">
                    <img
                      src={item.assets.thumbUrl || item.assets.previewUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="text-xs text-muted">الترتيب الحالي: {item.sortOrder}</div>
                    <div className="text-xs">
                      <span
                        className={`rounded-full px-2 py-1 ${
                          item.status === 'published' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {item.status === 'published' ? 'منشورة' : 'غير منشورة'}
                      </span>
                    </div>
                    <input
                      type="text"
                      value={draftById[item.id]?.title || ''}
                      onChange={(e) =>
                        setDraftById((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...(prev[item.id] || { title: '', sortOrder: '9999', status: 'published', file: null }),
                            title: e.target.value,
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                      placeholder="اسم الدعوة"
                    />
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={draftById[item.id]?.sortOrder || '9999'}
                        onChange={(e) =>
                          setDraftById((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...(prev[item.id] || { title: '', sortOrder: '9999', status: 'published', file: null }),
                              sortOrder: e.target.value,
                            },
                          }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                        placeholder="الترتيب"
                      />
                      <select
                        value={draftById[item.id]?.status || 'published'}
                        onChange={(e) =>
                          setDraftById((prev) => ({
                            ...prev,
                            [item.id]: {
                              ...(prev[item.id] || { title: '', sortOrder: '9999', status: 'published', file: null }),
                              status: e.target.value === 'draft' ? 'draft' : 'published',
                            },
                          }))
                        }
                        className="rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white"
                      >
                        <option value="published">منشورة</option>
                        <option value="draft">غير منشورة</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => bumpSortOrder(item.id, -10)}
                        className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
                        title="تحريك للأعلى"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => bumpSortOrder(item.id, 10)}
                        className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
                        title="تحريك للأسفل"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                    </div>

                    <input
                      type="file"
                      accept=".pdf,image/*"
                      onChange={(e) =>
                        setDraftById((prev) => ({
                          ...prev,
                          [item.id]: {
                            ...(prev[item.id] || { title: '', sortOrder: '9999', status: 'published', file: null }),
                            file: e.target.files?.[0] || null,
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs bg-white"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleUpdateItem(item.id)}
                        disabled={savingId === item.id}
                        className="w-full bg-primary text-white text-sm py-2 rounded-lg hover:bg-accent transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                      >
                        <Save className="w-4 h-4" />
                        {savingId === item.id ? 'جاري الحفظ...' : 'حفظ'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="w-full bg-red-50 text-red-700 text-sm py-2 rounded-lg hover:bg-red-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" />
                        {deletingId === item.id ? 'جاري الحذف...' : 'حذف'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
