import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-textDark text-white py-12 mt-20">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-2xl font-bold mb-4">بشارة</h3>
            <p className="text-gray-400">
              منصة احترافية لإنشاء دعوات إلكترونية للمناسبات السعيدة
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">روابط سريعة</h4>
            <ul className="space-y-2 text-gray-400">
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
            <ul className="space-y-2 text-gray-400">
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
            <p className="text-gray-400">
              جميع الحقوق محفوظة © {new Date().getFullYear()}
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}

