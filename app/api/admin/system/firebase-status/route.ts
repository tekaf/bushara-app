import { NextRequest, NextResponse } from 'next/server'
import { adminAuthErrorToResponse, verifyAdminRequest } from '@/lib/auth/verify-admin-request'
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
  } catch (error: unknown) {
    const mapped = adminAuthErrorToResponse(error)
    const status = getAdminSdkStatus()
    return NextResponse.json({ ok: false, ...status, error: mapped.error, code: mapped.code }, { status: mapped.status })
  }
}
