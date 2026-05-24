import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { createHash } from 'crypto'
import { releaseDispatchKernelLock, runDispatchProtection } from '@/lib/dispatch/kernel'
import { normalizeWhatsAppPhone } from '@/lib/risk-case/phone'
import { generateWhatsAppLink } from '@/lib/risk-case/whatsapp'
import {
  buildInviteEventDate,
  buildInviteHostName,
  buildInviteOccasionType,
  buildRiskCaseMessage,
  validateRiskCaseMessageContext,
} from '@/lib/risk-case/message'
import { validateGuestRsvpIntegrity } from '@/lib/risk-case/rsvp-integrity'
import { splitGuestsIntoWaves } from '@/lib/risk-case/waves'
import {
  addShortRsvpMappingToBatch,
  buildShortInvitationLink,
  resolveGuestShortRsvpCode,
} from '@/lib/risk-case/short-rsvp'

type PrepareRiskCaseDispatchInput = {
  adminDb: Firestore
  inviteId: string
  preparedBy: string
  source: string
  appOrigin?: string
  forceRegenerate?: boolean
}

type RiskCaseGuestEntry = {
  guestId: string
  guestName: string
  rawPhone: string
  normalizedPhone: string
  whatsappLink: string
  invitationLink: string
  shortInvitationLink: string
  messageText: string
  waveNumber: number
  sendStatus:
    | 'pending_manual'
    | 'ready_manual'
    | 'manual_opened'
    | 'manually_sent'
    | 'manual_retry_needed'
    | 'blocked_missing_rsvp_token'
    | 'blocked_invalid_phone'
    | 'blocked_duplicate'
    | 'blocked_orphan'
    | 'blocked_missing_message_context'
  lastAttemptAt: null
  manualSendCount: number
  reason: string
}

type PrepareRiskCaseDispatchResult = {
  ok: boolean
  blocked: boolean
  decision?: string
  reason?: string
  inviteId: string
  orderCode: string
  dispatchId: string
  recordsCreated: number
  guestsPrepared: number
  invalidPhones: number
  totalWaves: number
  blockingCounts: {
    blocked_missing_rsvp_token: number
    blocked_invalid_phone: number
    blocked_duplicate: number
    blocked_orphan: number
    blocked_missing_message_context: number
  }
  duplicatesDetected: number
  orphanPreventionHits: number
}

function toMillis(value: any): number {
  if (!value) return 0
  if (typeof value?.toMillis === 'function') return Number(value.toMillis() || 0)
  if (typeof value?.getTime === 'function') return Number(value.getTime() || 0)
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

function deterministicGuestSort(a: { id: string; row: any }, b: { id: string; row: any }) {
  const aCreated = toMillis(a.row?.createdAt)
  const bCreated = toMillis(b.row?.createdAt)
  if (aCreated !== bCreated) return aCreated - bCreated
  return String(a.id).localeCompare(String(b.id))
}

function logRiskCase(event: string, payload: Record<string, unknown>) {
  console.info('[RISK_CASE]', { event, ...payload })
}

async function clearRiskCaseRecords(adminDb: Firestore, inviteId: string) {
  const dispatchRef = adminDb.collection('risk_case_dispatches').doc(inviteId)
  const [entriesSnap, wavesSnap] = await Promise.all([
    dispatchRef.collection('entries').get(),
    adminDb.collection('risk_case_waves').where('inviteId', '==', inviteId).get(),
  ])
  if (entriesSnap.empty && wavesSnap.empty) return
  const batch = adminDb.batch()
  for (const doc of entriesSnap.docs) batch.delete(doc.ref)
  for (const doc of wavesSnap.docs) batch.delete(doc.ref)
  await batch.commit()
}

function isLocalhostUrl(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(String(value || '').trim())
}

function resolveRiskCaseAppOrigin(inputOrigin?: string): string {
  const envBase = String(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || inputOrigin || '').trim()
  if (!envBase) {
    throw new Error('APP_BASE_URL is required for Risk Case links')
  }
  const candidate = String(envBase).trim().replace(/\/+$/, '')
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  if (isLocalhostUrl(candidate)) {
    if (isProduction) {
      throw new Error('Invalid Risk Case origin in production: localhost is not allowed')
    }
    return candidate
  }
  return candidate
}

export async function prepareRiskCaseDispatchData(
  input: PrepareRiskCaseDispatchInput
): Promise<PrepareRiskCaseDispatchResult> {
  const { adminDb, inviteId } = input
  const protection = await runDispatchProtection({
    adminDb,
    source: 'manual_dispatch',
    inviteId,
    checkGuestRelations: true,
    blockOnFailure: true,
    acquireLock: true,
    lockOwner: `risk-case:${input.preparedBy || 'system'}`,
  })

  if (!protection.valid) {
    return {
      ok: false,
      blocked: true,
      decision: protection.decision,
      reason: protection.reason,
      inviteId,
      orderCode: String(protection.orderCode || ''),
      dispatchId: inviteId,
      recordsCreated: 0,
      guestsPrepared: 0,
      invalidPhones: 0,
      totalWaves: 0,
      blockingCounts: {
        blocked_missing_rsvp_token: 0,
        blocked_invalid_phone: 0,
        blocked_duplicate: 0,
        blocked_orphan: protection.decision === 'orphan_blocked' ? 1 : 0,
        blocked_missing_message_context: 0,
      },
      duplicatesDetected: protection.decision === 'duplicate_attempt' ? 1 : 0,
      orphanPreventionHits: protection.decision === 'orphan_blocked' ? 1 : 0,
    }
  }
  const lockOwner = `risk-case:${input.preparedBy || 'system'}`
  const lockKey = String(protection.lock?.key || '').trim()

  try {
    const inviteRef = protection.context?.inviteRef || adminDb.collection('invites').doc(inviteId)
    const invite = protection.context?.invite || (await inviteRef.get()).data() || {}
    const orderCode = String(protection.orderCode || invite?.orderCode || invite?.orderNumber || '').trim()
    const appOrigin = resolveRiskCaseAppOrigin(input.appOrigin)

    const dispatchRef = adminDb.collection('risk_case_dispatches').doc(inviteId)
    const existingDispatchSnap = await dispatchRef.get()
    const existingPreparedAt = toMillis((existingDispatchSnap.data() as any)?.preparedAt)
    const inviteUpdatedAt = toMillis(invite?.updatedAt || invite?.createdAt)

    if (!input.forceRegenerate && existingDispatchSnap.exists && existingPreparedAt >= inviteUpdatedAt) {
      const existing = existingDispatchSnap.data() as any
      return {
        ok: true,
        blocked: false,
        inviteId,
        orderCode,
        dispatchId: inviteId,
        recordsCreated: 0,
        guestsPrepared: Number(existing?.totalGuests || 0),
        invalidPhones: Number(existing?.invalidPhones || 0),
        totalWaves: Number(existing?.totalWaves || 0),
        blockingCounts: {
          blocked_missing_rsvp_token: Number(existing?.missingRsvpTokens || 0),
          blocked_invalid_phone: Number(existing?.invalidPhones || 0),
          blocked_duplicate: Number(existing?.duplicatesDetected || 0),
          blocked_orphan: Number(existing?.orphanDetected || 0),
          blocked_missing_message_context: Number(existing?.missingMessageContexts || 0),
        },
        duplicatesDetected: Number(existing?.duplicatesDetected || 0),
        orphanPreventionHits: 0,
      }
    }
    if (input.forceRegenerate) {
      await clearRiskCaseRecords(adminDb, inviteId)
    }

    const guestsSnap = await inviteRef.collection('guests').get()
    const sortedGuests = guestsSnap.docs.map((doc) => ({ id: doc.id, row: doc.data() as any })).sort(deterministicGuestSort)
    const waves = splitGuestsIntoWaves(sortedGuests, 20)

    const internalSnap = await adminDb.collection('invitation_internal').doc(inviteId).get()
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
    const snapshot = (internal?.finalInvitationSnapshot || {}) as any
    const hostName = buildInviteHostName({
      ...invite,
      groomName: invite?.groomName || snapshot?.fields?.groomNameAr || '',
      brideName: invite?.brideName || snapshot?.fields?.brideNameAr || '',
    })
    const occasionTypeLabel = buildInviteOccasionType(invite)
    const eventDateLabel = buildInviteEventDate({
      ...invite,
      fullDateLine: invite?.fullDateLine || snapshot?.fields?.fullDateLine || '',
      dateText: invite?.dateText || snapshot?.fields?.dateText || snapshot?.fields?.date_en || '',
      date: invite?.date || snapshot?.fields?.date || '',
    })

    const seenPhones = new Set<string>()
    const usedShortCodes = new Set<string>()
    const entries: RiskCaseGuestEntry[] = []
    const shortCodeByGuestId: Record<string, string> = {}
    const rsvpTokenByGuestId: Record<string, string> = {}
    let invalidPhones = 0
    let duplicateCount = 0
    let missingRsvpTokenCount = 0
    let orphanCount = 0
    let missingMessageContextCount = 0

    for (const wave of waves) {
      for (const guestItem of wave.guests) {
        const guest = guestItem.row || {}
        const guestId = guestItem.id
        const guestName = String(guest?.name || '').trim() || 'ضيف الكريم'
        const rawPhone = String(guest?.phoneE164 || guest?.phone || '').trim()

        const rsvpIntegrity = validateGuestRsvpIntegrity({
          inviteId,
          guestId,
          orderCode,
          guest,
          appOrigin,
        })
        if (!rsvpIntegrity.ok) {
          const blockedStatus =
            rsvpIntegrity.code === 'guest_relation_invalid' ? 'blocked_orphan' : 'blocked_missing_rsvp_token'
          if (blockedStatus === 'blocked_orphan') orphanCount += 1
          else missingRsvpTokenCount += 1
          entries.push({
            guestId,
            guestName,
            rawPhone,
            normalizedPhone: '',
            whatsappLink: '',
            invitationLink: '',
            shortInvitationLink: '',
            messageText: '',
            waveNumber: wave.waveNumber,
            sendStatus: blockedStatus,
            lastAttemptAt: null,
            manualSendCount: Number(guest?.manualSendCount || 0),
            reason: rsvpIntegrity.reason,
          })
          continue
        }
        const invitationLink = rsvpIntegrity.invitationLink

        const normalized = normalizeWhatsAppPhone(guest?.phoneE164 || guest?.phone || '')
        if (!normalized.ok) {
          invalidPhones += 1
          entries.push({
            guestId,
            guestName,
            rawPhone,
            normalizedPhone: '',
            whatsappLink: '',
            invitationLink: '',
            shortInvitationLink: '',
            messageText: '',
            waveNumber: wave.waveNumber,
            sendStatus: 'blocked_invalid_phone',
            lastAttemptAt: null,
            manualSendCount: Number(guest?.manualSendCount || 0),
            reason: normalized.reason,
          })
          continue
        }

        if (seenPhones.has(normalized.normalizedPhone)) {
          duplicateCount += 1
          entries.push({
            guestId,
            guestName,
            rawPhone,
            normalizedPhone: normalized.normalizedPhone,
            whatsappLink: '',
            invitationLink: '',
            shortInvitationLink: '',
            messageText: '',
            waveNumber: wave.waveNumber,
            sendStatus: 'blocked_duplicate',
            lastAttemptAt: null,
            manualSendCount: Number(guest?.manualSendCount || 0),
            reason: 'Duplicate normalized phone detected in this order',
          })
          continue
        }
        seenPhones.add(normalized.normalizedPhone)

        const shortRsvpCode = await resolveGuestShortRsvpCode({
          adminDb,
          inviteId,
          guestId,
          rsvpToken: rsvpIntegrity.rsvpToken,
          preferredCode: String(guest?.shortRsvpCode || ''),
          usedCodes: usedShortCodes,
        })
        const shortInvitationLink = buildShortInvitationLink(appOrigin, shortRsvpCode)
        shortCodeByGuestId[guestId] = shortRsvpCode
        rsvpTokenByGuestId[guestId] = rsvpIntegrity.rsvpToken

        const messageContext = {
          guestName,
          hostName,
          occasionTypeLabel,
          eventDateLabel,
          shortInvitationLink,
        }
        const messageContextValidation = validateRiskCaseMessageContext(messageContext)
        if (!messageContextValidation.ok) {
          missingMessageContextCount += 1
          entries.push({
            guestId,
            guestName,
            rawPhone,
            normalizedPhone: normalized.normalizedPhone,
            whatsappLink: '',
            invitationLink,
            shortInvitationLink,
            messageText: '',
            waveNumber: wave.waveNumber,
            sendStatus: 'blocked_missing_message_context',
            lastAttemptAt: null,
            manualSendCount: Number(guest?.manualSendCount || 0),
            reason: messageContextValidation.reason,
          })
          continue
        }

        const messageText = buildRiskCaseMessage(messageContext)
        const linkResult = generateWhatsAppLink({
          normalizedPhone: normalized.normalizedPhone,
          messageText,
        })
        if (!linkResult.ok) {
          invalidPhones += 1
          entries.push({
            guestId,
            guestName,
            rawPhone,
            normalizedPhone: normalized.normalizedPhone,
            whatsappLink: '',
            invitationLink,
            shortInvitationLink,
            messageText: '',
            waveNumber: wave.waveNumber,
            sendStatus: 'blocked_invalid_phone',
            lastAttemptAt: null,
            manualSendCount: Number(guest?.manualSendCount || 0),
            reason: linkResult.reason,
          })
          continue
        }

        const messageHash = createHash('sha1').update(messageText, 'utf8').digest('hex').slice(0, 12)
        console.info('[RISK_CASE][MESSAGE_BUILD]', {
          inviteId,
          guestId,
          guestName,
          hash: messageHash,
          invitationLink,
          shortInvitationLink,
        })

        entries.push({
          guestId,
          guestName,
          rawPhone,
          normalizedPhone: normalized.normalizedPhone,
          whatsappLink: linkResult.url,
          invitationLink,
          shortInvitationLink,
          messageText,
          waveNumber: wave.waveNumber,
          sendStatus: 'ready_manual',
          lastAttemptAt: null,
          manualSendCount: Number(guest?.manualSendCount || 0),
          reason: '',
        })
      }
    }

    const preparedAt = FieldValue.serverTimestamp()
    const recordsCreated = existingDispatchSnap.exists && !input.forceRegenerate ? 0 : 1

    const batch = adminDb.batch()
    batch.set(
    dispatchRef,
    {
      orderCode,
      inviteId,
      dispatchMode: 'manual',
      currentWave: 1,
      totalGuests: entries.length,
      totalWaves: waves.length,
      preparedAt,
      preparedBy: input.preparedBy || 'system',
      dispatchState: 'ready_manual',
      missingRsvpTokens: missingRsvpTokenCount,
      invalidPhones,
      duplicatesDetected: duplicateCount,
      orphanDetected: orphanCount,
      missingMessageContexts: missingMessageContextCount,
      source: input.source,
      updatedAt: preparedAt,
      createdAt: existingDispatchSnap.exists ? (existingDispatchSnap.data() as any)?.createdAt || preparedAt : preparedAt,
    },
    { merge: true }
  )

    for (const wave of waves) {
    const waveRef = adminDb.collection('risk_case_waves').doc(`${inviteId}_wave_${wave.waveNumber}`)
    batch.set(
      waveRef,
      {
        inviteId,
        orderCode,
        dispatchId: inviteId,
        waveNumber: wave.waveNumber,
        waveStatus: 'ready_manual',
        totalGuestsInWave: wave.guests.length,
        preparedAt,
        preparedBy: input.preparedBy || 'system',
        updatedAt: preparedAt,
      },
      { merge: true }
    )
  }

    for (const entry of entries) {
    const entryRef = dispatchRef.collection('entries').doc(entry.guestId)
    batch.set(
      entryRef,
      {
        ...entry,
        orderCode,
        inviteId,
        dispatchId: inviteId,
        updatedAt: preparedAt,
      },
      { merge: true }
    )
    if (entry.shortInvitationLink && entry.invitationLink) {
      const shortCode = String(shortCodeByGuestId[entry.guestId] || '').trim().toUpperCase()
      const rsvpToken = String(rsvpTokenByGuestId[entry.guestId] || '').trim()
      if (shortCode && rsvpToken) {
        addShortRsvpMappingToBatch({
          adminDb,
          batch,
          code: shortCode,
          inviteId,
          guestId: entry.guestId,
          rsvpToken,
        })
        const guestRef = inviteRef.collection('guests').doc(entry.guestId)
        batch.set(
          guestRef,
          {
            shortRsvpCode: shortCode,
            updatedAt: preparedAt,
          },
          { merge: true }
        )
      }
    }
  }

    batch.set(
    inviteRef,
    {
      dispatchMode: 'manual',
      dispatchStatus: 'ready',
      updatedAt: preparedAt,
    },
    { merge: true }
  )

    await batch.commit()

    logRiskCase('dispatch_prepared', {
      orderCode,
      inviteId,
      totalGuests: entries.length,
      totalWaves: waves.length,
      invalidPhones,
      duplicatesDetected: duplicateCount,
      missingRsvpTokenCount,
      orphanDetected: orphanCount,
      missingMessageContexts: missingMessageContextCount,
    })

    return {
      ok: true,
      blocked: false,
      inviteId,
      orderCode,
      dispatchId: inviteId,
      recordsCreated,
      guestsPrepared: entries.length,
      invalidPhones,
      totalWaves: waves.length,
      blockingCounts: {
        blocked_missing_rsvp_token: missingRsvpTokenCount,
        blocked_invalid_phone: invalidPhones,
        blocked_duplicate: duplicateCount,
        blocked_orphan: orphanCount,
        blocked_missing_message_context: missingMessageContextCount,
      },
      duplicatesDetected: duplicateCount,
      orphanPreventionHits: 0,
    }
  } finally {
    if (lockKey) {
      await releaseDispatchKernelLock(adminDb, { lockKey, lockOwner }).catch(() => null)
    }
  }
}
