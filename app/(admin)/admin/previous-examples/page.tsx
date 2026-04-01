'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'
import type { PreviousExample } from '@/lib/firebase/types'
import { ArrowLeft, Save, Trash2, Upload } from 'lucide-react'

export default function PreviousExamplesAdminPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [items, setItems] = useState<PreviousExample[]>([])

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
      const rows = (data?.items || [])
        .map((item: any) => {
          return {
            id: item.id,
            title: item?.title || 'دعوة سابقة',
            status: item?.status || 'published',
            sourceType: item?.sourceType || 'image',
            assets: item?.assets || {},
            createdAt: new Date(item?.createdAt || 0),
            updatedAt: new Date(item?.updatedAt || 0),
          } as PreviousExample
        })
        .sort((a: PreviousExample, b: PreviousExample) => b.createdAt.getTime() - a.createdAt.getTime())
      setItems(rows)
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

            <button
              type="submit"
              disabled={!canSubmit}
              className="md:col-span-1 w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="aspect-[9/16] bg-gray-100">
                    <img
                      src={item.assets.thumbUrl || item.assets.previewUrl}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-2">
                    <div className="text-xs font-semibold truncate">{item.title}</div>
                    <button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      disabled={deletingId === item.id}
                      className="mt-2 w-full bg-red-50 text-red-700 text-xs py-1.5 rounded-md hover:bg-red-100 transition-colors disabled:opacity-60 flex items-center justify-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      {deletingId === item.id ? 'جاري الحذف...' : 'حذف'}
                    </button>
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
