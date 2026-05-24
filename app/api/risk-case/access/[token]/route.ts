import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { buildRiskCasePayload } from '@/lib/risk-case/payload'
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

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    const rawToken = decodeURIComponent(String(params?.token || '').trim())
    if (!rawToken) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

    const access = await resolveRiskCaseAccessToken({
      adminDb,
      rawToken,
      touch: true,
      requestIp: getRequestIp(request),
      requestUserAgent: request.headers.get('user-agent') || '',
    })
    if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

    const payload = await buildRiskCasePayload({
      adminDb,
      inviteId: access.inviteId,
      actorId: `token:${access.tokenId}`,
      source: 'risk_case_access_payload',
      appOrigin: request.nextUrl.origin,
      allowPrepareIfMissing: false,
    })
    if (!payload.ok) {
      return NextResponse.json(
        { error: payload.error, decision: payload.decision || 'blocked', inviteId: access.inviteId },
        { status: payload.status || 409 }
      )
    }

    console.info('[RISK_CASE_ACCESS]', {
      orderCode: access.orderCode || payload.orderCode || '',
      inviteId: access.inviteId,
      tokenId: access.tokenId,
      allowedEmail: access.allowedEmail,
      action: 'access_payload_opened',
      ip: getRequestIp(request),
      userAgent: request.headers.get('user-agent') || '',
    })

    return NextResponse.json({
      ...payload.payload,
      access: {
        tokenId: access.tokenId,
        allowedEmail: access.allowedEmail,
        expiresAt: access.expiresAt,
      },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load access payload' }, { status: 500 })
  }
}
