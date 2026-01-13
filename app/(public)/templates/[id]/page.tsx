'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Template } from '@/lib/firebase/types'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import { ArrowLeft, Download, Eye } from 'lucide-react'
import Link from 'next/link'

export default function TemplateDetailPage() {
  const params = useParams()
  const templateId = params.id as string
  const [template, setTemplate] = useState<Template | null>(null)
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [finalUrl, setFinalUrl] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    groomNameAr: '',
    brideNameAr: '',
    groomNameEn: '',
    brideNameEn: '',
    dateText: '',
    venueText: '',
  })

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const docRef = doc(db, 'templates', templateId)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          setTemplate({
            id: docSnap.id,
            ...docSnap.data(),
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
            updatedAt: docSnap.data().updatedAt?.toDate() || new Date(),
          } as Template)
        }
      } catch (error) {
        console.error('Error fetching template:', error)
      } finally {
        setLoading(false)
      }
    }

    if (templateId) {
      fetchTemplate()
    }
  }, [templateId])

  const handlePreview = async () => {
    setRendering(true)
    try {
      console.log('📤 [CLIENT] Sending preview request...', { templateId, fields: formData })
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          variant: 'whatsapp_1080x1920',
          fields: formData,
        }),
      })
      
      console.log('📤 [CLIENT] Response status:', response.status)
      
      const data = await response.json()
      console.log('📤 [CLIENT] Response data:', data)
      
      if (!response.ok) {
        const errorMsg = data.error || `Server error: ${response.status}`
        console.error('❌ [CLIENT] Preview error:', errorMsg)
        alert(`خطأ في المعاينة: ${errorMsg}`)
        return
      }
      
      if (data.url) {
        console.log('✅ [CLIENT] Preview URL:', data.url)
        setPreviewUrl(data.url)
      } else {
        console.error('❌ [CLIENT] No URL in response')
        alert('خطأ: لم يتم إنشاء رابط المعاينة')
      }
    } catch (error: any) {
      console.error('❌ [CLIENT] Error rendering preview:', error)
      alert(`خطأ في المعاينة: ${error.message || 'حدث خطأ غير متوقع'}`)
    } finally {
      setRendering(false)
    }
  }

  const handleGenerateFinal = async () => {
    setRendering(true)
    try {
      console.log('📤 [CLIENT] Sending final render request...', { templateId, fields: formData })
      const response = await fetch('/api/render/final', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          variant: 'whatsapp_1080x1920',
          fields: formData,
        }),
      })
      
      console.log('📤 [CLIENT] Response status:', response.status)
      
      const data = await response.json()
      console.log('📤 [CLIENT] Response data:', data)
      
      if (!response.ok) {
        const errorMsg = data.error || `Server error: ${response.status}`
        console.error('❌ [CLIENT] Final render error:', errorMsg)
        alert(`خطأ في الإنشاء: ${errorMsg}`)
        return
      }
      
      if (data.url) {
        console.log('✅ [CLIENT] Final URL:', data.url)
        setFinalUrl(data.url)
      } else {
        console.error('❌ [CLIENT] No URL in response')
        alert('خطأ: لم يتم إنشاء رابط الصورة النهائية')
      }
    } catch (error: any) {
      console.error('❌ [CLIENT] Error rendering final:', error)
      alert(`خطأ في الإنشاء: ${error.message || 'حدث خطأ غير متوقع'}`)
    } finally {
      setRendering(false)
    }
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center pt-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted">جاري التحميل...</p>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  if (!template) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center pt-32">
          <div className="text-center">
            <p className="text-muted mb-4">التصميم غير موجود</p>
            <Link href="/templates" className="text-primary hover:text-accent">
              العودة للقائمة
            </Link>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen">
        <div className="container mx-auto max-w-4xl">
          <Link
            href="/templates"
            className="inline-flex items-center gap-2 text-muted hover:text-primary transition-colors mb-6"
          >
            <ArrowLeft size={20} />
            العودة للقائمة
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Form */}
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold mb-6">معلومات الدعوة</h2>
              <form className="space-y-4">
                <div>
                  <label className="block mb-2 font-semibold">اسم العريس (عربي)</label>
                  <input
                    type="text"
                    value={formData.groomNameAr}
                    onChange={(e) =>
                      setFormData({ ...formData, groomNameAr: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="مثال: سعود"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold">اسم العروس (عربي)</label>
                  <input
                    type="text"
                    value={formData.brideNameAr}
                    onChange={(e) =>
                      setFormData({ ...formData, brideNameAr: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="مثال: هاجر"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold">اسم العريس (إنجليزي) - اختياري</label>
                  <input
                    type="text"
                    value={formData.groomNameEn}
                    onChange={(e) =>
                      setFormData({ ...formData, groomNameEn: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="e.g., Saud"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold">اسم العروس (إنجليزي) - اختياري</label>
                  <input
                    type="text"
                    value={formData.brideNameEn}
                    onChange={(e) =>
                      setFormData({ ...formData, brideNameEn: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="e.g., Hajar"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold">التاريخ</label>
                  <input
                    type="text"
                    value={formData.dateText}
                    onChange={(e) =>
                      setFormData({ ...formData, dateText: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="مثال: يوم الجمعة 15 مارس 2024"
                  />
                </div>

                <div>
                  <label className="block mb-2 font-semibold">المكان</label>
                  <input
                    type="text"
                    value={formData.venueText}
                    onChange={(e) =>
                      setFormData({ ...formData, venueText: e.target.value })
                    }
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                    placeholder="مثال: قاعة الأفراح - الرياض"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={handlePreview}
                    disabled={rendering}
                    className="flex-1 bg-primarySoft text-primary py-3 rounded-lg font-semibold hover:bg-primary/10 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    <Eye size={20} />
                    معاينة
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateFinal}
                    disabled={rendering}
                    className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {rendering ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        جاري...
                      </>
                    ) : (
                      <>
                        <Download size={20} />
                        إنشاء نهائي
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Preview */}
            <div className="bg-white rounded-2xl p-8 shadow-lg">
              <h2 className="text-2xl font-bold mb-6">المعاينة</h2>
              {previewUrl || finalUrl ? (
                <div className="space-y-4">
                  <div className="aspect-[9/16] bg-bg rounded-lg overflow-hidden">
                    <img
                      src={finalUrl || previewUrl || ''}
                      alt="Preview"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  {(finalUrl || previewUrl) && (
                    <a
                      href={finalUrl || previewUrl || ''}
                      download
                      className="block w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors text-center flex items-center justify-center gap-2"
                    >
                      <Download size={20} />
                      تحميل الصورة
                    </a>
                  )}
                </div>
              ) : (
                <div className="aspect-[9/16] bg-bg rounded-lg flex items-center justify-center text-muted">
                  <p>لا توجد معاينة بعد</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

