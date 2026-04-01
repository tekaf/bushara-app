'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Template } from '@/lib/firebase/types'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import { Image as ImageIcon } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import StepperHeader from '@/components/flow/StepperHeader'
import TemplateGrid from '@/components/flow/TemplateGrid'
import { parsePackageFromParams, readPackageFromSessionStorage } from '@/lib/flow/package-selection'

function TemplatesPageContent() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [likedTemplateIds, setLikedTemplateIds] = useState<string[]>([])
  const [hasValidPackage, setHasValidPackage] = useState(false)
  const selectedOccasion = searchParams.get('occasion') || ''
  const packageGuests = searchParams.get('packageGuests') || ''
  const packagePrice = searchParams.get('packagePrice') || ''

  const occasionOptions: Array<{ label: string; value: string; type: 'A' | 'B' | 'C' }> = [
    { label: 'زواج أو ملكه', value: 'wedding', type: 'A' },
    { label: 'خطبة', value: 'engagement', type: 'B' },
    { label: 'مناسبة خاصة / عامة', value: 'special', type: 'C' },
  ]

  const selectedType = occasionOptions.find((item) => item.value === selectedOccasion)?.type

  const flowSteps = [
    { id: 1, label: 'نوع المناسبة' },
    { id: 2, label: 'اختيار القالب' },
    { id: 3, label: 'بيانات العروس والعريس' },
    { id: 4, label: 'تفاصيل المناسبة' },
    { id: 5, label: 'الدفع' },
  ]

  useEffect(() => {
    const selectedPackage = parsePackageFromParams(packageGuests, packagePrice)
    if (selectedPackage) {
      setHasValidPackage(true)
      return
    }

    const packageFromSession = readPackageFromSessionStorage()
    if (packageFromSession) {
      const params = new URLSearchParams()
      if (selectedOccasion) params.set('occasion', selectedOccasion)
      params.set('packageGuests', String(packageFromSession.guests))
      params.set('packagePrice', String(packageFromSession.price))
      router.replace(`/templates?${params.toString()}`)
      return
    }

    router.replace('/packages')
  }, [packageGuests, packagePrice, router, selectedOccasion])

  useEffect(() => {
    if (!hasValidPackage) return
    if (!selectedOccasion) {
      router.replace(`/occasions${packageGuests || packagePrice ? `?${new URLSearchParams({ ...(packageGuests ? { packageGuests } : {}), ...(packagePrice ? { packagePrice } : {}) }).toString()}` : ''}`)
      return
    }
    const fetchTemplates = async () => {
      try {
        // Fetch all templates and filter/sort on client side (avoids needing index)
        const q = query(
          collection(db, 'templates'),
          where('status', '==', 'published')
        )
        const snapshot = await getDocs(q)
        const templatesData = (snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
          })) as Template[])
          // Sort by createdAt descending on client side
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        setTemplates(templatesData)
      } catch (error) {
        console.error('Error fetching templates:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTemplates()
  }, [hasValidPackage, packageGuests, packagePrice, router, selectedOccasion])

  useEffect(() => {
    const loadLiked = async () => {
      if (!user) {
        setLikedTemplateIds([])
        return
      }
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid))
        const userData = userSnap.exists() ? (userSnap.data() as any) : {}
        setLikedTemplateIds(Array.isArray(userData?.likedTemplateIds) ? userData.likedTemplateIds : [])
      } catch (error) {
        console.error('Failed to load likes:', error)
      }
    }
    loadLiked()
  }, [user])

  const handleToggleLike = async (templateId: string) => {
    if (!user) {
      alert('سجل الدخول أولاً لاستخدام المفضلة')
      return
    }
    const alreadyLiked = likedTemplateIds.includes(templateId)
    const next = alreadyLiked
      ? likedTemplateIds.filter((id) => id !== templateId)
      : [...likedTemplateIds, templateId]
    setLikedTemplateIds(next)
    try {
      const userRef = doc(db, 'users', user.uid)
      await updateDoc(userRef, {
        likedTemplateIds: alreadyLiked ? arrayRemove(templateId) : arrayUnion(templateId),
      })
    } catch (error) {
      console.error('Failed to toggle like:', error)
      setLikedTemplateIds(likedTemplateIds)
    }
  }

  const filteredTemplates = selectedType
    ? templates.filter((template) => template.type === selectedType)
    : []

  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen">
        <div className="container mx-auto">
          {!hasValidPackage ? (
            <div className="rounded-2xl bg-white p-8 shadow text-center text-muted">
              جارٍ التحقق من الباقة المختارة...
            </div>
          ) : (
            <>
              <StepperHeader steps={flowSteps} activeStep={2} />
              <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold mb-4">اختر تصميمك</h1>
                <p className="text-xl text-muted">
                  اختر نوع المناسبة أولاً، ثم سنعرض لك النماذج المناسبة فقط
                </p>
                {(packageGuests || packagePrice) && (
                  <div className="mt-4 inline-flex gap-2 rounded-xl border border-primary/20 bg-primarySoft px-4 py-2 text-sm">
                    <span>الباقة المختارة:</span>
                    {packageGuests && <span>{packageGuests} ضيف</span>}
                    {packagePrice && <span>- {packagePrice} ريال</span>}
                  </div>
                )}
              </div>

              <div className="mb-10">
                <Link
                  href={`/occasions${packageGuests ? `?packageGuests=${packageGuests}` : ''}${packagePrice ? `${packageGuests ? '&' : '?'}packagePrice=${packagePrice}` : ''}`}
                  className="inline-flex rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                >
                  تغيير نوع المناسبة
                </Link>
              </div>

              {loading ? (
                <div className="text-center py-20">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                  <p className="text-muted">جاري التحميل...</p>
                </div>
              ) : !selectedType ? (
                <div className="text-center py-20">
                  <p className="text-muted text-xl">اختر نوع المناسبة لعرض النماذج</p>
                </div>
              ) : filteredTemplates.length === 0 ? (
                <div className="text-center py-20">
                  <ImageIcon className="mx-auto text-muted mb-4" size={64} />
                  <p className="text-muted text-xl">لا توجد تصاميم متاحة لهذا النوع حالياً</p>
                </div>
              ) : (
                <TemplateGrid
                  templates={filteredTemplates}
                  selectedOccasion={selectedOccasion}
                  packageGuests={packageGuests}
                  packagePrice={packagePrice}
                  likedTemplateIds={likedTemplateIds}
                  onToggleLike={handleToggleLike}
                />
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}

export default function TemplatesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <TemplatesPageContent />
    </Suspense>
  )
}
