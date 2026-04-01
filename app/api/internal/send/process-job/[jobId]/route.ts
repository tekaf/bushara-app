import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { processSendJob } from '@/lib/sending/process-job-engine'

export const runtime = 'nodejs'

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const authHeader = request.headers.get('authorization') || ''
  if (authHeader === `Bearer ${secret}`) return true
  const token = request.nextUrl.searchParams.get('token')
  return token === secret
}

export async function POST(
  request: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    if (!isAuthorizedCron(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    const jobId = String(params?.jobId || '').trim()
    if (!jobId) return NextResponse.json({ error: 'Missing jobId' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const summary = await processSendJob(adminDb, {
      jobId,
      lockOwner: String(body?.lockOwner || '').trim() || undefined,
      batchSize: Number(body?.batchSize || process.env.SEND_BATCH_SIZE || 50),
      maxConcurrency: Number(body?.maxConcurrency || process.env.SEND_MAX_CONCURRENCY || 5),
      messageDelayMs: Number(body?.messageDelayMs || process.env.SEND_MESSAGE_DELAY_MS || 250),
      batchDelayMs: Number(body?.batchDelayMs || process.env.SEND_BATCH_DELAY_MS || 2000),
    })

    return NextResponse.json({
      ok: true,
      ...summary,
      note: 'WK-02 only: guest processing completed for this job. Retry/recovery are out of scope.',
    })
  } catch (error: any) {
    console.error('[SEND][PROCESS_JOB] failed:', error)
    return NextResponse.json({ error: error?.message || 'Process job failed' }, { status: 500 })
  }
}

