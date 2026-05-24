import { FieldValue } from 'firebase-admin/firestore'

type BaseMutationParams = {
  adminDb: FirebaseFirestore.Firestore
  inviteId: string
  guestId: string
  actorId: string
  orderCode: string
  logTag: '[RISK_CASE_UI]' | '[RISK_CASE_ACCESS]'
  logContext?: Record<string, unknown>
}

export type MarkSentMutationResult =
  | {
      type: 'success'
      oldStatus: string
      newStatus: 'manually_sent'
      already_marked_sent: false
      manualSendCount: number
    }
  | {
      type: 'noop_already_sent'
      oldStatus: 'manually_sent'
      newStatus: 'manually_sent'
      already_marked_sent: true
      manualSendCount: number
    }
  | {
      type: 'invalid_status'
      oldStatus: string
      manualSendCount: number
    }

export type MarkRetryMutationResult =
  | {
      type: 'success'
      oldStatus: string
      newStatus: 'manual_retry_needed'
      manualSendCount: number
    }
  | {
      type: 'invalid_status'
      oldStatus: string
      manualSendCount: number
    }

const BLOCKED = new Set([
  'blocked_invalid_phone',
  'blocked_duplicate',
  'blocked_missing_rsvp_token',
  'blocked_missing_message_context',
  'blocked_orphan',
])

export async function applyRiskCaseMarkSentMutation(params: BaseMutationParams): Promise<MarkSentMutationResult> {
  const { adminDb, inviteId, guestId, actorId, orderCode, logTag, logContext = {} } = params
  const entryRef = adminDb.collection('risk_case_dispatches').doc(inviteId).collection('entries').doc(guestId)
  const entrySnap = await entryRef.get()
  if (!entrySnap.exists) throw new Error('Entry not found')
  const entry = entrySnap.data() as any
  const oldStatus = String(entry?.sendStatus || '')
  const currentManualSendCount = Number(entry?.manualSendCount || 0)

  if (BLOCKED.has(oldStatus)) {
    console.info(logTag, {
      orderCode,
      inviteId,
      guestId,
      action: 'mark_sent_blocked_invalid_status',
      actorId,
      adminId: actorId,
      oldStatus,
      newStatus: oldStatus,
      manualSendCount: currentManualSendCount,
      ...logContext,
    })
    return { type: 'invalid_status', oldStatus, manualSendCount: currentManualSendCount }
  }

  if (oldStatus === 'manually_sent') {
    console.info(logTag, {
      orderCode,
      inviteId,
      guestId,
      action: 'mark_sent_noop_already_sent',
      actorId,
      adminId: actorId,
      oldStatus,
      newStatus: 'manually_sent',
      manualSendCount: currentManualSendCount,
      ...logContext,
    })
    return {
      type: 'noop_already_sent',
      oldStatus: 'manually_sent',
      newStatus: 'manually_sent',
      already_marked_sent: true,
      manualSendCount: currentManualSendCount,
    }
  }

  const allowed = new Set(['ready_manual', 'manual_opened', 'manual_retry_needed'])
  if (!allowed.has(oldStatus)) {
    console.info(logTag, {
      orderCode,
      inviteId,
      guestId,
      action: 'mark_sent_blocked_invalid_status',
      actorId,
      adminId: actorId,
      oldStatus,
      newStatus: oldStatus,
      manualSendCount: currentManualSendCount,
      ...logContext,
    })
    return { type: 'invalid_status', oldStatus, manualSendCount: currentManualSendCount }
  }

  const nextManualSendCount = currentManualSendCount + 1
  const updatePayload: Record<string, any> = {
    sendStatus: 'manually_sent',
    manualSendCount: nextManualSendCount,
    lastAttemptAt: FieldValue.serverTimestamp(),
    sentByAdmin: actorId,
    sentAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastManualOpenAt: entry?.lastManualOpenAt ?? null,
  }
  if (!entry?.firstSentAt) updatePayload.firstSentAt = FieldValue.serverTimestamp()

  await entryRef.set(updatePayload, { merge: true })

  console.info(logTag, {
    orderCode,
    inviteId,
    guestId,
    action: 'mark_sent_success',
    actorId,
    adminId: actorId,
    oldStatus,
    newStatus: 'manually_sent',
    manualSendCount: nextManualSendCount,
    ...logContext,
  })

  return {
    type: 'success',
    oldStatus,
    newStatus: 'manually_sent',
    already_marked_sent: false,
    manualSendCount: nextManualSendCount,
  }
}

export async function applyRiskCaseMarkRetryMutation(params: BaseMutationParams): Promise<MarkRetryMutationResult> {
  const { adminDb, inviteId, guestId, actorId, orderCode, logTag, logContext = {} } = params
  const entryRef = adminDb.collection('risk_case_dispatches').doc(inviteId).collection('entries').doc(guestId)
  const entrySnap = await entryRef.get()
  if (!entrySnap.exists) throw new Error('Entry not found')
  const entry = entrySnap.data() as any
  const oldStatus = String(entry?.sendStatus || '')
  const currentManualSendCount = Number(entry?.manualSendCount || 0)
  if (BLOCKED.has(oldStatus)) {
    console.info(logTag, {
      orderCode,
      inviteId,
      guestId,
      action: 'mark_retry_blocked_invalid_status',
      actorId,
      adminId: actorId,
      oldStatus,
      newStatus: oldStatus,
      manualSendCount: currentManualSendCount,
      ...logContext,
    })
    return { type: 'invalid_status', oldStatus, manualSendCount: currentManualSendCount }
  }

  await entryRef.set(
    {
      sendStatus: 'manual_retry_needed',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  console.info(logTag, {
    orderCode,
    inviteId,
    guestId,
    action: 'mark_retry_success',
    actorId,
    adminId: actorId,
    oldStatus,
    newStatus: 'manual_retry_needed',
    manualSendCount: currentManualSendCount,
    ...logContext,
  })

  return {
    type: 'success',
    oldStatus,
    newStatus: 'manual_retry_needed',
    manualSendCount: currentManualSendCount,
  }
}
