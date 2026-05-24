import type { Metadata, Viewport } from 'next'
import { Cairo } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth/context'

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL('https://www.busharh.com'),
  title: 'بشاره | دعوات إلكترونية للزواج والخطوبة والمناسبات',
  description:
    'أنشئ دعوات إلكترونية احترافية للزواج والخطوبة والمناسبات مع إدارة المدعوين، RSVP، وإرسال الدعوات عبر واتساب بسهولة.',
  keywords: [
    'دعوات إلكترونية',
    'دعوة زواج إلكترونية',
    'دعوات زواج',
    'دعوات خطوبة',
    'دعوات مناسبات',
    'تصميم دعوات',
    'RSVP',
    'إرسال دعوات واتساب',
    'بشاره',
    'Busharh',
  ],
  openGraph: {
    title: 'بشاره | دعوات إلكترونية للزواج والخطوبة والمناسبات',
    description:
      'أنشئ دعوات إلكترونية احترافية للزواج والخطوبة والمناسبات مع إدارة المدعوين، RSVP، وإرسال الدعوات عبر واتساب بسهولة.',
    url: 'https://www.busharh.com',
    siteName: 'بشاره | Busharh',
    images: [
      {
        url: '/api/public/brand-logo',
        width: 1200,
        height: 630,
        alt: 'بشاره - منصة الدعوات الإلكترونية',
      },
    ],
    locale: 'ar_SA',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'بشاره | دعوات إلكترونية للزواج والخطوبة والمناسبات',
    description:
      'أنشئ دعوات إلكترونية احترافية للزواج والخطوبة والمناسبات مع إدارة المدعوين، RSVP، وإرسال الدعوات عبر واتساب بسهولة.',
    images: ['/api/public/brand-logo'],
  },
  icons: {
    icon: [
      { url: '/api/public/brand-logo', type: 'image/png' },
      { url: '/api/public/brand-logo', type: 'image/png', sizes: '32x32' },
      { url: '/api/public/brand-logo', type: 'image/png', sizes: '16x16' },
    ],
    apple: [
      { url: '/api/public/brand-logo', type: 'image/png' },
    ],
    shortcut: '/api/public/brand-logo',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ar" dir="rtl">
      <body className={`${cairo.variable} font-sans antialiased`}>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
