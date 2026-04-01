'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft,
  Check,
  Copy,
  Gift,
  Loader2,
  ShieldCheck,
  Sparkles,
  Ticket,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { doc, setDoc } from 'firebase/firestore'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import { useAuth } from '@/lib/auth/context'
import { db } from '@/lib/firebase/config'
import {
  LAUNCH_DISCOUNT_PERCENT,
  PACKAGE_TIERS,
  getPackageTierBySize,
} from '@/lib/pricing/packages'

const OFFER_ENDS_AT = new Date('2026-03-31T23:59:59+03:00').getTime()

function formatSar(value: number) {
  return `${value} ر.س`
}

function PackagesPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const [selectedGuests, setSelectedGuests] = useState<number | null>(null)
  const [showDiscountOnly, setShowDiscountOnly] = useState(true)
  const [isCardsLoading, setIsCardsLoading] = useState(true)
  const [countdown, setCountdown] = useState('')

  const [giftGuests, setGiftGuests] = useState<number>(200)
  const [giftCheckoutLoading, setGiftCheckoutLoading] = useState(false)
  const [giftCheckoutError, setGiftCheckoutError] = useState('')
  const [giftCodeLoading, setGiftCodeLoading] = useState(false)
  const [giftCodeError, setGiftCodeError] = useState('')
  const [giftCode, setGiftCode] = useState('')
  const [giftCodePackageSize, setGiftCodePackageSize] = useState(0)
  const [giftCodePackagePrice, setGiftCodePackagePrice] = useState(0)

  const [redeemCode, setRedeemCode] = useState('')
  const [redeemLoading, setRedeemLoading] = useState(false)
  const [redeemError, setRedeemError] = useState('')
  const [redeemSuccess, setRedeemSuccess] = useState('')
  const [redeemPackageSize, setRedeemPackageSize] = useState(0)

  const giftSessionId = searchParams.get('giftSessionId') || ''
  const giftSuccess = searchParams.get('giftSuccess') === '1'
  const giftPending = giftSuccess && Boolean(giftSessionId)

  const displayPackages = useMemo(() => {
    const featured = PACKAGE_TIERS.find((pkg) => pkg.guests === 200)
    const rest = PACKAGE_TIERS.filter((pkg) => pkg.guests !== 200)
    if (!featured) return PACKAGE_TIERS
    return [rest[0], featured, ...rest.slice(1)]
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => setIsCardsLoading(false), 700)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    const updateCountdown = () => {
      const distance = OFFER_ENDS_AT - Date.now()
      if (distance <= 0) {
        setCountdown('ينتهي اليوم')
        return
      }
      const days = Math.floor(distance / (1000 * 60 * 60 * 24))
      const hours = Math.floor((distance / (1000 * 60 * 60)) % 24)
      const minutes = Math.floor((distance / (1000 * 60)) % 60)
      setCountdown(`${days} يوم • ${hours} ساعة • ${minutes} دقيقة`)
    }
    updateCountdown()
    const interval = window.setInterval(updateCountdown, 60_000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    const codeFromQuery = searchParams.get('redeemCode') || ''
    if (codeFromQuery) setRedeemCode(codeFromQuery)
    const giftPackageFromQuery = Number(searchParams.get('giftPackage') || 0)
    if (giftPackageFromQuery) {
      const tier = getPackageTierBySize(giftPackageFromQuery)
      if (tier) setGiftGuests(tier.guests)
    }
  }, [searchParams])

  useEffect(() => {
    if (!giftPending || !user) return
    let cancelled = false

    const fetchGiftCode = async () => {
      setGiftCodeLoading(true)
      setGiftCodeError('')
      try {
        const token = await user.getIdToken()
        const response = await fetch('/api/gifts/session-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionId: giftSessionId }),
        })
        const data = await response.json().catch(() => ({}))
        if (cancelled) return
        if (!response.ok) {
          setGiftCodeError(data?.error || 'تعذر تحميل كود الهدية حالياً.')
          return
        }
        if (!data?.ready) {
          setGiftCodeError('بانتظار تأكيد الدفع... حدّث الصفحة بعد لحظات.')
          return
        }
        setGiftCode(String(data?.code || ''))
        setGiftCodePackageSize(Number(data?.packageSize || 0))
        setGiftCodePackagePrice(Number(data?.packagePrice || 0))
      } catch {
        if (!cancelled) setGiftCodeError('تعذر تحميل كود الهدية حالياً.')
      } finally {
        if (!cancelled) setGiftCodeLoading(false)
      }
    }

    fetchGiftCode()
    return () => {
      cancelled = true
    }
  }, [giftPending, giftSessionId, user])

  const proceedWithPackage = async (guests: number, price: number) => {
    const packageData = {
      guests,
      price,
      selectedAt: new Date().toISOString(),
    }

    // Always keep a local copy so user continues flow even if not logged in yet.
    window.sessionStorage.setItem('bushara_selected_package', JSON.stringify(packageData))

    const nextOccasionPath = `/occasions?packageGuests=${guests}&packagePrice=${price}`

    // If user is logged in, continue flow immediately and persist in background.
    if (user) {
      router.push(nextOccasionPath)
      void setDoc(
        doc(db, 'users', user.uid),
        {
          selectedPackage: packageData,
          updatedAt: new Date(),
        },
        { merge: true }
      ).catch((error) => {
        console.error('Failed to save selected package in Firestore:', error)
      })
      return
    }

    // If not logged in, require login/register first, then continue to occasions.
    router.push(`/login?next=${encodeURIComponent(nextOccasionPath)}`)
  }

  const handleChoosePackage = async (guests: number, price: number) => {
    setSelectedGuests(guests)
    await proceedWithPackage(guests, price)
  }

  const handleGiftCheckout = async () => {
    if (giftCheckoutLoading) return
    const selectedTier = getPackageTierBySize(giftGuests)
    if (!selectedTier) return

    setGiftCheckoutError('')

    if (!user) {
      const nextPath = `/packages?giftPackage=${giftGuests}`
      router.push(`/login?next=${encodeURIComponent(nextPath)}`)
      return
    }

    try {
      setGiftCheckoutLoading(true)
      const token = await user.getIdToken()
      const response = await fetch('/api/gifts/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ packageSize: selectedTier.guests }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.checkoutUrl) {
        throw new Error(data?.error || 'تعذر بدء دفع الهدية حالياً.')
      }
      window.location.href = String(data.checkoutUrl)
    } catch (error: any) {
      setGiftCheckoutError(error?.message || 'تعذر بدء دفع الهدية حالياً.')
    } finally {
      setGiftCheckoutLoading(false)
    }
  }

  const handleRedeem = async () => {
    if (redeemLoading) return
    const normalizedCode = redeemCode.replace(/\s+/g, '').trim().toUpperCase()
    if (!normalizedCode) {
      setRedeemError('أدخل كود الهدية أولاً')
      setRedeemSuccess('')
      return
    }

    if (!user) {
      const nextPath = `/packages?redeemCode=${encodeURIComponent(normalizedCode)}`
      router.push(`/login?next=${encodeURIComponent(nextPath)}`)
      return
    }

    try {
      setRedeemLoading(true)
      setRedeemError('')
      setRedeemSuccess('')
      const token = await user.getIdToken()
      const response = await fetch('/api/gifts/redeem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ code: normalizedCode }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'الكود غير صالح أو مستخدم')
      }
      setRedeemPackageSize(Number(data?.packageSize || 0))
      setRedeemSuccess('تم تفعيل الباقة بنجاح ✅')
      setRedeemCode('')
    } catch (error: any) {
      setRedeemError(error?.message || 'الكود غير صالح أو مستخدم')
    } finally {
      setRedeemLoading(false)
    }
  }

  const selectedGiftTier = getPackageTierBySize(giftGuests)

  const copyGiftCode = async () => {
    if (!giftCode) return
    await navigator.clipboard.writeText(giftCode)
  }

  const copyWhatsappMessage = async () => {
    if (!giftCode || !giftCodePackageSize) return
    const message = `هديّة لك من بشارة 🎁\nهذا كود باقة ${giftCodePackageSize} ضيف:\n${giftCode}\nفعّلها من هنا: busharah.com/packages`
    await navigator.clipboard.writeText(message)
  }

  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen bg-gradient-to-b from-purple-50/60 via-white to-white">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primarySoft px-4 py-2 text-sm font-semibold text-primary mb-6">
              <Sparkles size={16} />
              خصم {LAUNCH_DISCOUNT_PERCENT}%
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-4">عرض الإطلاق 🔥 خصم 60% لفترة محدودة</h1>
            <p className="text-lg md:text-xl text-muted max-w-2xl mx-auto mb-4">
              أسعار بشارة حالياً غير طبيعية عشان نكسر السوق ✨
            </p>
            <div className="inline-flex items-center gap-2 rounded-2xl border border-primary/20 bg-white px-4 py-2 text-sm text-textDark shadow-sm">
              <ShieldCheck size={16} className="text-primary" />
              ينتهي العرض خلال: {countdown}
            </div>
          </motion.div>

          <div className="mb-8 flex justify-center">
            <label className="inline-flex cursor-pointer items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium shadow-sm">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary"
                checked={showDiscountOnly}
                onChange={(event) => setShowDiscountOnly(event.target.checked)}
              />
              عرض الأسعار بعد الخصم فقط
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            {isCardsLoading &&
              Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`sk-${index}`}
                  className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm animate-pulse"
                >
                  <div className="h-8 w-24 rounded bg-gray-200 mb-4 mx-auto" />
                  <div className="h-10 w-40 rounded bg-gray-200 mb-3 mx-auto" />
                  <div className="h-4 w-36 rounded bg-gray-100 mb-6 mx-auto" />
                  <div className="space-y-3 mb-8">
                    <div className="h-4 w-full rounded bg-gray-100" />
                    <div className="h-4 w-4/5 rounded bg-gray-100" />
                    <div className="h-4 w-3/4 rounded bg-gray-100" />
                  </div>
                  <div className="h-11 rounded bg-gray-200" />
                </div>
              ))}

            {!isCardsLoading &&
              displayPackages.map((pkg, index) => {
                const isFeatured = pkg.guests === 200
                const isSelected = selectedGuests === pkg.guests
                const savings = pkg.oldPrice - pkg.paidPrice

                return (
                  <motion.div
                    key={pkg.guests}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.07 }}
                    whileHover={{ y: -8, scale: 1.01 }}
                    className={`relative rounded-3xl bg-white p-8 border-2 transition-all duration-300 ${
                      isFeatured
                        ? 'border-primary shadow-xl lg:order-2'
                        : isSelected
                        ? 'border-primary/60 shadow-lg'
                        : 'border-gray-200 shadow-sm'
                    } ${isFeatured ? 'before:absolute before:inset-0 before:rounded-3xl before:bg-primary/5 before:blur-xl before:-z-10' : ''}`}
                  >
                    <div className="absolute top-4 left-4 rounded-full bg-primary text-white px-3 py-1 text-xs font-bold">
                      خصم {LAUNCH_DISCOUNT_PERCENT}%
                    </div>
                    {isFeatured && (
                      <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-purple-600 px-4 py-1 text-sm font-semibold text-white shadow-lg">
                        الأكثر طلباً ⭐
                      </div>
                    )}

                    <div className="text-center mb-8 mt-4">
                      <h3 className="text-4xl font-extrabold text-textDark leading-none mb-2">{pkg.guests}</h3>
                      <p className="text-sm text-muted">ضيف</p>

                      <div className="mt-5 flex items-end justify-center gap-2">
                        <span className="text-4xl font-black text-primary">{formatSar(pkg.paidPrice)}</span>
                      </div>

                      <div
                        className={`mt-2 ${
                          showDiscountOnly ? 'text-sm text-muted' : 'text-lg text-gray-600'
                        } line-through`}
                      >
                        {formatSar(pkg.oldPrice)}
                      </div>

                      <div className="mt-3 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                        وفرت {formatSar(savings)}
                      </div>
                    </div>

                    <ul className="space-y-3 mb-8 text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="text-primary flex-shrink-0" size={18} />
                        <span>QR فريد لكل ضيف</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="text-primary flex-shrink-0" size={18} />
                        <span>إرسال واتساب سريع</span>
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="text-primary flex-shrink-0" size={18} />
                        <span>إدارة حضور لحظية</span>
                      </li>
                    </ul>

                    <button
                      type="button"
                      onClick={() => handleChoosePackage(pkg.guests, pkg.paidPrice)}
                      className={`block w-full text-center py-3 rounded-xl font-semibold transition-all ${
                        isSelected
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : isFeatured
                          ? 'bg-primary text-white hover:bg-accent shadow-md'
                          : 'bg-primarySoft text-primary hover:bg-primary/10'
                      }`}
                    >
                      {isSelected ? 'متابعة الدفع' : 'اختر الباقة'}
                    </button>

                    <AnimatePresence>
                      {isSelected && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 8 }}
                          className="mt-3 text-center text-emerald-700 text-sm font-semibold"
                        >
                          ✓ تم اختيار الباقة
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-12">
            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-3xl border border-primary/20 bg-gradient-to-br from-white via-white to-primary/5 p-6 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-xl bg-primarySoft p-2 text-primary">
                  <Gift size={22} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">اهدِ باقة 🎁</h3>
                  <p className="text-sm text-muted">اشترِ باقة وأرسل كود هدية للاستخدام مرة واحدة</p>
                </div>
              </div>

              <div className="space-y-4">
                <select
                  value={giftGuests}
                  onChange={(event) => setGiftGuests(Number(event.target.value))}
                  className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  {PACKAGE_TIERS.map((tier) => (
                    <option key={`gift-${tier.guests}`} value={tier.guests}>
                      باقة {tier.guests} ضيف - {formatSar(tier.paidPrice)}
                    </option>
                  ))}
                </select>

                <div className="rounded-xl border border-dashed border-primary/30 bg-primary/5 p-4 text-sm text-textDark">
                  السعر الحالي: <span className="font-bold">{formatSar(selectedGiftTier?.paidPrice || 0)}</span>
                </div>

                <button
                  type="button"
                  onClick={handleGiftCheckout}
                  disabled={giftCheckoutLoading}
                  className="w-full rounded-xl bg-primary py-3 font-semibold text-white hover:bg-accent transition-colors disabled:opacity-60"
                >
                  {giftCheckoutLoading ? 'جارٍ تحويلك للدفع...' : 'ادفع كهدية'}
                </button>
                {!!giftCheckoutError && <p className="text-sm text-red-600">{giftCheckoutError}</p>}
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="rounded-xl bg-primarySoft p-2 text-primary">
                  <Ticket size={22} />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">عندك كود هدية؟</h3>
                  <p className="text-sm text-muted">فعّل الكود مباشرة وتضاف الباقة لحسابك</p>
                </div>
              </div>

              <div className="space-y-4">
                <input
                  value={redeemCode}
                  onChange={(event) => setRedeemCode(event.target.value)}
                  placeholder="الصق كود الهدية هنا"
                  className="w-full rounded-xl border border-gray-200 px-4 py-3 text-base tracking-wide uppercase focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
                <button
                  type="button"
                  onClick={handleRedeem}
                  disabled={redeemLoading}
                  className="w-full rounded-xl bg-textDark py-3 font-semibold text-white hover:bg-black transition-colors disabled:opacity-60"
                >
                  {redeemLoading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="animate-spin" size={16} />
                      جارٍ التفعيل...
                    </span>
                  ) : (
                    'تفعيل'
                  )}
                </button>
                {!!redeemError && <p className="text-sm text-red-600">{redeemError}</p>}
                {!!redeemSuccess && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700 text-sm"
                  >
                    {redeemSuccess}
                    {redeemPackageSize ? ` تمت إضافة باقة ${redeemPackageSize} ضيف إلى حسابك.` : ''}
                    <div className="mt-2 font-semibold text-emerald-800">ابدأ تصميم دعوتك الآن</div>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </div>

          <AnimatePresence>
            {giftPending && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className="mb-12 rounded-3xl border border-primary/20 bg-white p-6 shadow-lg"
              >
                <h3 className="text-2xl font-bold mb-3">تم إنشاء كود الهدية 🎉</h3>
                {giftCodeLoading ? (
                  <div className="inline-flex items-center gap-2 text-muted">
                    <Loader2 className="animate-spin" size={18} />
                    جاري التحقق من تأكيد الدفع...
                  </div>
                ) : giftCode ? (
                  <>
                    <p className="text-sm text-muted mb-4">
                      كود باقة {giftCodePackageSize} ضيف بقيمة {formatSar(giftCodePackagePrice)}
                    </p>
                    <div className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-3 font-mono text-lg tracking-wider text-primary mb-4 text-center">
                      {giftCode}
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={copyGiftCode}
                        className="inline-flex items-center gap-2 rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold hover:bg-gray-50"
                      >
                        <Copy size={16} />
                        نسخ الكود
                      </button>
                      <button
                        type="button"
                        onClick={copyWhatsappMessage}
                        className="inline-flex items-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700"
                      >
                        نسخ رسالة واتساب
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-red-600">{giftCodeError || 'تعذر تحميل كود الهدية حالياً.'}</p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="text-center">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:text-accent transition-colors"
            >
              <ArrowLeft size={20} />
              العودة للصفحة الرئيسية
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

export default function PackagesPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-bg" />}>
      <PackagesPageContent />
    </Suspense>
  )
}
