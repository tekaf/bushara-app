import Link from 'next/link'

export default function Footer() {
  return (
    <footer
      className="relative mt-20 overflow-hidden border-t border-white/20 bg-[linear-gradient(135deg,#312A68_0%,#3F3A86_45%,#272E63_100%)] text-white shadow-[0_-14px_34px_rgba(20,22,49,0.28)]"
      style={{
        backgroundImage: `
          linear-gradient(135deg, #312A68 0%, #3F3A86 45%, #272E63 100%),
          radial-gradient(circle at 20% 20%, rgba(255,255,255,0.14), transparent 28%),
          radial-gradient(circle at 80% 10%, rgba(180,190,255,0.18), transparent 30%),
          radial-gradient(circle at 50% 100%, rgba(124,108,255,0.20), transparent 35%)
        `,
      }}
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.14),transparent_28%),radial-gradient(circle_at_80%_10%,rgba(180,190,255,0.18),transparent_30%),radial-gradient(circle_at_50%_100%,rgba(124,108,255,0.20),transparent_35%)]" />

      <div
        className="relative mx-auto max-w-7xl border-t border-[rgba(255,255,255,0.22)] px-6 py-14 lg:px-10"
        style={{ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
      >
        <div className="grid grid-cols-1 gap-10 text-right md:grid-cols-3 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <h3 className="mb-4 text-4xl font-bold tracking-wide text-[rgba(255,255,255,0.98)] drop-shadow-[0_0_16px_rgba(200,206,255,0.28)]">
              بشارة
            </h3>
            <p className="text-lg leading-9 text-[rgba(255,255,255,0.72)]">
              أنشئ دعوتك الأنيقة خلال دقائق وشاركها بسهولة عبر واتساب بتجربة فاخرة تليق بمناسبتك.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-2xl font-semibold text-[rgba(255,255,255,0.96)]">روابط سريعة</h4>
            <ul className="space-y-3.5 text-lg text-[rgba(255,255,255,0.78)]">
              <li>
                <Link href="/packages" className="transition-colors duration-200 hover:text-white">
                  الباقات
                </Link>
              </li>
              <li>
                <Link href="/templates" className="transition-colors duration-200 hover:text-white">
                  التصاميم
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-2xl font-semibold text-[rgba(255,255,255,0.96)]">الدعم</h4>
            <ul className="space-y-3.5 text-lg text-[rgba(255,255,255,0.78)]">
              <li>
                <Link href="/faq" className="transition-colors duration-200 hover:text-white">
                  الأسئلة الشائعة
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition-colors duration-200 hover:text-white">
                  تواصل معنا
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-2xl font-semibold text-[rgba(255,255,255,0.96)]">تابعنا</h4>
            <p className="text-lg text-[rgba(255,255,255,0.72)]">جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
          </div>
        </div>

        <div className="mt-10 border-t border-white/15 pt-8 text-center text-[rgba(255,255,255,0.72)]">
          من الداعمين
          <div className="mt-4 flex justify-center">
            <img
              src="/ehsan-logo.png"
              alt="إحسان"
              className="h-16 w-auto rounded-2xl border border-white/20 bg-white/14 p-2.5 backdrop-blur-md"
            />
          </div>
        </div>
      </div>
    </footer>
  )
}

