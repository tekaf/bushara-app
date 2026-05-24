'use client'

import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="w-full max-w-md rounded-admin-lg border border-admin-border bg-admin-surface p-8 text-center shadow-admin">
          <Spinner />
          <p className="text-sm text-muted">جاري تحميل لوحة الإدارة...</p>
        </div>
      </div>
    )
  }

  if (!user || !isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-4">
        <div className="w-full max-w-md rounded-admin-lg border border-admin-border bg-admin-surface p-8 text-center shadow-admin">
          <h1 className="mb-2 text-xl font-bold text-textDark">صلاحية إدارية مطلوبة</h1>
          <p className="mb-6 text-sm text-muted">
            {user ? 'حسابك مسجل لكنه لا يملك صلاحية الأدمن.' : 'يجب تسجيل الدخول للوصول إلى لوحة الإدارة.'}
          </p>
          <Link
            href={user ? '/' : '/login'}
            className="inline-flex w-full items-center justify-center rounded-admin bg-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-accent"
          >
            {user ? 'العودة للرئيسية' : 'تسجيل الدخول'}
          </Link>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

function Spinner() {
  return (
    <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-admin-border border-t-primary" />
  )
}
