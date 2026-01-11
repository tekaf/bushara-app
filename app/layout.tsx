import type { Metadata } from 'next'
import { Cairo } from 'next/font/google'
import './globals.css'
import { AuthProvider } from '@/lib/auth/context'

const cairo = Cairo({
  subsets: ['arabic', 'latin'],
  variable: '--font-cairo',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'بشارة - منصة الدعوات الإلكترونية',
  description: 'أنشئ دعوات زواج ومناسبات إلكترونية احترافية خلال دقائق',
  icons: {
    icon: [
      { url: '/favicon.png', type: 'image/png' },
      { url: '/favicon.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: [
      { url: '/favicon.png', type: 'image/png' },
    ],
    shortcut: '/favicon.png',
  },
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
