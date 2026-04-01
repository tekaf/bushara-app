import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const runtime = 'nodejs'

async function getSession(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')
  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  if (!app || !adminDb) throw new Error('Admin SDK not configured')
  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  const email = decoded.email || (await auth.getUser(decoded.uid)).email || ''
  if (!isAdminEmailServer(email)) throw new Error('Unauthorized')
  return { adminDb }
}

function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    const d = value.toDate()
    if (d instanceof Date && Number.isFinite(d.getTime())) return d.toISOString()
    return null
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  const d = new Date(value)
  if (Number.isFinite(d.getTime())) return d.toISOString()
  return null
}

export async function GET(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const { adminDb } = await getSession(request)
    const inviteId = String(params?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = inviteSnap.data() as any

    const [guestsSnap, logsSnap] = await Promise.all([
      inviteRef.collection('guests').get(),
      adminDb.collection('send_logs').where('inviteId', '==', inviteId).limit(3000).get(),
    ])

    const guestBreakdown = { pending: 0, scheduled: 0, send_pending: 0, sent: 0, failed: 0, unknown: 0 }
    for (const doc of guestsSnap.docs) {
      const sendStatus = String((doc.data() as any)?.sendStatus || 'pending')
      if (sendStatus === 'pending') guestBreakdown.pending += 1
      else if (sendStatus === 'scheduled') guestBreakdown.scheduled += 1
      else if (sendStatus === 'send_pending') guestBreakdown.send_pending += 1
      else if (sendStatus === 'sent') guestBreakdown.sent += 1
      else if (sendStatus === 'failed') guestBreakdown.failed += 1
      else guestBreakdown.unknown += 1
    }

    const logBreakdown = { accepted: 0, failed: 0, skipped: 0 }
    for (const doc of logsSnap.docs) {
      const status = String((doc.data() as any)?.status || '')
      if (status === 'accepted') logBreakdown.accepted += 1
      else if (status === 'failed') logBreakdown.failed += 1
      else if (status === 'skipped') logBreakdown.skipped += 1
    }

    let activeJobsSnap
    let recentJobsSnap
    try {
      ;[activeJobsSnap, recentJobsSnap] = await Promise.all([
        adminDb
          .collection('send_jobs')
          .where('inviteId', '==', inviteId)
          .where('status', 'in', ['scheduled', 'dispatching', 'processing'])
          .limit(10)
          .get(),
        adminDb.collection('send_jobs').where('inviteId', '==', inviteId).orderBy('createdAt', 'desc').limit(10).get(),
      ])
    } catch {
      ;[activeJobsSnap, recentJobsSnap] = await Promise.all([
        adminDb.collection('send_jobs').where('inviteId', '==', inviteId).limit(100).get(),
        adminDb.collection('send_jobs').where('inviteId', '==', inviteId).limit(100).get(),
      ])
    }

    const activeJobs = activeJobsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .filter((j) => ['scheduled', 'dispatching', 'processing'].includes(String(j.status || '')))
      .map((j) => ({ id: j.id, status: String(j.status || ''), scheduledAt: toIso(j.scheduledAt) }))

    const recentJobs = recentJobsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as any) }))
      .sort((a, b) => new Date(toIso(b.createdAt) || 0).getTime() - new Date(toIso(a.createdAt) || 0).getTime())
      .slice(0, 10)
      .map((j) => ({ id: j.id, status: String(j.status || ''), createdAt: toIso(j.createdAt), updatedAt: toIso(j.updatedAt) }))

    return NextResponse.json({
      ok: true,
      inviteId,
      invitation: {
        workflowStatus: String(invite?.workflowStatus || ''),
        scheduledSendAt: toIso(invite?.scheduledSendAt),
        timezone: String(invite?.timezone || 'Asia/Riyadh'),
      },
      summary: {
        totalGuests: guestsSnap.size,
        pendingGuests: guestBreakdown.pending + guestBreakdown.scheduled + guestBreakdown.send_pending + guestBreakdown.unknown,
        sentGuests: guestBreakdown.sent,
        failedGuests: guestBreakdown.failed,
        inProgressGuests: guestBreakdown.send_pending,
        hasActiveJob: activeJobs.length > 0,
        activeJobsCount: activeJobs.length,
      },
      breakdown: { guests: guestBreakdown, logs: logBreakdown },
      jobs: { active: activeJobs, recent: recentJobs },
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load send status' }, { status })
  }
}

