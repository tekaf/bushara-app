import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-[#d8e6ff] bg-gradient-to-r from-[#dff0ff] via-[#cfe6ff] to-[#dff0ff] py-12 text-[#2a3b5f]">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-2xl font-bold mb-4">بشارة</h3>
            <p className="text-[#526487]">
              منصة احترافية لإنشاء دعوات إلكترونية للمناسبات السعيدة
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">روابط سريعة</h4>
            <ul className="space-y-2 text-[#526487]">
              <li>
                <Link href="/packages" className="hover:text-white transition">
                  الباقات
                </Link>
              </li>
              <li>
                <Link href="/designs" className="hover:text-white transition">
                  التصاميم
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">الدعم</h4>
            <ul className="space-y-2 text-[#526487]">
              <li>
                <Link href="#" className="hover:text-white transition">
                  الأسئلة الشائعة
                </Link>
              </li>
              <li>
                <Link href="#" className="hover:text-white transition">
                  تواصل معنا
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">تابعنا</h4>
            <p className="text-[#526487]">
              جميع الحقوق محفوظة © {new Date().getFullYear()}
            </p>
          </div>
        </div>

        <div className="mt-8 border-t border-[#c9ddff] pt-5">
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-xs font-semibold text-[#4e678f]">من الداعمين</p>
            <a
              href="https://ehsan.sa"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl bg-white/90 px-4 py-2 shadow-sm transition hover:shadow-md"
              aria-label="منصة إحسان"
            >
              <img src="/ehsan-logo.png" alt="Ehsan" className="h-9 w-auto object-contain" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}

