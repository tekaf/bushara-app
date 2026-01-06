'use client'

import Link from 'next/link'
import { Plus, ArrowLeft } from 'lucide-react'

export default function InvitesPage() {
  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-white border-b border-primarySoft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                href="/dashboard"
                className="text-muted hover:text-primary transition-colors"
              >
                <ArrowLeft size={20} />
              </Link>
              <h1 className="text-2xl font-bold text-primary">الدعوات</h1>
            </div>
            <Link
              href="/dashboard/invites/new"
              className="flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-lg font-semibold hover:bg-accent transition-colors"
            >
              <Plus size={20} />
              دعوة جديدة
            </Link>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
          <p className="text-muted mb-4">لا توجد دعوات بعد</p>
          <Link
            href="/dashboard/invites/new"
            className="inline-flex items-center gap-2 bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-accent transition-colors"
          >
            <Plus size={20} />
            إنشاء دعوة جديدة
          </Link>
        </div>
      </main>
    </div>
  )
}

