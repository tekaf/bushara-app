import Link from 'next/link'

export default function Footer() {
  return (
    <footer
      className="relative mt-24 overflow-hidden border-t border-white/25 shadow-[0_-20px_60px_rgba(30,20,70,0.42)]"
      style={{
        backgroundImage: `
          linear-gradient(180deg, rgba(60,42,118,0.94), rgba(34,28,78,0.97)),
          radial-gradient(circle at top center, rgba(225,206,255,0.24), transparent 38%),
          radial-gradient(circle at bottom left, rgba(166,210,255,0.18), transparent 36%),
          radial-gradient(circle at bottom right, rgba(198,165,255,0.12), transparent 34%)
        `,
        backdropFilter: 'blur(26px)',
        WebkitBackdropFilter: 'blur(26px)',
      }}
    >
      <div className="footer-frost" />
      <div className="footer-stars" />
      <div className="footer-star-3" />
      <div className="absolute inset-0 pointer-events-none bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:80px_80px] opacity-[0.12]" />

      <div className="relative mx-auto max-w-7xl px-6 py-16 lg:px-10">
        <div className="grid grid-cols-1 gap-10 text-right md:grid-cols-3 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <h3 className="mb-4 text-4xl font-bold text-white">بشارة</h3>
            <p className="text-lg leading-9 text-white/75">
              أنشئ دعوتك الأنيقة خلال دقائق وشاركها بسهولة عبر واتساب بتجربة فاخرة تليق بمناسبتك.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-2xl font-semibold text-white">روابط سريعة</h4>
            <ul className="space-y-3 text-lg text-white/70">
              <li>
                <Link href="/packages" className="transition hover:text-white">
                  الباقات
                </Link>
              </li>
              <li>
                <Link href="/templates" className="transition hover:text-white">
                  التصاميم
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-2xl font-semibold text-white">الدعم</h4>
            <ul className="space-y-3 text-lg text-white/70">
              <li>
                <Link href="/faq" className="transition hover:text-white">
                  الأسئلة الشائعة
                </Link>
              </li>
              <li>
                <Link href="/contact" className="transition hover:text-white">
                  تواصل معنا
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-2xl font-semibold text-white">تابعنا</h4>
            <p className="text-lg text-white/65">جميع الحقوق محفوظة © {new Date().getFullYear()}</p>
          </div>
        </div>

        <div className="mt-10 border-t border-white/10 pt-8 text-center text-white/45">
          من الداعمين
          <div className="mt-4 flex justify-center">
            <img
              src="/ehsan-logo.png"
              alt="إحسان"
              className="h-16 w-auto rounded-2xl bg-white/10 p-2 backdrop-blur-md"
            />
          </div>
        </div>
      </div>
    </footer>
  )
}

