'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Check, ArrowLeft } from 'lucide-react'

const packages = [
  { guests: 50, price: 99, popular: false },
  { guests: 100, price: 179, popular: true },
  { guests: 150, price: 249, popular: false },
]

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
          <h2 className="text-4xl md:text-5xl font-bold mb-4">باقاتنا</h2>
          <p className="text-xl text-muted max-w-2xl mx-auto">
            اختر الباقة المناسبة لعدد ضيوفك
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {packages.map((pkg, index) => (
            <motion.div
              key={pkg.guests}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className={`bg-white rounded-2xl p-8 ${
                pkg.popular
                  ? 'border-2 border-primary shadow-xl scale-105'
                  : 'border border-gray-200'
              } relative`}
            >
              {pkg.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-semibold">
                  الأكثر شعبية
                </div>
              )}

              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold mb-2">
                  {pkg.guests} ضيف
                </h3>
                <div className="flex items-baseline justify-center gap-2">
                  <span className="text-4xl font-bold text-primary">
                    {pkg.price}
                  </span>
                  <span className="text-muted">ريال</span>
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
                  pkg.popular
                    ? 'bg-primary text-white hover:bg-accent'
                    : 'bg-primarySoft text-primary hover:bg-primary/10'
                }`}
              >
                اختر الباقة
              </Link>
            </motion.div>
          ))}
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

