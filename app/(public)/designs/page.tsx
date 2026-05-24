import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'نماذج دعوات زواج وخطوبة | بشاره',
  description:
    'استعرض نماذج دعوات زواج وخطوبة إلكترونية من بشاره، ثم انتقل لاختيار القالب المناسب لمناسبتك.',
  alternates: {
    canonical: 'https://www.busharh.com/designs',
  },
}

export default function DesignsPage() {
  redirect('/templates')
}

