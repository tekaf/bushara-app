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
  return (
    <section className="py-20 px-4 bg-bg">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primarySoft px-4 py-2 text-sm font-semibold text-primary mb-5">
            <Sparkles size={15} />
            عرض الإطلاق - خصم {LAUNCH_DISCOUNT_PERCENT}%
          </div>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">باقاتنا</h2>
          <p className="text-xl text-muted max-w-2xl mx-auto">
            اختر الباقة المناسبة لعدد ضيوفك
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {previewPackages.map((pkg, index) => {
            const isPopular = pkg.guests === 200
            const saving = pkg.oldPrice - pkg.paidPrice
            return (
            <motion.div
              key={pkg.guests}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`bg-white rounded-2xl p-8 ${
                isPopular
                  ? 'border-2 border-primary shadow-xl scale-105'
                  : 'border border-gray-200'
              } relative`}
            >
              <div className="absolute top-4 left-4 rounded-full bg-primary text-white px-3 py-1 text-xs font-bold">
                خصم {LAUNCH_DISCOUNT_PERCENT}%
              </div>

              {isPopular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-semibold">
                  الأكثر طلباً ⭐
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">
                  {pkg.guests} ضيف
                </h3>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-4xl font-bold text-primary">
                    {pkg.paidPrice}
                  </span>
                  <span className="text-muted">ر.س</span>
                </div>
                <div className="mt-2 text-sm text-muted line-through">
                  {formatSar(pkg.oldPrice)}
                </div>
                <div className="mt-2 inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                  وفرت {formatSar(saving)}
                </div>
              </div>

              <ul className="space-y-4 mb-8">
                <li className="flex items-center gap-3">
                  <Check className="text-primary flex-shrink-0" size={20} />
                  <span className="text-muted">QR فريد لكل ضيف</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="text-primary flex-shrink-0" size={20} />
                  <span className="text-muted">إرسال عبر واتساب</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="text-primary flex-shrink-0" size={20} />
                  <span className="text-muted">إدارة الحضور</span>
                </li>
                <li className="flex items-center gap-3">
                  <Check className="text-primary flex-shrink-0" size={20} />
                  <span className="text-muted">دعم فني</span>
                </li>
              </ul>

              <Link
                href="/packages"
                className={`block w-full text-center py-3 rounded-lg font-semibold transition-colors ${
                  isPopular
                    ? 'bg-primary text-white hover:bg-accent'
                    : 'bg-primarySoft text-primary hover:bg-primary/10'
                }`}
              >
                اختر الباقة
              </Link>
            </motion.div>
          )})}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="text-center mt-12"
        >
          <Link
            href="/packages"
            className="inline-flex items-center gap-2 text-primary font-semibold hover:text-accent transition-colors"
          >
            عرض جميع الباقات
            <ArrowLeft size={20} />
          </Link>
        </motion.div>
      </div>
    </section>
  )
}

