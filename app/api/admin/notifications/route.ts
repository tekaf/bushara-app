import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/auth/verify-admin-request'
import { buildAdminNotifications } from '@/lib/admin/analytics/dashboard'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const { adminDb } = await verifyAdminRequest(request)
    const notifications = await buildAdminNotifications(adminDb)
    return NextResponse.json({ ok: true, notifications })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load notifications' }, { status })
  }
}
