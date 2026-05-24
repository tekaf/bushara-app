import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { ensureInviteOrderFoundation, isValidOrderCode } from '@/lib/orders/order-code'

type BackfillCounters = {
  invitationsTotal: number
  invitationsNormalized: number
  invitationsSkipped: number
  invitationsFailed: number
  guestsLinked: number
  invitationInternalUpdated: number
  sendJobsUpdated: number
  sendLogsUpdated: number
  errors: number
}

type ValidationCounters = {
  invitationsWithoutOrderCode: number
  guestsWithoutOrderCode: number
  sendJobsWithoutOrderCode: number
  sendLogsWithoutOrderCode: number
  duplicatedOrderCodes: Array<{ orderCode: string; inviteIds: string[] }>
  orphanedGuests: number
  orphanedSendJobs: number
  orphanedSendLogs: number
}

export type OrderFoundationBackfillReport = {
  tag: '[BACKFILL][ORDER_FOUNDATION]'
  startedAt: string
  finishedAt: string
  counters: BackfillCounters
  failedInviteIds: string[]
  validation: ValidationCounters
}

function emptyCounters(): BackfillCounters {
  return {
    invitationsTotal: 0,
    invitationsNormalized: 0,
    invitationsSkipped: 0,
    invitationsFailed: 0,
    guestsLinked: 0,
    invitationInternalUpdated: 0,
    sendJobsUpdated: 0,
    sendLogsUpdated: 0,
    errors: 0,
  }
}

type InviteValidationMap = Map<string, { orderCode: string }>

async function backfillInviteLinkedCollections(
  adminDb: Firestore,
  inviteId: string,
  orderCode: string
): Promise<Pick<BackfillCounters, 'sendJobsUpdated' | 'sendLogsUpdated' | 'invitationInternalUpdated'>> {
  let sendJobsUpdated = 0
  let sendLogsUpdated = 0
  let invitationInternalUpdated = 0

  const internalRef = adminDb.collection('invitation_internal').doc(inviteId)
  const internalSnap = await internalRef.get()
  const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
  if (!isValidOrderCode(String(internal?.orderCode || '').trim())) {
    await internalRef.set(
      {
        inviteId,
        orderCode,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    invitationInternalUpdated += 1
  }

  const jobsSnap = await adminDb.collection('send_jobs').where('inviteId', '==', inviteId).get()
  for (let i = 0; i < jobsSnap.docs.length; i += 450) {
    const batch = adminDb.batch()
    let writes = 0
    for (const doc of jobsSnap.docs.slice(i, i + 450)) {
      const row = doc.data() as any
      if (isValidOrderCode(String(row?.orderCode || '').trim())) continue
      batch.set(
        doc.ref,
        {
          orderCode,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      writes += 1
      sendJobsUpdated += 1
    }
    if (writes > 0) await batch.commit()
  }

  const logsSnap = await adminDb.collection('send_logs').where('inviteId', '==', inviteId).get()
  for (let i = 0; i < logsSnap.docs.length; i += 450) {
    const batch = adminDb.batch()
    let writes = 0
    for (const doc of logsSnap.docs.slice(i, i + 450)) {
      const row = doc.data() as any
      if (isValidOrderCode(String(row?.orderCode || '').trim())) continue
      batch.set(
        doc.ref,
        {
          orderCode,
        },
        { merge: true }
      )
      writes += 1
      sendLogsUpdated += 1
    }
    if (writes > 0) await batch.commit()
  }

  return { sendJobsUpdated, sendLogsUpdated, invitationInternalUpdated }
}

async function runValidation(adminDb: Firestore): Promise<ValidationCounters> {
  const invitesSnap = await adminDb.collection('invites').get()
  const inviteMap: InviteValidationMap = new Map()
  const duplicateMap = new Map<string, string[]>()
  let invitationsWithoutOrderCode = 0
  let guestsWithoutOrderCode = 0
  let orphanedGuests = 0

  for (const inviteDoc of invitesSnap.docs) {
    const invite = inviteDoc.data() as any
    const orderCode = String(invite?.orderCode || invite?.orderNumber || '').trim()
    if (!isValidOrderCode(orderCode)) {
      invitationsWithoutOrderCode += 1
      continue
    }
    inviteMap.set(inviteDoc.id, { orderCode })
    const list = duplicateMap.get(orderCode) || []
    list.push(inviteDoc.id)
    duplicateMap.set(orderCode, list)
  }

  for (const inviteDoc of invitesSnap.docs) {
    const inviteMeta = inviteMap.get(inviteDoc.id)
    if (!inviteMeta) continue
    const guestsSnap = await inviteDoc.ref.collection('guests').get()
    for (const guestDoc of guestsSnap.docs) {
      const guest = guestDoc.data() as any
      const guestOrderCode = String(guest?.orderCode || '').trim()
      if (!isValidOrderCode(guestOrderCode)) guestsWithoutOrderCode += 1
      if (isValidOrderCode(guestOrderCode) && guestOrderCode !== inviteMeta.orderCode) orphanedGuests += 1
    }
  }

  const sendJobsSnap = await adminDb.collection('send_jobs').get()
  let sendJobsWithoutOrderCode = 0
  let orphanedSendJobs = 0
  for (const doc of sendJobsSnap.docs) {
    const row = doc.data() as any
    const inviteId = String(row?.inviteId || '').trim()
    const orderCode = String(row?.orderCode || '').trim()
    if (!isValidOrderCode(orderCode)) sendJobsWithoutOrderCode += 1
    if (!inviteMap.has(inviteId)) orphanedSendJobs += 1
  }

  const sendLogsSnap = await adminDb.collection('send_logs').get()
  let sendLogsWithoutOrderCode = 0
  let orphanedSendLogs = 0
  for (const doc of sendLogsSnap.docs) {
    const row = doc.data() as any
    const inviteId = String(row?.inviteId || '').trim()
    const orderCode = String(row?.orderCode || '').trim()
    if (!isValidOrderCode(orderCode)) sendLogsWithoutOrderCode += 1
    if (!inviteMap.has(inviteId)) orphanedSendLogs += 1
  }

  const duplicatedOrderCodes = Array.from(duplicateMap.entries())
    .filter(([, inviteIds]) => inviteIds.length > 1)
    .map(([orderCode, inviteIds]) => ({ orderCode, inviteIds }))

  return {
    invitationsWithoutOrderCode,
    guestsWithoutOrderCode,
    sendJobsWithoutOrderCode,
    sendLogsWithoutOrderCode,
    duplicatedOrderCodes,
    orphanedGuests,
    orphanedSendJobs,
    orphanedSendLogs,
  }
}

export async function runHistoricalOrderFoundationBackfill(adminDb: Firestore): Promise<OrderFoundationBackfillReport> {
  const startedAt = new Date().toISOString()
  const counters = emptyCounters()
  const failedInviteIds: string[] = []
  console.info('[BACKFILL][ORDER_FOUNDATION] started', { startedAt })

  const invitesSnap = await adminDb.collection('invites').get()
  counters.invitationsTotal = invitesSnap.size

  for (const inviteDoc of invitesSnap.docs) {
    const inviteId = inviteDoc.id
    try {
      const invite = inviteDoc.data() as any
      const hadOrderCode = isValidOrderCode(String(invite?.orderCode || invite?.orderNumber || '').trim())
      const hadDispatchMode = Boolean(String(invite?.dispatchMode || '').trim())
      const hadDispatchStatus = Boolean(String(invite?.dispatchStatus || '').trim())

      const normalized = await ensureInviteOrderFoundation(adminDb, inviteId)
      counters.guestsLinked += normalized.guestsTagged

      const linked = await backfillInviteLinkedCollections(adminDb, inviteId, normalized.orderCode)
      counters.sendJobsUpdated += linked.sendJobsUpdated
      counters.sendLogsUpdated += linked.sendLogsUpdated
      counters.invitationInternalUpdated += linked.invitationInternalUpdated

      if (hadOrderCode && hadDispatchMode && hadDispatchStatus && normalized.guestsTagged === 0) {
        counters.invitationsSkipped += 1
      } else {
        counters.invitationsNormalized += 1
      }
    } catch (error) {
      counters.invitationsFailed += 1
      counters.errors += 1
      failedInviteIds.push(inviteId)
      console.error('[BACKFILL][ORDER_FOUNDATION] invite-failed', {
        inviteId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const validation = await runValidation(adminDb)
  const finishedAt = new Date().toISOString()
  const report: OrderFoundationBackfillReport = {
    tag: '[BACKFILL][ORDER_FOUNDATION]',
    startedAt,
    finishedAt,
    counters,
    failedInviteIds,
    validation,
  }
  console.info('[BACKFILL][ORDER_FOUNDATION] completed', report)
  return report
}
