'use client'

import { useState, useEffect } from 'react'
import { collection, getDocs, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'
import type { Template } from '@/lib/firebase/types'
import { ArrowLeft, Edit, Eye, Image as ImageIcon, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function TemplatesListPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)
  const router = useRouter()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return

    async function loadTemplates() {
      try {
        const q = query(collection(db, 'templates'), orderBy('createdAt', 'desc'))
        const querySnapshot = await getDocs(q)
        const templatesData = querySnapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        })) as Template[]

        setTemplates(templatesData)
      } catch (error) {
        console.error('Error loading templates:', error)
      } finally {
        setLoading(false)
      }
    }

    if (user && isAdmin) {
      loadTemplates()
    } else {
      setLoading(false)
    }
  }, [user, authLoading, isAdmin])

  const handleDeleteTemplate = async (template: Template) => {
    if (!user) return
    const confirmed = window.confirm(
      `هل أنت متأكد من حذف التصميم "${template.name}"؟\nسيتم حذف ملفات التصميم نهائياً.`
    )
    if (!confirmed) return

    try {
      setDeletingId(template.id)
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/templates/${template.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await response.json()
      if (!response.ok) {
        throw new Error(data?.error || 'فشل حذف التصميم')
      }

      setTemplates((prev) => prev.filter((item) => item.id !== template.id))
    } catch (error: any) {
      alert(`خطأ في الحذف: ${error?.message || 'حدث خطأ غير متوقع'}`)
    } finally {
      setDeletingId(null)
    }
  }

  // Auth check
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 mb-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-3xl font-bold">جميع التصاميم</h1>
                <p className="text-muted">عرض وإدارة جميع التصاميم المرفوعة</p>
              </div>
            </div>
            <Link
              href="/admin/templates"
              className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-accent transition-colors"
            >
              رفع تصميم جديد
            </Link>
          </div>
        </div>

        {/* Templates Grid */}
        {templates.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center">
            <ImageIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">لا توجد تصاميم</h2>
            <p className="text-muted mb-6">ابدأ برفع تصميم جديد</p>
            <Link
              href="/admin/templates"
              className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-accent transition-colors inline-block"
            >
              رفع تصميم جديد
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="aspect-[9/16] bg-gray-100 rounded-lg mb-4 overflow-hidden">
                  {template.assets.thumbUrl ? (
                    <img
                      src={template.assets.thumbUrl}
                      alt={template.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-gray-400">
                      <ImageIcon className="w-12 h-12" />
                    </div>
                  )}
                </div>
                <h3 className="font-bold text-lg mb-2">{template.name}</h3>
                <div className="flex items-center gap-2 mb-4">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      template.type === 'A'
                        ? 'bg-purple-100 text-purple-700'
                        : template.type === 'B'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}
                  >
                    النوع {template.type}
                  </span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      template.status === 'published'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {template.status === 'published' ? 'منشور' : 'مسودة'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/admin/presets/${template.type}?templateId=${template.id}&templateName=${encodeURIComponent(template.name)}`}
                    className="flex-1 bg-violet-50 text-violet-700 px-4 py-2 rounded-lg font-semibold hover:bg-violet-100 transition-colors text-center text-sm flex items-center justify-center gap-2"
                  >
                    <Edit className="w-4 h-4" />
                    تعديل النصوص
                  </Link>
                  {template.type === 'B' && (
                    <Link
                      href={`/admin/templates/${template.id}/position-editor`}
                      className="flex-1 bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-accent transition-colors text-center text-sm flex items-center justify-center gap-2"
                    >
                      <Edit className="w-4 h-4" />
                      تعديل المواضع
                    </Link>
                  )}
                  <Link
                    href={`/templates/${template.id}`}
                    className="flex-1 bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors text-center text-sm flex items-center justify-center gap-2"
                  >
                    <Eye className="w-4 h-4" />
                    عرض
                  </Link>
                </div>
                <button
                  onClick={() => handleDeleteTemplate(template)}
                  disabled={deletingId === template.id}
                  className="mt-2 w-full bg-red-50 text-red-700 px-4 py-2 rounded-lg font-semibold hover:bg-red-100 transition-colors text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" />
                  {deletingId === template.id ? 'جاري الحذف...' : 'حذف التصميم'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
