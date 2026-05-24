import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { applyRiskCaseMarkRetryMutation } from '@/lib/risk-case/entry-actions'
import { resolveRiskCaseAccessToken } from '@/lib/risk-case/access-links'

export const runtime = 'nodejs'

function getRequestIp(request: NextRequest) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    request.ip ||
    ''
  )
}

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string; guestId: string } }
) {
  try {
    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    const rawToken = decodeURIComponent(String(params?.token || '').trim())
    const guestId = String(params?.guestId || '').trim()
    if (!rawToken || !guestId) return NextResponse.json({ error: 'Missing token or guestId' }, { status: 400 })

    const ip = getRequestIp(request)
    const userAgent = request.headers.get('user-agent') || ''
    const access = await resolveRiskCaseAccessToken({
      adminDb,
      rawToken,
      touch: true,
      requestIp: ip,
      requestUserAgent: userAgent,
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const result = await applyRiskCaseMarkRetryMutation({
      adminDb,
      inviteId: access.inviteId,
      guestId,
      actorId: `token:${access.tokenId}`,
      orderCode: access.orderCode || '',
      logTag: '[RISK_CASE_ACCESS]',
      logContext: {
        tokenId: access.tokenId,
        allowedEmail: access.allowedEmail,
        ip,
        userAgent,
      },
    })
    if (result.type === 'invalid_status') {
      return NextResponse.json({ error: `Cannot retry from blocked status: ${result.oldStatus}` }, { status: 409 })
    }
    return NextResponse.json({
      ok: true,
      inviteId: access.inviteId,
      guestId,
      oldStatus: result.oldStatus,
      newStatus: result.newStatus,
      manualSendCount: result.manualSendCount,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to mark retry' }, { status: 500 })
  }
}
