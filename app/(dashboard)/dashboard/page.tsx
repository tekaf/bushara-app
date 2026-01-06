'use client'

import { useAuth } from '@/lib/auth/context'
import { useRouter } from 'next/navigation'
import { LogOut, Plus, QrCode, Users } from 'lucide-react'
import Link from 'next/link'

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const router = useRouter()

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-white border-b border-primarySoft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-primary">لوحة التحكم</h1>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-muted hover:text-primary transition-colors"
            >
              <LogOut size={20} />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-2">مرحباً، {user?.email}</h2>
          <p className="text-muted">إدارة دعواتك ومناسباتك من مكان واحد</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-muted">إجمالي الدعوات</h3>
              <QrCode className="text-primary" size={24} />
            </div>
            <p className="text-3xl font-bold">0</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-muted">الضيوف</h3>
              <Users className="text-primary" size={24} />
            </div>
            <p className="text-3xl font-bold">0</p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-muted">الحضور</h3>
              <QrCode className="text-primary" size={24} />
            </div>
            <p className="text-3xl font-bold">0</p>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <h3 className="text-xl font-bold mb-6">إجراءات سريعة</h3>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/dashboard/invites/new"
              className="flex items-center justify-center gap-2 bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-accent transition-colors"
            >
              <Plus size={20} />
              إنشاء دعوة جديدة
            </Link>
            <Link
              href="/dashboard/invites"
              className="flex items-center justify-center gap-2 border-2 border-primary text-primary px-6 py-3 rounded-lg font-semibold hover:bg-primarySoft transition-colors"
            >
              عرض جميع الدعوات
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}

