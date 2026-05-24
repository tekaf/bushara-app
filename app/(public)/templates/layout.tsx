import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'تصاميم دعوات إلكترونية | بشاره',
  description:
    'تصفح تصاميم دعوات إلكترونية مميزة للزواج والخطوبة والمناسبات، واختر القالب المناسب لبدء دعوتك عبر بشاره.',
  alternates: {
    canonical: 'https://www.busharh.com/templates',
  },
}

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return children
}
