import Hero from '@/components/sections/Hero'
import Features from '@/components/sections/Features'
import PackagesPreview from '@/components/sections/PackagesPreview'
import CTA from '@/components/sections/CTA'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import FirstVisitIntro from '@/components/ui/FirstVisitIntro'
import Link from 'next/link'
import ExamplesStudioMarquee from '@/components/sections/ExamplesStudioMarquee'
import HomePreviousInviteSample from '@/components/sections/HomePreviousInviteSample'

const EHSAN_FAST_DONATION_URL =
  'https://ehsan.sa/fastdonation/337283c7f5401cd8e4927e439045ef97a94fb53d49a837f6564d56987a20084bb06578327a15fbefc42bb108720a182d'

export default function Home() {
  return (
    <main className="min-h-screen">
      <FirstVisitIntro />
      <Navbar />
      <Hero />
      <Features />

      <section className="py-14 px-4 bg-white">
        <div className="container mx-auto">
          <h2 className="mb-4 text-3xl font-bold">نماذج من أعمالنا</h2>
          <p className="mb-6 text-muted">تصفح مجموعة مختارة من دعوات تم تنفيذها لعملائنا.</p>
          <ExamplesStudioMarquee />
        </div>
      </section>

      <PackagesPreview />
      <CTA />

      <section className="py-16 px-4 bg-bg">
        <div className="container mx-auto grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="mb-3 text-2xl font-bold">تواصل معنا</h3>
            <p className="text-muted mb-2">دعم فني سريع لجميع استفساراتك</p>
            <p className="text-muted">واتساب: 0000000000</p>
            <p className="text-muted">البريد: support@bushara.app</p>
            <Link href="/packages" className="mt-4 inline-block text-primary font-semibold">
              ابدأ الآن
            </Link>
          </div>
          <HomePreviousInviteSample />
        </div>
      </section>

      <section className="px-4 pb-12 bg-bg">
        <div className="container mx-auto">
          <div className="mx-auto w-full rounded-[30px] border border-[#b9dec8]/80 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.8),transparent_38%),radial-gradient(circle_at_90%_30%,rgba(214,247,226,0.85),transparent_40%),linear-gradient(135deg,#f6fff9_0%,#e9f8ef_48%,#def2e6_100%)] p-6 shadow-[0_16px_38px_rgba(45,110,80,0.16)] md:p-10">
            <div dir="ltr" className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="md:w-40 md:border-r md:border-[#bfd9c9] md:pr-6">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-2xl bg-white/95 p-3 shadow-[0_10px_24px_rgba(53,116,86,0.14)] md:mx-0">
                  <img src="/ehsan-logo.png" alt="Ehsan" className="h-full w-full object-contain" />
                </div>
              </div>

              <div dir="rtl" className="flex-1 text-center md:text-right">
                <h3 className="mb-2 text-2xl font-bold text-[#1f5b3f] md:text-[30px]">بشّر وأسعد غيرك</h3>
                <p className="mb-5 text-sm text-[#3e6b53] md:text-base">
                  اجعل لفرحتك أثرًا يدوم عبر منصة إحسان
                </p>

                <div className="flex flex-wrap justify-center gap-2.5 md:justify-start">
                  <a
                    href={EHSAN_FAST_DONATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-[#8dc2a5] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[#245c42] shadow-[0_6px_16px_rgba(58,118,87,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_22px_rgba(58,118,87,0.2)]"
                  >
                    10 ر.س
                  </a>
                  <a
                    href={EHSAN_FAST_DONATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-[#4f8e6b] bg-[#2f6f4e] px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(47,111,78,0.32)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#285f42] hover:shadow-[0_12px_24px_rgba(47,111,78,0.38)]"
                  >
                    50 ر.س
                  </a>
                  <a
                    href={EHSAN_FAST_DONATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-[#8dc2a5] bg-white/90 px-4 py-2.5 text-sm font-semibold text-[#245c42] shadow-[0_6px_16px_rgba(58,118,87,0.14)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white hover:shadow-[0_10px_22px_rgba(58,118,87,0.2)]"
                  >
                    100 ر.س
                  </a>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-[#8f998f]">سيتم تحويلك إلى منصة إحسان لإكمال التبرع</p>
        </div>
      </section>

      <Footer />
    </main>
  )
}

