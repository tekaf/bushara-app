'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { useRouter } from 'next/navigation'
import { Upload, Settings, Grid, Palette, Type, FileImage, Bot, Images, ImagePlus, ClipboardCheck } from 'lucide-react'
import Link from 'next/link'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

export default function AdminDashboardPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const isAdmin = isAdminEmailClient(user?.email)

  // Require Firebase authentication
  if (authLoading) {
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
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">لوحة تحكم الإدارة</h1>
          <p className="text-muted">إدارة التصاميم والنماذج والإعدادات</p>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Upload Templates Section */}
          <Link
            href="/admin/templates"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                <Upload className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">رفع التصاميم</h2>
                <p className="text-sm text-muted">إضافة تصميمات جديدة</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              ارفع تصميمات خلفية جديدة وقم بتصنيفها حسب النوع (A, B, C)
            </p>
          </Link>

          {/* Edit Preset Type A */}
          <Link
            href="/admin/presets/A"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                <Settings className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">تعديل النموذج A</h2>
                <p className="text-sm text-muted">تصميم بسيط / حر</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              تعديل مواضع النصوص، الألوان، وأحجام الخطوط لجميع التصاميم من النوع A
            </p>
          </Link>

          {/* Edit Preset Type B */}
          <Link
            href="/admin/presets/B"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                <Grid className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">تعديل النموذج B</h2>
                <p className="text-sm text-muted">عقد قران / خطوبة / ملكة</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              تعديل مواضع النصوص، الألوان، وأحجام الخطوط لجميع التصاميم من النوع B
            </p>
          </Link>

          {/* Edit Preset Type C */}
          <Link
            href="/admin/presets/C"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition-colors">
                <Palette className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">تعديل النموذج C</h2>
                <p className="text-sm text-muted">زخرفة في الأسفل</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              تعديل مواضع النصوص، الألوان، وأحجام الخطوط لجميع التصاميم من النوع C
            </p>
          </Link>

          {/* View All Templates */}
          <Link
            href="/admin/templates/list"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-gray-100 rounded-lg group-hover:bg-gray-200 transition-colors">
                <FileImage className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">عرض جميع التصاميم</h2>
                <p className="text-sm text-muted">قائمة التصاميم</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              عرض وإدارة جميع التصاميم المرفوعة (قديم وجديد)
            </p>
          </Link>

          <Link
            href="/admin/previous-examples"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-fuchsia-100 rounded-lg group-hover:bg-fuchsia-200 transition-colors">
                <Images className="w-6 h-6 text-fuchsia-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">الدعوات السابقة</h2>
                <p className="text-sm text-muted">محتوى شريط الصفحة الرئيسية</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              ارفع أعمالًا سابقة (PDF/صور) لتظهر تلقائيًا في شريط نماذج الأعمال.
            </p>
          </Link>

          <Link
            href="/admin/home-assets"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-cyan-100 rounded-lg group-hover:bg-cyan-200 transition-colors">
                <ImagePlus className="w-6 h-6 text-cyan-700" />
              </div>
              <div>
                <h2 className="text-xl font-bold">صور الصفحة الرئيسية</h2>
                <p className="text-sm text-muted">Hero + نموذج دعوة سابقة</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              ارفع صور فقرة البداية ونموذج الدعوة السابقة بجودة أصلية عالية.
            </p>
          </Link>

          {/* Future: User Designs Management */}
          <div className="bg-gray-50 rounded-2xl p-6 border-2 border-dashed border-gray-300">
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-gray-200 rounded-lg">
                <Type className="w-6 h-6 text-gray-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-500">تصاميم المستخدمين</h2>
                <p className="text-sm text-gray-400">قريباً</p>
              </div>
            </div>
            <p className="text-gray-400 text-sm">
              إدارة وتعديل تصاميم المستخدمين يدوياً في حالة وجود مشاكل
            </p>
          </div>

          <Link
            href="/admin/invitations/review"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-amber-100 rounded-lg group-hover:bg-amber-200 transition-colors">
                <ClipboardCheck className="w-6 h-6 text-amber-700" />
              </div>
              <div>
                <h2 className="text-xl font-bold">ورشة التأكد</h2>
                <p className="text-sm text-muted">مراجعة الدعوات بعد الدفع</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              فتح قائمة الدعوات في مرحلة المراجعة الداخلية واعتمادها أو إرجاعها للتعديل.
            </p>
          </Link>

          <Link
            href="/admin/invitations"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-slate-100 rounded-lg group-hover:bg-slate-200 transition-colors">
                <ClipboardCheck className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <h2 className="text-xl font-bold">تشغيل الدعوات</h2>
                <p className="text-sm text-muted">logs/jobs/queue (إداري فقط)</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              صفحة داخلية لمتابعة التشغيل التقني للدعوات، منفصلة عن واجهة المستخدم النهائي.
            </p>
          </Link>

          <Link
            href="/admin/agent"
            className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-center gap-4 mb-4">
              <div className="p-3 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
                <Bot className="w-6 h-6 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold">العامل الذكي 24/7</h2>
                <p className="text-sm text-muted">تحليل المشروع تلقائيًا</p>
              </div>
            </div>
            <p className="text-muted text-sm">
              تقرير يومي ذكي لاكتشاف المخاطر والمتطلبات الناشئة مع اقتراحات تنفيذ.
            </p>
          </Link>
        </div>
      </div>
    </div>
  )
}
