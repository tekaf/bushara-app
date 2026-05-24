import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isValidAnalyticsEventName } from '@/lib/analytics/track-server'
import { trackAnalyticsEvent } from '@/lib/analytics/track-server'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const event = String(body?.event || '').trim()
    if (!isValidAnalyticsEventName(event)) {
      return NextResponse.json({ error: 'Invalid event' }, { status: 400 })
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Analytics unavailable' }, { status: 503 })

    let userId = body?.userId ? String(body.userId) : null
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (token) {
      const app = getAdminApp()
      if (app) {
        try {
          const decoded = await getAuth(app).verifyIdToken(token)
          userId = decoded.uid
        } catch {
          // Anonymous tracking allowed for funnel events.
        }
      }
    }

    const id = await trackAnalyticsEvent(adminDb, {
      event,
      userId,
      invitationId: body?.invitationId ? String(body.invitationId) : null,
      templateId: body?.templateId ? String(body.templateId) : null,
      packageId: body?.packageId ? String(body.packageId) : null,
      source: body?.source ? String(body.source) : null,
      sessionId: body?.sessionId ? String(body.sessionId) : null,
      metadata: typeof body?.metadata === 'object' && body.metadata ? body.metadata : {},
    })

    return NextResponse.json({ ok: true, id })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to track event' }, { status: 500 })
  }
}
