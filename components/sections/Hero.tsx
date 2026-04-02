'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function Hero() {
  const [heroImageUrl, setHeroImageUrl] = useState('')

  useEffect(() => {
    const loadHomeAssets = async () => {
      try {
        const response = await fetch('/api/public/home-assets', { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) return
        setHeroImageUrl(String(data?.heroImageUrl || ''))
      } catch (error) {
        console.error('Failed to load home hero image:', error)
      }
    }
    loadHomeAssets()
  }, [])

  return (
    <section className="pt-32 pb-20 px-4">
      <div className="container mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Text Content */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 bg-primarySoft text-primary px-4 py-2 rounded-full mb-6"
            >
              <Sparkles size={18} />
              <span className="text-sm font-medium">منصة احترافية</span>
            </motion.div>

            <motion.h1
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-5xl md:text-6xl font-bold mb-6 text-balance"
            >
              أنشئ دعواتك الإلكترونية
              <span className="text-primary block mt-2">خلال دقائق</span>
            </motion.h1>

            <motion.p
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-xl text-muted mb-8 leading-relaxed"
            >
              منصة بشارة تساعدك على إنشاء دعوات زواج ومناسبات احترافية مع
              QR فريد لكل ضيف، إدارة الحضور، وإرسال سهل عبر واتساب
            </motion.p>

            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link
                href="/register"
                className="bg-primary text-white px-8 py-4 rounded-lg font-semibold hover:bg-accent transition-colors flex items-center justify-center gap-2 group"
              >
                ابدأ مجاناً
                <ArrowLeft
                  size={20}
                  className="group-hover:-translate-x-1 transition-transform"
                />
              </Link>
              <Link
                href="/packages"
                className="border-2 border-primary text-primary px-8 py-4 rounded-lg font-semibold hover:bg-primarySoft transition-colors"
              >
                عرض الباقات
              </Link>
            </motion.div>
          </motion.div>

          {/* Image/Illustration */}
          <motion.div
            initial={false}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="relative"
          >
            <div className="bg-gradient-to-br from-primarySoft to-accent/20 rounded-3xl p-8 aspect-square flex items-center justify-center">
              {heroImageUrl ? (
                <div className="bg-white rounded-2xl p-3 shadow-2xl w-full max-w-md h-full max-h-[560px]">
                  <img
                    src={heroImageUrl}
                    alt="Hero preview"
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-8 shadow-2xl w-full max-w-md">
                  <div className="space-y-4">
                    <div className="h-4 bg-primary/20 rounded w-3/4"></div>
                    <div className="h-4 bg-primary/10 rounded w-1/2"></div>
                    <div className="grid grid-cols-2 gap-4 mt-6">
                      <div className="bg-primarySoft rounded-lg p-4 aspect-square flex items-center justify-center">
                        <div className="w-24 h-24 bg-primary/20 rounded-lg"></div>
                      </div>
                      <div className="bg-primarySoft rounded-lg p-4 aspect-square flex items-center justify-center">
                        <div className="w-24 h-24 bg-accent/20 rounded-lg"></div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

