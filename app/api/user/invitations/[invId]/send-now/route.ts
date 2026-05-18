import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { releaseDispatchKernelLock, renewDispatchKernelLock, runDispatchProtection } from '@/lib/dispatch/kernel'

export const runtime = 'nodejs'
export const maxDuration = 60

const REQUIRED_ENV_KEYS = ['WHATSAPP_PROVIDER', 'WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'CRON_SECRET'] as const
const REQUIRED_TEMPLATE_NAME = 'bashara_invitation_v1'
const REQUIRED_TEMPLATE_VARIABLES = 5

type Session = { uid: string; authHeader: string; adminDb: NonNullable<ReturnType<typeof getAdminFirestore>> }

async function getSession(request: NextRequest): Promise<Session> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  if (!app || !adminDb) throw new Error('Admin SDK not configured')

  const decoded = await getAuth(app).verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  return { uid: decoded.uid, authHeader, adminDb }
}

function validateEnv() {
  const missing = REQUIRED_ENV_KEYS.filter((key) => !String(process.env[key] || '').trim())
  const provider = String(process.env.WHATSAPP_PROVIDER || '').trim().toLowerCase()
  const providerSupported = provider === 'meta' || provider === 'meta-whatsapp-cloud'
  const availableWhatsappKeys = Object.keys(process.env)
    .filter((key) => key.startsWith('WHATSAPP_') || key === 'CRON_SECRET')
    .sort()
  return {
    missing,
    provider,
    providerSupported,
    expected: {
      templateName: REQUIRED_TEMPLATE_NAME,
      templateLanguageCode: String(process.env.WHATSAPP_TEMPLATE_LANGUAGE_CODE || 'ar').trim() || 'ar',
      templateVariablesCount: REQUIRED_TEMPLATE_VARIABLES,
    },
    debug: {
      cwd: process.cwd(),
      nodeEnv: String(process.env.NODE_ENV || ''),
      providerRaw: String(process.env.WHATSAPP_PROVIDER || ''),
      cronSecretState: process.env.CRON_SECRET ? 'present' : 'missing',
      accessTokenState: process.env.WHATSAPP_ACCESS_TOKEN ? 'present' : 'missing',
      phoneNumberIdState: process.env.WHATSAPP_PHONE_NUMBER_ID ? 'present' : 'missing',
      availableWhatsappKeys,
    },
  }
}

function isValidE164(value: string) {
  return /^\+\d{8,15}$/.test(String(value || '').trim())
}

async function getActiveSendJob(adminDb: any, inviteId: string) {
  try {
    const snap = await adminDb
      .collection('send_jobs')
      .where('inviteId', '==', inviteId)
      .where('status', 'in', ['scheduled', 'dispatching', 'processing'])
      .limit(1)
      .get()
    if (snap.empty) return null
    const row = snap.docs[0]
    return { id: row.id, ...(row.data() as any) }
  } catch {
    const fallback = await adminDb.collection('send_jobs').where('inviteId', '==', inviteId).limit(50).get()
    const firstActive = fallback.docs
      .map((d: any) => ({ id: d.id, ...(d.data() as any) }))
      .find((row: any) => ['scheduled', 'dispatching', 'processing'].includes(String(row?.status || '')))
    return firstActive || null
  }
}

async function runProcessJobSync(params: {
  origin: string
  cronSecret: string
  inviteId: string
  jobId: string
  reason: string
}) {
  const { origin, cronSecret, inviteId, jobId, reason } = params
  console.info('[API][SEND_NOW] sync-process-fallback-before', { inviteId, jobId, reason })
  const processRes = await fetch(
    `${origin}/api/internal/send/process-job/${encodeURIComponent(jobId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    }
  )
  const processData = await processRes.json().catch(() => ({}))
  console.info('[API][SEND_NOW] sync-process-fallback-after', {
    inviteId,
    jobId,
    reason,
    ok: processRes.ok,
    status: processRes.status,
    resultStatus: processData?.status || null,
    sent: processData?.sent ?? null,
    failed: processData?.failed ?? null,
    error: processData?.error || null,
  })
  return { processRes, processData }
}

export async function POST(request: NextRequest, { params }: { params: { invId: string } }) {
  try {
    const { uid, authHeader, adminDb } = await getSession(request)
    const inviteId = String(params?.invId || '').trim()
    console.info('[API][SEND_NOW] request-received', {
      inviteId,
      uid,
      origin: request.nextUrl.origin,
    })
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const env = validateEnv()
    console.info('[SEND_NOW][ENV_DEBUG]', {
      inviteId,
      cwd: env.debug.cwd,
      nodeEnv: env.debug.nodeEnv,
      provider: env.debug.providerRaw,
      providerSupported: env.providerSupported,
      cronSecret: env.debug.cronSecretState,
      accessToken: env.debug.accessTokenState,
      phoneNumberId: env.debug.phoneNumberIdState,
      availableWhatsappKeys: env.debug.availableWhatsappKeys,
      missingEnv: env.missing,
    })
    if (env.missing.length || !env.providerSupported) {
      return NextResponse.json(
        {
          error: 'Missing or invalid WhatsApp environment configuration',
          missingEnv: env.missing,
          provider: env.provider,
          providerSupported: env.providerSupported,
          requiredTemplate: env.expected,
          envDebug: env.debug,
        },
        { status: 409 }
      )
    }

    const lockOwner = `send-now:${uid}`
    const protection = await runDispatchProtection({
      adminDb,
      source: 'send_now',
      inviteId,
      checkGuestRelations: true,
      blockOnFailure: true,
      acquireLock: true,
      lockOwner,
    })
    if (!protection.valid) {
      return NextResponse.json(
        {
          error: protection.reason,
          decision: protection.decision,
          inviteId,
          orderCode: protection.orderCode || '',
          sendJobId: protection.sendJobId || '',
        },
        { status: protection.decision === 'orphan_blocked' ? 404 : 409 }
      )
    }
    const lockKey = String(protection.lock?.key || '').trim()
    try {
      const inviteRef = protection.context?.inviteRef || adminDb.collection('invites').doc(inviteId)
      const invite = protection.context?.invite || {}
      if (String(invite?.ownerId || '') !== uid) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const orderCode = String(protection.orderCode || invite?.orderCode || invite?.orderNumber || '').trim()
      const dispatchTag = `[DISPATCH][${orderCode || inviteId}]`
      console.info(`${dispatchTag} send-now-request`, { inviteId, uid, orderCode: orderCode || null })

      const guestsSnap = await inviteRef.collection('guests').get()
      const totalGuests = guestsSnap.size
      const packageLimit = Number(invite?.packageGuests || invite?.guestLimit || 0)
      const overLimit = packageLimit > 0 && totalGuests > packageLimit
      const imageUrl = String(invite?.previewUrl || invite?.inviteImageUrl || invite?.finalUrl || '').trim()
      const missingImage = !imageUrl

      const invalidPhoneGuests: string[] = []
      const missingRsvpGuests: string[] = []
      const eligibleGuests: string[] = []
      for (const doc of guestsSnap.docs) {
        const guest = doc.data() as any
        const guestId = doc.id
        const sendStatus = String(guest?.sendStatus || 'pending')
        const phone = String(guest?.phoneE164 || guest?.phone || '').trim()
        const rsvpToken = String(guest?.rsvpToken || '').trim()
        if (!phone || !isValidE164(phone)) invalidPhoneGuests.push(guestId)
        if (!rsvpToken) missingRsvpGuests.push(guestId)
        if (phone && isValidE164(phone) && sendStatus !== 'sent') eligibleGuests.push(guestId)
      }

      if (missingImage || overLimit || invalidPhoneGuests.length || missingRsvpGuests.length || eligibleGuests.length === 0) {
        console.warn('[API][SEND_NOW] readiness-check-failed', {
          inviteId,
          missingImage,
          overLimit,
          invalidPhoneCount: invalidPhoneGuests.length,
          missingRsvpCount: missingRsvpGuests.length,
          eligibleGuestsCount: eligibleGuests.length,
        })
        return NextResponse.json(
          {
            error: 'Invitation is not ready for WhatsApp sending',
            readiness: {
              missingFinalImage: missingImage,
              packageLimit,
              totalGuests,
              exceedsPackage: overLimit,
              invalidPhoneCount: invalidPhoneGuests.length,
              missingRsvpTokenCount: missingRsvpGuests.length,
              eligibleGuestsCount: eligibleGuests.length,
              invalidPhoneGuestIds: invalidPhoneGuests.slice(0, 20),
              missingRsvpGuestIds: missingRsvpGuests.slice(0, 20),
            },
          },
          { status: 409 }
        )
      }

    console.info('[API][SEND_NOW] before-schedule-send', { inviteId })
      const scheduleRes = await fetch(
      `${request.nextUrl.origin}/api/user/invitations/${encodeURIComponent(inviteId)}/schedule-send`,
      {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          immediate: true,
          scheduledSendAt: new Date().toISOString(),
          timezone: 'Asia/Riyadh',
        }),
      }
    )
      const scheduleData = await scheduleRes.json().catch(() => ({}))
    console.info('[API][SEND_NOW] after-schedule-send', {
      inviteId,
      ok: scheduleRes.ok,
      status: scheduleRes.status,
      jobId: scheduleData?.jobId || null,
      error: scheduleData?.error || null,
    })
      if (!scheduleRes.ok) {
      const activeJob = await getActiveSendJob(adminDb, inviteId)
      const activeStatus = String(activeJob?.status || '').trim()
      if (activeJob && ['scheduled', 'dispatching', 'processing'].includes(activeStatus)) {
        console.warn('[API][SEND_NOW] schedule-send-not-ok-with-active-job', {
          inviteId,
          activeJobId: String(activeJob.id),
          activeStatus,
          scheduleStatus: scheduleRes.status,
          scheduleError: scheduleData?.error || null,
        })
        // Synchronous fallback: if an active job is already in progress, force process execution now.
        if (activeStatus === 'dispatching' || activeStatus === 'processing') {
          const cronSecret = String(process.env.CRON_SECRET || '').trim()
          const activeJobId = String(activeJob.id)
          const { processRes, processData } = await runProcessJobSync({
            origin: request.nextUrl.origin,
            cronSecret,
            inviteId,
            jobId: activeJobId,
            reason: 'schedule-send-failed-with-existing-active-job',
          })
          if (!processRes.ok) {
            return NextResponse.json(
              {
                error: processData?.error || 'Failed to process existing active send job',
                stage: 'process-job',
                details: processData,
                jobId: activeJobId,
                activeJobStatus: activeStatus,
              },
              { status: processRes.status || 500 }
            )
          }
          return NextResponse.json({
            ok: true,
            inviteId,
            jobId: activeJobId,
            flow: ['existing-active-job', 'sync-process-fallback'],
            activeJobStatus: activeStatus,
            result: processData,
            requiredTemplate: env.expected,
          })
        }
      }
        return NextResponse.json(
        {
          error: scheduleData?.error || 'Failed to schedule send job',
          stage: 'schedule-send',
          details: scheduleData,
        },
        { status: scheduleRes.status || 500 }
      )
      }
      let jobId = String(scheduleData?.jobId || '').trim()
      if (!jobId) {
        return NextResponse.json({ error: 'schedule-send did not return jobId', stage: 'schedule-send' }, { status: 500 })
      }

      if (lockKey) {
        await renewDispatchKernelLock(adminDb, {
          lockKey,
          lockOwner,
          lockTtlMs: Number(process.env.DISPATCH_KERNEL_LOCK_TTL_MS || 60_000),
        }).catch(() => null)
      }

      const cronSecret = String(process.env.CRON_SECRET || '').trim()
      console.info('[API][SEND_NOW] before-dispatch', { inviteId, jobId })
      const dispatchRes = await fetch(`${request.nextUrl.origin}/api/internal/send/dispatch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ maxJobs: 50 }),
    })
      const dispatchData = await dispatchRes.json().catch(() => ({}))
    console.info('[API][SEND_NOW] after-dispatch', {
      inviteId,
      ok: dispatchRes.ok,
      status: dispatchRes.status,
      pickedJobIds: Array.isArray(dispatchData?.pickedJobIds) ? dispatchData.pickedJobIds : [],
      error: dispatchData?.error || null,
    })
      if (!dispatchRes.ok) {
      return NextResponse.json(
        {
          error: dispatchData?.error || 'Failed to dispatch send jobs',
          stage: 'dispatch',
          details: dispatchData,
          jobId,
        },
        { status: dispatchRes.status || 500 }
      )
      }
      const pickedJobIds = Array.isArray(dispatchData?.pickedJobIds) ? dispatchData.pickedJobIds.map(String) : []
      if (!pickedJobIds.includes(jobId)) {
      // A pre-existing scheduled job can still be active but not picked in this dispatch call.
      const activeJob = await getActiveSendJob(adminDb, inviteId)
      if (activeJob?.id) {
        jobId = String(activeJob.id)
      }
      }
      if (!pickedJobIds.includes(jobId)) {
      const activeJob = await getActiveSendJob(adminDb, inviteId)
      const activeStatus = String(activeJob?.status || '').trim()
      if (activeJob && ['dispatching', 'processing'].includes(activeStatus)) {
        const activeJobId = String(activeJob.id)
        console.warn('[API][SEND_NOW] dispatch-did-not-pick-target-job', {
          inviteId,
          requestedJobId: jobId,
          activeJobId,
          activeStatus,
          pickedJobIds,
        })
        const { processRes, processData } = await runProcessJobSync({
          origin: request.nextUrl.origin,
          cronSecret,
          inviteId,
          jobId: activeJobId,
          reason: 'dispatch-missed-job-with-existing-active-job',
        })
        if (!processRes.ok) {
          return NextResponse.json(
            {
              error: processData?.error || 'Failed to process active send job after dispatch fallback',
              stage: 'process-job',
              details: processData,
              jobId: activeJobId,
              activeJobStatus: activeStatus,
              pickedJobIds,
            },
            { status: processRes.status || 500 }
          )
        }
        return NextResponse.json({
          ok: true,
          inviteId,
          jobId: activeJobId,
          flow: ['dispatch', 'existing-active-job', 'sync-process-fallback'],
          activeJobStatus: activeStatus,
          result: processData,
          requiredTemplate: env.expected,
        })
      }
        return NextResponse.json(
        {
          error: 'Send job was scheduled but not picked by dispatch',
          stage: 'dispatch',
          jobId,
          pickedJobIds,
        },
        { status: 409 }
      )
      }

      console.info('[API][SEND_NOW] before-process-job', { inviteId, jobId })
      const { processRes, processData } = await runProcessJobSync({
      origin: request.nextUrl.origin,
      cronSecret,
      inviteId,
      jobId,
      reason: 'normal-post-dispatch-flow',
    })
      console.info('[API][SEND_NOW] after-process-job', {
      inviteId,
      jobId,
      ok: processRes.ok,
      status: processRes.status,
      resultStatus: processData?.status || null,
      sent: processData?.sent ?? null,
      failed: processData?.failed ?? null,
      error: processData?.error || null,
    })
      if (!processRes.ok) {
        return NextResponse.json(
        {
          error: processData?.error || 'Failed to process send job',
          stage: 'process-job',
          details: processData,
          jobId,
        },
        { status: processRes.status || 500 }
      )
      }

      console.info('[API][SEND_NOW] completed', { inviteId, jobId })
      return NextResponse.json({
        ok: true,
        inviteId,
        jobId,
        flow: ['schedule-send', 'dispatch', 'process-job'],
        result: processData,
        requiredTemplate: env.expected,
      })
    } finally {
      if (lockKey) {
        await releaseDispatchKernelLock(adminDb, { lockKey, lockOwner }).catch(() => null)
      }
    }
  } catch (error: any) {
    console.error('[API][SEND_NOW] failed', {
      error: error?.message || String(error),
    })
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to send via WhatsApp' }, { status })
  }
}

