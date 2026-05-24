import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/auth/verify-admin-request'
import { getAdminSdkStatus } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request)
    const status = getAdminSdkStatus()
    return NextResponse.json({
      ok: true,
      ...status,
      recommendation: status.configured
        ? null
        : 'Use FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY on Vercel, or FIREBASE_SERVICE_ACCOUNT_BASE64.',
    })
  } catch (error: any) {
    const message = String(error?.message || '')
    if (message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const status = getAdminSdkStatus()
    return NextResponse.json({ ok: false, ...status, error: message }, { status: 503 })
  }
}
