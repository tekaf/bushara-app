'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import Image from 'next/image'
import { useEffect, useState } from 'react'

const HERO_INVITATION_IMAGE = '/home/hero-invitation.webp'

export default function Hero() {
  const [imageUrl, setImageUrl] = useState(HERO_INVITATION_IMAGE)
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const loadHomeAssets = async () => {
      try {
        const response = await fetch('/api/public/home-assets', { signal: controller.signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) return
        const nextUrl = String(data?.heroImageUrl || HERO_INVITATION_IMAGE).trim() || HERO_INVITATION_IMAGE
        setImageUrl(nextUrl)
        setImageFailed(false)
      } catch {
        setImageUrl(HERO_INVITATION_IMAGE)
      }
    }
    loadHomeAssets()
    return () => controller.abort()
  }, [])

  return (
    <section className="relative overflow-hidden px-4 pb-20 pt-32">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(124,108,255,0.12),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(180,190,255,0.16),transparent_34%)]" />
      <div className="container relative mx-auto">
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
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-[rgba(150,160,190,0.22)] bg-[rgba(255,255,255,0.72)] px-4 py-2 text-[#6D5DFB] backdrop-blur-xl"
            >
              <Sparkles size={18} />
              <span className="text-sm font-medium">منصة احترافية</span>
            </motion.div>

            <motion.h1
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="mb-6 text-5xl font-bold leading-[1.24] text-[#1F2433] md:text-6xl md:leading-[1.18]"
            >
              مناسبتك غالية..
              <span className="mt-2 block">ودعوتك لازم تصير تُحفة</span>
            </motion.h1>

            <motion.p
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mb-8 text-xl leading-relaxed text-[#7B8194]"
            >
              أنشئ دعوتك، أرسلها، وتابع حضور ضيوفك بسهولة من مكان واحد.
            </motion.p>

            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex flex-col sm:flex-row gap-4"
            >
              <Link
                href="/register"
                className="group flex items-center justify-center gap-2 rounded-xl px-8 py-4 font-semibold text-white shadow-[0_18px_45px_rgba(109,93,251,0.22)] transition-all duration-300 hover:-translate-y-0.5"
                style={{
                  background: 'linear-gradient(135deg, #7C6CFF, #5F6CFF)',
                }}
              >
                ابدأ الآن
                <ArrowLeft
                  size={20}
                  className="group-hover:-translate-x-1 transition-transform"
                />
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
            <div className="rounded-[30px] border border-[rgba(150,160,190,0.18)] bg-[rgba(255,255,255,0.72)] p-3 shadow-[0_24px_80px_rgba(31,36,51,0.08)] backdrop-blur-2xl">
              {!imageFailed && imageUrl ? (
                <Image
                  src={imageUrl}
                  alt="نموذج دعوة بشارة"
                  width={520}
                  height={720}
                  className="h-full w-full rounded-[28px] object-cover"
                  onError={() => setImageFailed(true)}
                  priority={false}
                />
              ) : null}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}

