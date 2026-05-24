import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'باقات الدعوات الإلكترونية | بشاره',
  description:
    'تعرف على باقات بشاره للدعوات الإلكترونية، واختر الباقة المناسبة لعدد المدعوين مع دعم RSVP والإرسال عبر واتساب.',
  alternates: {
    canonical: 'https://www.busharh.com/packages',
  },
}

export default function PackagesLayout({ children }: { children: React.ReactNode }) {
  return children
}
