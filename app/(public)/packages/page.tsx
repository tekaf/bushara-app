'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { Check, ArrowLeft } from 'lucide-react'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'

const packages = [
  { guests: 50, price: 99 },
  { guests: 100, price: 179 },
  { guests: 150, price: 249 },
  { guests: 200, price: 319 },
  { guests: 250, price: 389 },
  { guests: 300, price: 459 },
  { guests: 350, price: 529 },
  { guests: 400, price: 599 },
  { guests: 450, price: 669 },
]

export default function PackagesPage() {
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen">
        <div className="container mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <h1 className="text-4xl md:text-5xl font-bold mb-4">باقاتنا</h1>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              اختر الباقة المناسبة لعدد ضيوفك
            </p>
          </motion.div>

          {/* Comparison Table */}
          <div className="mb-16 overflow-x-auto">
            <table className="w-full bg-white rounded-2xl overflow-hidden">
              <thead className="bg-primary text-white">
                <tr>
                  <th className="px-6 py-4 text-right">الميزة</th>
                  {packages.slice(0, 3).map((pkg) => (
                    <th key={pkg.guests} className="px-6 py-4 text-center">
                      {pkg.guests} ضيف
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="px-6 py-4 font-semibold">عدد الضيوف</td>
                  {packages.slice(0, 3).map((pkg) => (
                    <td key={pkg.guests} className="px-6 py-4 text-center">
                      {pkg.guests}
                    </td>
                  ))}
                </tr>
                <tr className="border-b bg-bg">
                  <td className="px-6 py-4 font-semibold">QR فريد لكل ضيف</td>
                  {packages.slice(0, 3).map((pkg) => (
                    <td key={pkg.guests} className="px-6 py-4 text-center">
                      <Check className="text-primary mx-auto" size={20} />
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="px-6 py-4 font-semibold">إرسال واتساب</td>
                  {packages.slice(0, 3).map((pkg) => (
                    <td key={pkg.guests} className="px-6 py-4 text-center">
                      <Check className="text-primary mx-auto" size={20} />
                    </td>
                  ))}
                </tr>
                <tr className="border-b bg-bg">
                  <td className="px-6 py-4 font-semibold">إدارة الحضور</td>
                  {packages.slice(0, 3).map((pkg) => (
                    <td key={pkg.guests} className="px-6 py-4 text-center">
                      <Check className="text-primary mx-auto" size={20} />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {/* Packages Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            {packages.map((pkg, index) => (
              <motion.div
                key={pkg.guests}
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                className={`bg-white rounded-2xl p-8 border-2 ${
                  pkg.guests === 100
                    ? 'border-primary shadow-xl scale-105'
                    : 'border-gray-200'
                } relative`}
              >
                {pkg.guests === 100 && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-white px-4 py-1 rounded-full text-sm font-semibold">
                    الأكثر شعبية
                  </div>
                )}

                <div className="text-center mb-8">
                  <h3 className="text-2xl font-bold mb-2">{pkg.guests} ضيف</h3>
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
                  href="/register"
                  className={`block w-full text-center py-3 rounded-lg font-semibold transition-colors ${
                    pkg.guests === 100
                      ? 'bg-primary text-white hover:bg-accent'
                      : 'bg-primarySoft text-primary hover:bg-primary/10'
                  }`}
                >
                  اشترك الآن
                </Link>
              </motion.div>
            ))}
          </div>

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

