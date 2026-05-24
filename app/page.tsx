import type { Metadata } from 'next'
import Hero from '@/components/sections/Hero'
import Features from '@/components/sections/Features'
import PackagesPreview from '@/components/sections/PackagesPreview'
import CTA from '@/components/sections/CTA'
import FAQSection from '@/components/sections/FAQSection'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import FirstVisitIntro from '@/components/ui/FirstVisitIntro'
import HomeExamplesSection from '@/components/sections/HomeExamplesSection'
import HomePreviousInviteSample from '@/components/sections/HomePreviousInviteSample'

const EHSAN_FAST_DONATION_URL =
  'https://ehsan.sa/fastdonation/337283c7f5401cd8e4927e439045ef97a94fb53d49a837f6564d56987a20084bb06578327a15fbefc42bb108720a182d'

export const metadata: Metadata = {
  alternates: {
    canonical: 'https://www.busharh.com',
  },
}

export default function Home() {
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'بشاره',
      alternateName: 'Busharh',
      url: 'https://www.busharh.com',
      description: 'منصة لإنشاء وإرسال الدعوات الإلكترونية للمناسبات',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'بشاره',
      alternateName: 'Busharh',
      url: 'https://www.busharh.com',
      description: 'منصة لإنشاء وإرسال الدعوات الإلكترونية للمناسبات',
      // TODO: Add official social links when ready.
      sameAs: [],
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: 'بشاره',
      alternateName: 'Busharh',
      url: 'https://www.busharh.com',
      description: 'منصة لإنشاء وإرسال الدعوات الإلكترونية للمناسبات',
      serviceType: 'Electronic Invitations / Online Invitation Platform',
      provider: {
        '@type': 'Organization',
        name: 'بشاره',
      },
    },
  ]

  return (
    <main className="min-h-screen bg-[#F8FAFF] text-[#1F2433]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <FirstVisitIntro />
      <Navbar />
      <section className="px-4 pb-4 pt-6 sm:pb-6">
        <div className="container mx-auto rounded-[20px] border border-[rgba(150,160,190,0.18)] bg-white/70 p-4 shadow-[0_10px_26px_rgba(31,36,51,0.05)] backdrop-blur-xl sm:p-6">
          <h1 className="mb-3 text-[22px] font-bold leading-[1.35] text-[#1F2433] sm:text-[28px]">
            دعوات إلكترونية احترافية للمناسبات
          </h1>
          <p className="text-[14px] leading-7 text-[#6E7386] sm:text-[16px]">
            بشاره منصة لإنشاء دعوات إلكترونية للزواج والخطوبة والمناسبات.
          </p>
          <p className="text-[14px] leading-7 text-[#6E7386] sm:text-[16px]">
            اختر التصميم، أضف بيانات المناسبة، وأرسل الدعوة للمدعوين عبر واتساب.
          </p>
          <p className="text-[14px] leading-7 text-[#6E7386] sm:text-[16px]">
            يدعم النظام RSVP وإدارة قائمة المدعوين بطريقة سهلة ومنظمة.
          </p>
        </div>
      </section>
      <Hero />
      <Features />

      <HomeExamplesSection />

      <PackagesPreview />
      <CTA />

      <section id="contact" className="relative overflow-hidden bg-[#F6F7FB] px-4 py-8 sm:py-14 lg:py-24">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(124,108,255,0.1),transparent_34%),radial-gradient(circle_at_88%_30%,rgba(176,188,255,0.12),transparent_36%)]" />
        <div className="container relative mx-auto grid grid-cols-1 items-center gap-6 md:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-white/72 p-8 shadow-[0_24px_80px_rgba(31,36,51,0.08)] backdrop-blur-2xl">
            <h3 className="mb-3 text-[24px] font-bold leading-[1.25] text-[#1F2433] sm:text-[36px] md:text-[48px]">تواصل معنا</h3>
            <p className="mb-2 text-[14px] leading-6 text-[#7B8194] sm:text-[18px]">للدعم الفني والاستفسارات</p>
            <p className="mb-6 text-[#7B8194]">busharh.sa@gmail.com</p>
            <a
              href="mailto:busharh.sa@gmail.com"
              className="inline-flex rounded-xl px-6 py-3 font-semibold text-white shadow-[0_18px_45px_rgba(109,93,251,0.22)] transition-all duration-300 hover:-translate-y-0.5"
              style={{ background: 'linear-gradient(135deg, #7C6CFF, #5F6CFF)' }}
            >
              راسلنا عبر البريد
            </a>
          </div>
          <div className="mx-auto w-full max-w-[280px] md:max-w-[320px]">
            <HomePreviousInviteSample />
          </div>
        </div>
      </section>

      <section className="bg-[#F6F7FB] px-4 pb-12">
        <div className="container mx-auto">
          <div className="mx-auto w-full rounded-[28px] border border-[#BFE3D2] bg-[rgba(236,253,245,0.75)] p-6 shadow-[0_12px_30px_rgba(29,78,63,0.08)] backdrop-blur-xl md:p-10">
            <div dir="ltr" className="flex flex-col gap-6 md:flex-row md:items-center">
              <div className="md:w-36 md:border-r md:border-[#CBE9DA] md:pr-6">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-2xl border border-white/80 bg-white/80 p-3 shadow-[0_8px_20px_rgba(31,36,51,0.06)] md:mx-0">
                  <img src="/ehsan-logo.png" alt="Ehsan" className="h-full w-full object-contain" />
                </div>
              </div>

              <div dir="rtl" className="flex-1 text-center md:text-right">
                <h3 className="mb-2 text-2xl font-bold text-[#1F5B3F] md:text-[28px]">بشّر وأسعد غيرك</h3>
                <p className="mb-5 text-sm text-[#3E6B53] md:text-base">
                  اجعل لفرحتك أثرًا يدوم عبر منصة إحسان
                </p>

                <div className="flex flex-wrap justify-center gap-2.5 md:justify-start">
                  <a
                    href={EHSAN_FAST_DONATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-[#B9DDCB] bg-white/85 px-4 py-2.5 text-sm font-semibold text-[#245C42] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white"
                  >
                    10 ر.س
                  </a>
                  <a
                    href={EHSAN_FAST_DONATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-[#8EBFA7] bg-[#2F6F4E]/90 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#2B6247]"
                  >
                    50 ر.س
                  </a>
                  <a
                    href={EHSAN_FAST_DONATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-xl border border-[#B9DDCB] bg-white/85 px-4 py-2.5 text-sm font-semibold text-[#245C42] transition-all duration-200 hover:-translate-y-0.5 hover:bg-white"
                  >
                    100 ر.س
                  </a>
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-[#8AA294]">سيتم تحويلك إلى منصة إحسان لإكمال التبرع</p>
        </div>
      </section>

      <FAQSection />

      <Footer />
    </main>
  )
}
