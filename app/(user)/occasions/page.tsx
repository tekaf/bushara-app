'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuth } from '@/lib/auth/context'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import StepperHeader from '@/components/flow/StepperHeader'
import OccasionSelector, { type OccasionOption } from '@/components/flow/OccasionSelector'
import { parsePackageFromParams, readPackageFromSessionStorage } from '@/lib/flow/package-selection'

const FLOW_STEPS = [
  { id: 1, label: 'نوع المناسبة' },
  { id: 2, label: 'اختيار القالب' },
  { id: 3, label: 'بيانات العروس والعريس' },
  { id: 4, label: 'تفاصيل المناسبة' },
  { id: 5, label: 'الدفع' },
]

const occasionOptions: OccasionOption[] = [
  { id: 'wedding', label: 'زواج أو ملكه', value: 'wedding', emoji: '💍', hint: 'دعوة زواج أو ملكة' },
  { id: 'khitbah', label: 'خطبة', value: 'engagement', emoji: '🤍', hint: 'دعوة خطوبة' },
  { id: 'special', label: 'مناسبة عامة', value: 'special', emoji: '🎉', hint: 'دعوة مناسبات خاصة' },
]

export default function OccasionsPage() {
  const { user } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [name, setName] = useState('')
  const [hasValidPackage, setHasValidPackage] = useState(false)
  const selectedOccasion = searchParams.get('occasion') || ''
  const packageGuests = searchParams.get('packageGuests') || ''
  const packagePrice = searchParams.get('packagePrice') || ''

  useEffect(() => {
    const selectedPackage = parsePackageFromParams(packageGuests, packagePrice)
    if (selectedPackage) {
      setHasValidPackage(true)
      return
    }

    const packageFromSession = readPackageFromSessionStorage()
    if (packageFromSession) {
      const params = new URLSearchParams()
      params.set('packageGuests', String(packageFromSession.guests))
      params.set('packagePrice', String(packageFromSession.price))
      if (selectedOccasion) params.set('occasion', selectedOccasion)
      router.replace(`/occasions?${params.toString()}`)
      return
    }

    router.replace('/packages')
  }, [packageGuests, packagePrice, router, selectedOccasion])

  useEffect(() => {
    const loadUser = async () => {
      if (!user) return
      const userSnap = await getDoc(doc(db, 'users', user.uid))
      const userData = userSnap.exists() ? (userSnap.data() as any) : {}
      setName(userData?.name || user.displayName || user.email?.split('@')[0] || 'ضيفنا')
    }
    loadUser()
  }, [user])

  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen bg-gradient-to-b from-white via-violet-50/20 to-white">
        <div className="container mx-auto max-w-6xl">
          {!hasValidPackage ? (
            <section className="rounded-3xl border border-violet-100 bg-white p-10 shadow-sm text-center text-muted">
              جارٍ التحقق من الباقة المختارة...
            </section>
          ) : (
            <>
          <StepperHeader steps={FLOW_STEPS} activeStep={1} />
          <section className="rounded-3xl border border-violet-100 bg-white p-6 md:p-8 shadow-sm mb-6">
            <h1 className="text-3xl md:text-4xl font-bold mb-2">بشارة .. لتخليد ذكرى سعيدة ✨</h1>
            <p className="text-lg text-textDark mb-2">حياك الله {name || 'عزيزنا'} عسى افراحكم تدوم ✨</p>
            <p className="text-sm text-muted">اختر المناسبة → اختر القالب → أدخل التفاصيل → ادفع</p>
            {(packageGuests || packagePrice) && (
              <div className="mt-4 inline-flex gap-2 rounded-xl border border-primary/20 bg-primarySoft px-4 py-2 text-sm">
                <span>الباقة المختارة:</span>
                {packageGuests && <span>{packageGuests} ضيف</span>}
                {packagePrice && <span>- {packagePrice} ريال</span>}
              </div>
            )}
          </section>

          <OccasionSelector
            options={occasionOptions}
            selectedOccasion={selectedOccasion}
            packageGuests={packageGuests}
            packagePrice={packagePrice}
          />
            </>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
