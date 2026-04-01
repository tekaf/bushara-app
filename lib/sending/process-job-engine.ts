import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore, QueryDocumentSnapshot } from 'firebase-admin/firestore'
import { createWhatsAppProviderService } from '@/lib/sending/provider-factory'
import { acquireSendJobLock, buildGuestSendIdempotencyKey, claimSendIdempotency, releaseSendJobLock } from '@/lib/sending/processing-guard'
import { getWorkflowTransitionError, INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

type ProcessSendJobInput = {
  jobId: string
  lockOwner?: string
  batchSize?: number
  maxConcurrency?: number
  messageDelayMs?: number
  batchDelayMs?: number
}

type JobProcessingSummary = {
  jobId: string
  inviteId: string
  status: 'completed' | 'partially_completed' | 'failed'
  candidates: number
  attempted: number
  sent: number
  failed: number
  skipped: number
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function chunk<T>(items: T[], size: number) {
  if (size <= 0) return [items]
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

function getDueSendStatus(value: any) {
  const status = String(value || 'pending')
  if (status === 'pending' || status === 'scheduled' || status === 'send_pending') return status
  return null
}

function toJsonSafe(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[truncated]'
  if (value === null) return null
  const t = typeof value
  if (t === 'string' || t === 'number' || t === 'boolean') return value
  if (t === 'undefined') return null
  if (t === 'bigint') return String(value)
  if (t === 'function' || t === 'symbol') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map((v) => toJsonSafe(v, depth + 1))
  if (t === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = toJsonSafe(v, depth + 1)
    }
    return out
  }
  return String(value)
}

function isRetryableErrorKind(kind: string | undefined | null) {
  const value = String(kind || '').toLowerCase()
  return value === 'transient' || value === 'throttled'
}

function normalizeOccasionLabel(value: string): string {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'wedding') return 'زواج أو ملكه'
  if (key === 'engagement') return 'خطبة'
  if (key === 'special') return 'مناسبة خاصة'
  return String(value || '').trim()
}

function buildTemplateVariables(invite: any) {
  const groomName = String(invite?.groomName || '').trim()
  const brideName = String(invite?.brideName || '').trim()
  const hostDisplayName =
    String(
      invite?.hostDisplayName ||
        invite?.inviterDisplayName ||
        invite?.customerDisplayName ||
        invite?.customerName ||
        ''
    ).trim() ||
    (groomName && brideName ? `${groomName} و ${brideName}` : groomName || brideName || 'أصحاب الدعوة')

  const occasionType = normalizeOccasionLabel(
    String(invite?.selectedOccasion || invite?.occasionType || invite?.title || '').trim()
  )
  const eventDate = String(invite?.fullDateLine || invite?.dateText || invite?.date || '').trim() || '-'
  const additionalDetail = (groomName && brideName ? `${groomName} على ${brideName}` : '').trim() || '-'

  return {
    hostDisplayName,
    occasionType: occasionType || '-',
    eventDate,
    additionalDetail,
  }
}

function countInviteSendSummary(docs: QueryDocumentSnapshot[]) {
  const summary = { total: docs.length, pending: 0, sent: 0, failed: 0 }
  for (const doc of docs) {
    const row = doc.data() as any
    const sendStatus = String(row?.sendStatus || 'pending')
    if (sendStatus === 'sent') summary.sent += 1
    else if (sendStatus === 'failed') summary.failed += 1
    else summary.pending += 1
  }
  return summary
}

async function setInviteWorkflowIfAllowed(
  adminDb: Firestore,
  inviteId: string,
  nextStatus: string
) {
  const inviteRef = adminDb.collection('invites').doc(inviteId)
  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) return
  const invite = inviteSnap.data() as any
  const transitionError = getWorkflowTransitionError(String(invite?.workflowStatus || ''), nextStatus as any)
  if (transitionError) return
  await inviteRef.set(
    {
      workflowStatus: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}

export async function processSendJob(adminDb: Firestore, input: ProcessSendJobInput): Promise<JobProcessingSummary> {
  const batchSize = Math.max(1, Math.min(500, Number(input.batchSize || process.env.SEND_BATCH_SIZE || 50)))
  const maxConcurrency = Math.max(
    1,
    Math.min(20, Number(input.maxConcurrency || process.env.SEND_MAX_CONCURRENCY || 5))
  )
  const messageDelayMs = Math.max(0, Number(input.messageDelayMs || process.env.SEND_MESSAGE_DELAY_MS || 250))
  const batchDelayMs = Math.max(0, Number(input.batchDelayMs || process.env.SEND_BATCH_DELAY_MS || 2000))
  const lockOwner = String(input.lockOwner || `process-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  const maxAttempts = 3
  const autoRetryDelayMs = Math.max(0, Number(process.env.SEND_AUTO_RETRY_DELAY_MS || 1500))

  const jobRef = adminDb.collection('send_jobs').doc(input.jobId)
  const jobSnap = await jobRef.get()
  if (!jobSnap.exists) throw new Error('Job not found')
  const job = jobSnap.data() as any
  const inviteId = String(job?.inviteId || '').trim()
  if (!inviteId) throw new Error('Job is missing inviteId')
  const jobStatus = String(job?.status || '')
  if (jobStatus !== 'dispatching' && jobStatus !== 'processing') {
    throw new Error(`Invalid job status for processing: ${jobStatus}`)
  }

  const lock = await acquireSendJobLock(adminDb, {
    jobId: input.jobId,
    lockOwner,
    lockTtlMs: Number(process.env.SEND_JOB_LOCK_TTL_MS || 60_000),
  })
  if (!lock.acquired) throw new Error(`Could not acquire lock for job: ${lock.reason || 'unknown'}`)

  await jobRef.set(
    {
      status: 'processing',
      processingStartedAt: FieldValue.serverTimestamp(),
      processingBy: lockOwner,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  await setInviteWorkflowIfAllowed(adminDb, inviteId, INVITE_WORKFLOW_STATUS.SENDING)

  const inviteRef = adminDb.collection('invites').doc(inviteId)
  const guestsSnap = await inviteRef.collection('guests').get()
  const candidates = guestsSnap.docs.filter((doc) => {
    const row = doc.data() as any
    return Boolean(getDueSendStatus(row?.sendStatus))
  })

  const provider = createWhatsAppProviderService()
  const inviteSnap = await inviteRef.get()
  const invite = inviteSnap.exists ? (inviteSnap.data() as any) : {}
  const templateVars = buildTemplateVariables(invite)
  const templateName = 'bashara_invitation_v1'
  const templateLanguageCode = String(process.env.WHATSAPP_TEMPLATE_LANGUAGE_CODE || 'ar').trim() || 'ar'
  const defaultMessageTemplate =
    process.env.SEND_DEFAULT_MESSAGE_TEMPLATE || 'اهلا {name}، ندعوك لحضور المناسبة. الرجاء مراجعة دعوة المناسبة.'
  const mediaUrl = String(invite?.previewUrl || invite?.inviteImageUrl || invite?.finalUrl || '').trim() || undefined

  let attempted = 0
  let sent = 0
  let failed = 0
  let skipped = 0
  let autoRetried = 0

  const batches = chunk(candidates, batchSize)
  for (let b = 0; b < batches.length; b += 1) {
    const batch = batches[b]
    let cursor = 0
    const workerCount = Math.min(maxConcurrency, batch.length)

    await Promise.all(
      Array.from({ length: workerCount }, async (_, workerIndex) => {
        while (true) {
          const currentIndex = cursor
          cursor += 1
          if (currentIndex >= batch.length) break
          const guestDoc = batch[currentIndex]
          const guest = guestDoc.data() as any
          const guestId = guestDoc.id
          if (messageDelayMs > 0 && (currentIndex > 0 || workerIndex > 0)) {
            await sleep(messageDelayMs)
          }

          let currentAttempts = Number(guest?.sendAttemptCount || 0)
          if (currentAttempts >= maxAttempts) {
            failed += 1
            await inviteRef.collection('guests').doc(guestId).set(
              {
                sendStatus: 'failed',
                lastSendError: `Max attempts (${maxAttempts}) reached.`,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            )
            await adminDb.collection('send_logs').add({
              inviteId,
              guestId,
              jobId: input.jobId,
              status: 'skipped',
              errorCode: 'max_attempts_reached',
              errorMessage: `Max attempts (${maxAttempts}) reached.`,
              createdAt: FieldValue.serverTimestamp(),
            })
            continue
          }

          const recipient = String(guest?.phoneE164 || guest?.phone || '').trim()
          const guestName = String(guest?.name || 'ضيفنا الكريم').trim()
          const message = defaultMessageTemplate.replace(/\{name\}/g, guestName || 'ضيفنا الكريم')
          const rsvpToken = String(guest?.rsvpToken || '').trim()
          const missingTemplateInputs: string[] = []
          if (!mediaUrl) missingTemplateInputs.push('invite image URL (previewUrl/inviteImageUrl/finalUrl)')
          if (!rsvpToken) missingTemplateInputs.push('guest rsvpToken')

          let guestSent = false
          let terminalFailureMessage = 'Unknown provider error'
          let terminalFailureCode = 'unknown'

          if (missingTemplateInputs.length) {
            failed += 1
            terminalFailureCode = 'template_input_missing'
            terminalFailureMessage = `Missing WhatsApp template inputs: ${missingTemplateInputs.join(', ')}`
            await inviteRef.collection('guests').doc(guestId).set(
              {
                sendStatus: 'failed',
                sendAttemptCount: Number(guest?.sendAttemptCount || 0),
                lastSendAt: FieldValue.serverTimestamp(),
                lastSendError: terminalFailureMessage,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            )
            await adminDb.collection('send_logs').add({
              inviteId,
              guestId,
              jobId: input.jobId,
              status: 'failed',
              errorCode: terminalFailureCode,
              errorMessage: terminalFailureMessage,
              createdAt: FieldValue.serverTimestamp(),
            })
            continue
          }

          while (currentAttempts < maxAttempts && !guestSent) {
            const attempt = currentAttempts + 1
            const idempotencyKey = buildGuestSendIdempotencyKey({
              inviteId,
              guestId,
              jobId: input.jobId,
              attempt,
            })

            const claim = await claimSendIdempotency(adminDb, {
              key: idempotencyKey,
              inviteId,
              guestId,
              jobId: input.jobId,
              metadata: { lockOwner, attempt, maxAttempts },
            })
            if (!claim.claimed) {
              skipped += 1
              currentAttempts = attempt
              terminalFailureCode = 'duplicate_idempotency'
              terminalFailureMessage = 'Guest send already processed for this idempotency key.'
              await adminDb.collection('send_logs').add({
                inviteId,
                guestId,
                jobId: input.jobId,
                status: 'skipped',
                errorCode: terminalFailureCode,
                errorMessage: terminalFailureMessage,
                idempotencyKey,
                attempt,
                createdAt: FieldValue.serverTimestamp(),
              })
              continue
            }

            attempted += 1
            await inviteRef.collection('guests').doc(guestId).set(
              {
                sendStatus: 'send_pending',
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            )

            try {
              const result = await provider.sendMessage(
                {
                  to: recipient,
                  body: message,
                  ...(mediaUrl ? { mediaUrl } : {}),
                  template: {
                    name: templateName,
                    languageCode: templateLanguageCode,
                    headerImageUrl: mediaUrl,
                    bodyVariables: [
                      templateVars.hostDisplayName,
                      templateVars.occasionType,
                      templateVars.eventDate,
                      templateVars.additionalDetail,
                    ],
                    buttonDynamicValue: rsvpToken,
                  },
                },
                {
                  inviteId,
                  guestId,
                  jobId: input.jobId,
                  attempt,
                  idempotencyKey,
                }
              )

              if (!result.accepted) {
                throw new Error('Provider did not accept the message')
              }

              guestSent = true
              sent += 1
              currentAttempts = attempt
              await inviteRef.collection('guests').doc(guestId).set(
                {
                  sendStatus: 'sent',
                  sendAttemptCount: attempt,
                  lastSendAt: FieldValue.serverTimestamp(),
                  lastSendError: '',
                  updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
              )
              await adminDb.collection('send_logs').add({
                inviteId,
                guestId,
                jobId: input.jobId,
                status: 'accepted',
                providerMessageId: result.providerMessageId || '',
                providerResponse: toJsonSafe(result.rawResponse || {}),
                idempotencyKey,
                attempt,
                createdAt: FieldValue.serverTimestamp(),
              })
            } catch (error: unknown) {
              const normalized = provider.normalizeError(error)
              terminalFailureCode = normalized.code || normalized.kind || 'unknown'
              terminalFailureMessage = normalized.message || 'Unknown provider error'
              const shouldRetry = isRetryableErrorKind(normalized.kind) && attempt < maxAttempts

              await adminDb.collection('send_logs').add({
                inviteId,
                guestId,
                jobId: input.jobId,
                status: 'failed',
                errorCode: terminalFailureCode,
                errorMessage: terminalFailureMessage,
                providerResponse: toJsonSafe(normalized.rawError as any),
                idempotencyKey,
                attempt,
                willRetry: shouldRetry,
                retryKind: normalized.kind || 'unknown',
                createdAt: FieldValue.serverTimestamp(),
              })

              currentAttempts = attempt
              if (shouldRetry) {
                autoRetried += 1
                if (autoRetryDelayMs > 0) await sleep(autoRetryDelayMs)
                continue
              }
            }
          }

          if (!guestSent) {
            failed += 1
            await inviteRef.collection('guests').doc(guestId).set(
              {
                sendStatus: 'failed',
                sendAttemptCount: currentAttempts,
                lastSendAt: FieldValue.serverTimestamp(),
                lastSendError: terminalFailureMessage,
                updatedAt: FieldValue.serverTimestamp(),
              },
              { merge: true }
            )
          }
        }
      })
    )

    if (batchDelayMs > 0 && b < batches.length - 1) {
      await sleep(batchDelayMs)
    }
  }

  const finalStatus: JobProcessingSummary['status'] =
    failed > 0 && sent === 0 ? 'failed' : failed > 0 ? 'partially_completed' : 'completed'

  await jobRef.set(
    {
      status: finalStatus,
      processingFinishedAt: FieldValue.serverTimestamp(),
      processedAt: FieldValue.serverTimestamp(),
      resultSummary: {
        candidates: candidates.length,
        attempted,
        autoRetried,
        maxAttempts,
        sent,
        failed,
        skipped,
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  await releaseSendJobLock(adminDb, { jobId: input.jobId, lockOwner }).catch(() => null)

  if (finalStatus === 'completed') {
    await setInviteWorkflowIfAllowed(adminDb, inviteId, INVITE_WORKFLOW_STATUS.SENT)
  } else {
    await setInviteWorkflowIfAllowed(adminDb, inviteId, INVITE_WORKFLOW_STATUS.PARTIALLY_SENT)
  }

  const updatedGuests = await inviteRef.collection('guests').get()
  const inviteSummary = countInviteSendSummary(updatedGuests.docs)
  await inviteRef.set(
    {
      sendStatusSummary: inviteSummary,
      lastSendAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  return {
    jobId: input.jobId,
    inviteId,
    status: finalStatus,
    candidates: candidates.length,
    attempted,
    sent,
    failed,
    skipped,
  }
}

