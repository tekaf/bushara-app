'use client'

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'

export default function BillingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-white border-b border-primarySoft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-muted hover:text-primary transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-bold text-primary">الفواتير والاشتراك</h1>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-6">الفواتير</h2>
          <div className="text-center py-12">
            <p className="text-muted mb-4">لا توجد فواتير بعد</p>
            <Link
              href="/packages"
              className="inline-block bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-accent transition-colors"
            >
              عرض الباقات
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

