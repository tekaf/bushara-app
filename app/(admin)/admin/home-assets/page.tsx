'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, ImageUp, Save } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

type AssetKind = 'hero' | 'contact' | 'brandLogo'

export default function HomeAssetsAdminPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState<AssetKind | null>(null)
  const [heroImageUrl, setHeroImageUrl] = useState('')
  const [contactPreviewImageUrl, setContactPreviewImageUrl] = useState('')
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [heroFile, setHeroFile] = useState<File | null>(null)
  const [contactFile, setContactFile] = useState<File | null>(null)
  const [brandLogoFile, setBrandLogoFile] = useState<File | null>(null)

  const canUploadHero = useMemo(() => !!heroFile && !submitting, [heroFile, submitting])
  const canUploadContact = useMemo(() => !!contactFile && !submitting, [contactFile, submitting])
  const canUploadBrandLogo = useMemo(() => !!brandLogoFile && !submitting, [brandLogoFile, submitting])

  const loadAssets = async () => {
    if (!user) return
    try {
      const token = await user.getIdToken()
      const response = await fetch('/api/admin/home-assets', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to load home assets')
      setHeroImageUrl(String(data?.heroImageUrl || ''))
      setContactPreviewImageUrl(String(data?.contactPreviewImageUrl || data?.previousInviteImageUrl || ''))
      setBrandLogoUrl(String(data?.brandLogoUrl || ''))
    } catch (error) {
      console.error('Failed to load home assets:', error)
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
    loadAssets()
  }, [authLoading, isAdmin, user])

  const uploadAsset = async (kind: AssetKind) => {
    if (!user) return
    const file = kind === 'hero' ? heroFile : kind === 'contact' ? contactFile : brandLogoFile
    if (!file) return
    try {
      setSubmitting(kind)
      const token = await user.getIdToken()
      const formData = new FormData()
      formData.append('kind', kind)
      formData.append('file', file)
      const response = await fetch('/api/admin/home-assets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to upload')
      if (kind === 'hero') {
        setHeroImageUrl(String(data?.url || ''))
        setHeroFile(null)
        const input = document.getElementById('home-asset-hero') as HTMLInputElement | null
        if (input) input.value = ''
      } else if (kind === 'contact') {
        setContactPreviewImageUrl(String(data?.url || ''))
        setContactFile(null)
        const input = document.getElementById('home-asset-contact') as HTMLInputElement | null
        if (input) input.value = ''
      } else {
        setBrandLogoUrl(String(data?.url || ''))
        setBrandLogoFile(null)
        const input = document.getElementById('home-asset-brand-logo') as HTMLInputElement | null
        if (input) input.value = ''
      }
      alert('تم الرفع بأعلى جودة وحفظ الصورة بنجاح')
    } catch (error: any) {
      alert(error?.message || 'فشل الرفع')
    } finally {
      setSubmitting(null)
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
            {!user ? 'You must be logged in to access this page.' : 'Your account does not have admin access.'}
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
        <div className="bg-white rounded-2xl p-6 shadow-sm flex items-center gap-4">
          <Link href="/admin" className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold">صور الصفحة الرئيسية</h1>
            <p className="text-muted">رفع صورة فقرة البداية + صورة فقرة نموذج دعوة سابقة + شعار بشاره (PNG).</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-bold">صورة بداية الموقع (Hero)</h2>
            <p className="text-sm text-muted">ستظهر بدل المربع في بداية الصفحة الرئيسية.</p>
            <div className="aspect-square rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
              {heroImageUrl ? (
                <img src={heroImageUrl} alt="Hero Asset" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted">لا توجد صورة حالياً</div>
              )}
            </div>
            <input
              id="home-asset-hero"
              type="file"
              accept="image/*"
              onChange={(e) => setHeroFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
            />
            <button
              type="button"
              onClick={() => uploadAsset('hero')}
              disabled={!canUploadHero}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting === 'hero' ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  جاري الرفع...
                </>
              ) : (
                <>
                  <ImageUp className="w-5 h-5" />
                  رفع صورة البداية
                </>
              )}
            </button>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-bold">صورة Contact Preview</h2>
            <p className="text-sm text-muted">ستظهر في قسم التواصل داخل الصفحة الرئيسية.</p>
            <div className="aspect-[9/16] rounded-xl border border-gray-200 overflow-hidden bg-gray-50">
              {contactPreviewImageUrl ? (
                <img src={contactPreviewImageUrl} alt="Contact Preview Asset" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted">لا توجد صورة حالياً</div>
              )}
            </div>
            <input
              id="home-asset-contact"
              type="file"
              accept="image/*"
              onChange={(e) => setContactFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
            />
            <button
              type="button"
              onClick={() => uploadAsset('contact')}
              disabled={!canUploadContact}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting === 'contact' ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  جاري الرفع...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  رفع صورة التواصل
                </>
              )}
            </button>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
            <h2 className="text-xl font-bold">شعار بشاره (PNG)</h2>
            <p className="text-sm text-muted">يستخدم في الشعار الرئيسي داخل واجهات الموقع.</p>
            <div className="aspect-square rounded-xl border border-gray-200 overflow-hidden bg-gray-50 p-4">
              {brandLogoUrl ? (
                <img src={brandLogoUrl} alt="Bushara Logo" className="w-full h-full object-contain" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted">لا يوجد شعار مرفوع حالياً</div>
              )}
            </div>
            <input
              id="home-asset-brand-logo"
              type="file"
              accept="image/png"
              onChange={(e) => setBrandLogoFile(e.target.files?.[0] || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
            />
            <button
              type="button"
              onClick={() => uploadAsset('brandLogo')}
              disabled={!canUploadBrandLogo}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting === 'brandLogo' ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  جاري الرفع...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  رفع شعار بشاره
                </>
              )}
            </button>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-2">الأعمال السابقة المنفذة</h2>
          <p className="text-sm text-muted mb-4">
            لإدارة صور الدعوات المنفذة التي تظهر في قسم &quot;نماذج من أعمالنا&quot; استخدم صفحة الأعمال السابقة.
          </p>
          <Link
            href="/admin/previous-examples"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 font-semibold text-white hover:bg-accent"
          >
            إدارة الأعمال السابقة
          </Link>
        </div>
      </div>
    </div>
  )
}

