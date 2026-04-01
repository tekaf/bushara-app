'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'
import type { TemplateType } from '@/lib/template-presets/types'
import { Upload, Save, X } from 'lucide-react'

export default function AdminTemplatesPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    type: 'A' as TemplateType,
    backgroundFile: null as File | null,
  })
  const [preview, setPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

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

  const processFile = (file: File) => {
    if (file.type !== 'application/pdf') {
      alert('ارفع PDF من PowerPoint للحصول على أفضل جودة')
      setPreview(null)
      return
    }

    setFormData({ ...formData, backgroundFile: file })
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const removeFile = () => {
    setFormData({ ...formData, backgroundFile: null })
    setPreview(null)
    // Reset file input
    const fileInput = document.getElementById('background-upload') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.backgroundFile) {
      alert('الرجاء رفع ملف')
      return
    }

    setLoading(true)
    try {
      const templateId = crypto.randomUUID()
      const isPdf = formData.backgroundFile.type === 'application/pdf'
      if (!isPdf) {
        throw new Error('Only PDF is allowed')
      }

      // Upload PDF and let the server generate final PNG + thumbnail + Firestore document.
      console.log('📤 [CLIENT] Starting upload...', {
        templateId,
        fileName: formData.backgroundFile.name,
        fileSize: formData.backgroundFile.size,
      })

      const uploadFormData = new FormData()
      uploadFormData.append('file', formData.backgroundFile)
      uploadFormData.append('templateId', templateId)
      uploadFormData.append('name', formData.name)
      uploadFormData.append('type', formData.type)

      const uploadResponse = await fetch('/api/upload-template', {
        method: 'POST',
        body: uploadFormData,
      })

      console.log('📤 [CLIENT] Response status:', uploadResponse.status)
      console.log('📤 [CLIENT] Response ok:', uploadResponse.ok)

      const responseData = await uploadResponse.json()
      console.log('📤 [CLIENT] Response JSON:', responseData)

      if (!uploadResponse.ok) {
        const errorMsg = responseData.error || 'فشل رفع الملف'
        console.error('❌ [CLIENT] Upload error:', responseData)
        throw new Error(errorMsg)
      }

      const { backgroundUrl, backgroundPdfUrl, thumbUrl } = responseData
      console.log('✅ [CLIENT] Upload successful:', {
        backgroundPdfUrl,
        backgroundUrl,
        thumbUrl,
      })

      // If Type B, offer to edit positions
      if (formData.type === 'B') {
        const editPositions = confirm('✅ تم رفع التصميم بنجاح!\n\nهل تريد تعديل مواضع العناصر الآن؟')
        if (editPositions) {
          window.location.href = `/admin/templates/${templateId}/position-editor`
          return
        }
      }

      console.log('✅ [CLIENT] Upload completed successfully')
      alert('✅ تم رفع التصميم بنجاح!')
      setFormData({ name: '', type: 'A', backgroundFile: null })
      setPreview(null)
    } catch (error: any) {
      console.error('Error uploading template:', error)
      const errorMsg = error.message || 'حدث خطأ أثناء رفع التصميم'
      alert(`خطأ: ${errorMsg}\n\nتأكد من نشر قواعد Firebase Storage في Firebase Console.`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg p-4">
      <div className="container mx-auto max-w-2xl">
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h1 className="text-3xl font-bold mb-6">Upload Template</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block mb-2 font-semibold">Template Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="e.g., Elegant Wedding Design"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold">Template Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as TemplateType })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="A">Type A - Minimal</option>
                <option value="B">Type B - Top Decoration</option>
                <option value="C">Type C - Bottom Decoration</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-semibold">ملف التصميم (PDF فقط)</label>
              <p className="mb-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                ارفع PDF من PowerPoint للحصول على أفضل جودة.
              </p>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-300 hover:border-primary/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept="application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="background-upload"
                />
                {!formData.backgroundFile ? (
                  <label
                    htmlFor="background-upload"
                    className="cursor-pointer flex flex-col items-center gap-4"
                  >
                    <Upload className="text-primary" size={48} />
                    <span className="text-muted">
                      {isDragging
                        ? 'أفلت الملف هنا'
                        : 'اسحب الملف هنا أو انقر للرفع'}
                    </span>
                    <span className="text-sm text-gray-400">PDF فقط</span>
                  </label>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-semibold">
                        {formData.backgroundFile.name}
                      </span>
                      <button
                        type="button"
                        onClick={removeFile}
                        className="p-1 hover:bg-red-50 rounded-full transition-colors"
                        title="حذف الملف"
                      >
                        <X className="text-red-500" size={20} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {preview && (
                <div className="mt-4 relative">
                  <div className="w-full max-w-md mx-auto relative">
                    <button
                      type="button"
                      onClick={removeFile}
                      className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors z-10"
                      title="حذف الملف"
                    >
                      <X size={18} />
                    </button>
                    <iframe
                      src={preview}
                      className="w-full h-96 rounded-lg shadow border"
                      title="PDF Preview"
                    />
                    <p className="text-center text-muted mt-2">معاينة ملف PDF</p>
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Publish Template
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

