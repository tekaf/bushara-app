'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Check, ArrowLeft, Sparkles } from 'lucide-react'
import { LAUNCH_DISCOUNT_PERCENT, PACKAGE_TIERS } from '@/lib/pricing/packages'

const previewPackages = [
  PACKAGE_TIERS.find((pkg) => pkg.guests === 50),
  PACKAGE_TIERS.find((pkg) => pkg.guests === 200),
  PACKAGE_TIERS.find((pkg) => pkg.guests === 100),
].filter((pkg): pkg is (typeof PACKAGE_TIERS)[number] => Boolean(pkg))

function formatSar(value: number) {
  return `${value} ر.س`
}

export default function PackagesPreview() {
  const packageFeatures = [
    'إرسال عبر واتساب',
    'إدارة الحضور',
    'دعم فني',
    'رابط خاص للدعوة',
    'تحديث بيانات المدعوين',
  ]

  return (
    <section className="relative overflow-hidden bg-[#F6F7FB] px-4 py-8 sm:py-14 lg:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,108,255,0.1),transparent_34%),radial-gradient(circle_at_80%_10%,rgba(176,190,255,0.14),transparent_32%)]" />
      <div className="container relative mx-auto">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mb-10 text-center sm:mb-16"
        >
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[rgba(109,93,251,0.22)] bg-[#EEEAFE] px-4 py-2 text-sm font-semibold text-[#6D5DFB]">
            <Sparkles size={15} />
            عرض الإطلاق - خصم {LAUNCH_DISCOUNT_PERCENT}%
          </div>
          <h2 className="mb-4 text-[24px] font-bold leading-[1.25] text-[#1F2433] sm:text-[36px] md:text-[48px]">باقاتنا</h2>
          <p className="mx-auto max-w-2xl text-[14px] leading-6 text-[#7B8194] sm:text-[18px]">
            اختر الباقة المناسبة لعدد ضيوفك
          </p>
        </motion.div>

        <div className="mx-auto grid max-w-5xl grid-cols-1 gap-4 sm:gap-8 md:grid-cols-3">
          {previewPackages.map((pkg, index) => {
            const isPopular = pkg.guests === 200
            const saving = pkg.oldPrice - pkg.paidPrice
            return (
            <motion.div
              key={pkg.guests}
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`relative mx-auto w-full max-w-[320px] rounded-[24px] border p-5 backdrop-blur-2xl sm:max-w-[330px] sm:rounded-[28px] sm:p-8 ${
                isPopular
                  ? 'scale-[1.03] border-[rgba(109,93,251,0.28)] bg-white/80 shadow-[0_20px_48px_rgba(31,36,51,0.1)]'
                  : 'border-[rgba(150,160,190,0.2)] bg-white/75 shadow-[0_14px_36px_rgba(31,36,51,0.06)]'
              }`}
            >
              <div className="absolute left-4 top-4 rounded-full bg-[#6D5DFB] px-3 py-1 text-[12px] font-bold text-white">
                خصم {LAUNCH_DISCOUNT_PERCENT}%
              </div>

              {isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-[#6D5DFB] px-4 py-1 text-sm font-semibold text-white">
                  الأكثر طلباً ⭐
                </div>
              )}

              <div className="mb-6 text-center sm:mb-8">
                <h3 className="mb-2 text-[22px] font-bold">
                  {pkg.guests} ضيف
                </h3>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-[38px] font-bold text-[#6D5DFB]">
                    {pkg.paidPrice}
                  </span>
                  <span className="text-[14px] text-[#7B8194]">ر.س</span>
                </div>
                <div className="mt-2 text-sm text-[#7B8194] line-through">
                  {formatSar(pkg.oldPrice)}
                </div>
                <div className="mt-2 inline-flex items-center rounded-full bg-[#EEEAFE] px-3 py-1 text-xs font-semibold text-[#6D5DFB]">
                  وفرت {formatSar(saving)}
                </div>
              </div>

              <ul className="mb-6 space-y-3 sm:mb-8">
                {packageFeatures.map((feature) => (
                  <li key={feature} className="flex items-center gap-3 text-[15px]">
                    <Check className="h-4 w-4 flex-shrink-0 text-[#6D5DFB]" />
                    <span className="text-[#7B8194]">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/packages"
                className={`block h-11 w-full rounded-[14px] py-3 text-center text-[15px] font-semibold transition-all ${
                  isPopular
                    ? 'bg-gradient-to-br from-[#7C6CFF] to-[#5F6CFF] text-white shadow-[0_16px_34px_rgba(109,93,251,0.2)] hover:-translate-y-0.5'
                    : 'bg-[#EEEAFE] text-[#6D5DFB] hover:bg-[#E5E0FF]'
                }`}
              >
                اختر الباقة
              </Link>
            </motion.div>
          )})}
        </div>

        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-12"
        >
          <Link
            href="/packages"
            className="inline-flex items-center gap-2 font-semibold text-[#6D5DFB] transition-colors hover:text-[#5A4BF2]"
          >
            عرض جميع الباقات
            <ArrowLeft size={20} />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

