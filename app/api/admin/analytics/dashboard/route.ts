import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/auth/verify-admin-request'
import { buildDashboardAnalytics } from '@/lib/admin/analytics/dashboard'
import type { DashboardPeriod } from '@/lib/analytics/types'

export const runtime = 'nodejs'

function parsePeriod(raw: string | null): DashboardPeriod {
  if (raw === 'weekly' || raw === 'monthly' || raw === '3months' || raw === 'yearly') return raw
  return 'monthly'
}

export async function GET(request: NextRequest) {
  try {
    const { adminDb } = await verifyAdminRequest(request)
    const period = parsePeriod(request.nextUrl.searchParams.get('period'))
    const data = await buildDashboardAnalytics(adminDb, period)
    return NextResponse.json({ ok: true, ...data })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load dashboard analytics' }, { status })
  }
}
