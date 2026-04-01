'use client'

import Link from 'next/link'

export default function WelcomeHero({ name }: { name: string }) {
  return (
    <section className="rounded-3xl border border-violet-100 bg-gradient-to-br from-white via-violet-50/60 to-white p-6 md:p-8 shadow-sm">
      <p className="text-xl md:text-2xl font-bold text-primary mb-2">بشارة .. لتخليد ذكرى سعيدة ✨</p>
      <p className="text-base md:text-lg text-textDark mb-6">حياك الله {name || 'عزيزنا'} عسى افراحكم تدوم ✨</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          href="/occasions"
          className="inline-flex items-center justify-center rounded-xl bg-primary px-5 py-3 text-white font-semibold hover:bg-accent transition-colors"
        >
          ابدأ دعوة جديدة
        </Link>
        <Link
          href="/packages"
          className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-3 text-textDark font-semibold hover:bg-gray-50 transition-colors"
        >
          اختر باقة
        </Link>
      </div>
    </section>
  )
}
