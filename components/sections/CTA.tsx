'use client'

import { motion } from 'framer-motion'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function CTA() {
  return (
    <section className="relative overflow-hidden px-4 py-14 sm:py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(124,108,255,0.1),transparent_34%),radial-gradient(circle_at_84%_16%,rgba(180,190,255,0.14),transparent_30%)]" />
      <div className="container relative mx-auto">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-[30px] border border-[rgba(150,160,190,0.18)] bg-white/72 p-8 text-center shadow-[0_24px_80px_rgba(31,36,51,0.08)] backdrop-blur-2xl sm:p-12 md:p-16"
        >
          <h2 className="mb-6 text-3xl font-bold text-[#1F2433] sm:text-4xl md:text-5xl">
            ابدأ الآن وأنشئ دعوتك
          </h2>
          <p className="mx-auto mb-8 max-w-2xl text-base text-[#7B8194] sm:text-lg md:text-xl">
            تجربة منظمة وهادئة لإرسال الدعوات ومتابعة الحضور من مكان واحد.
          </p>
          <Link
            href="/register"
            className="group inline-flex h-12 items-center gap-2 rounded-xl px-6 text-base font-semibold text-white shadow-[0_18px_45px_rgba(109,93,251,0.22)] transition-all duration-300 hover:-translate-y-0.5 sm:h-14 sm:px-8 sm:text-lg"
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
      </div>
    </section>
  )
}

