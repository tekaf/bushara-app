import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore, Transaction } from 'firebase-admin/firestore'

export type DispatchMode = 'api' | 'manual'
export type DispatchStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'sending'
  | 'completed'
  | 'failed'
  | 'orphan_blocked'
  | 'relation_invalid'
  | 'orphan_detected'

type EnsureInviteOrderFoundationResult = {
  orderCode: string
  dispatchMode: DispatchMode
  dispatchStatus: DispatchStatus
  guestsTagged: number
}

const ORDER_COUNTER_COLLECTION = 'system_counters'
const ORDER_COUNTER_DOC_ID = 'order_code'
const ORDER_CODE_REGEX = /^BSH-\d{4}-\d{6}$/

function normalizeDispatchMode(value: unknown): DispatchMode {
  return String(value || '').trim().toLowerCase() === 'api' ? 'api' : 'manual'
}

function normalizeDispatchStatus(value: unknown): DispatchStatus {
  const current = String(value || '').trim().toLowerCase()
  if (current === 'preparing') return 'preparing'
  if (current === 'ready') return 'ready'
  if (current === 'sending') return 'sending'
  if (current === 'completed') return 'completed'
  if (current === 'failed') return 'failed'
  if (current === 'orphan_blocked') return 'orphan_blocked'
  if (current === 'relation_invalid') return 'relation_invalid'
  if (current === 'orphan_detected') return 'orphan_detected'
  return 'pending'
}

function formatOrderCode(year: number, sequence: number): string {
  return `BSH-${year}-${String(sequence).padStart(6, '0')}`
}

export function isValidOrderCode(value: unknown): value is string {
  return ORDER_CODE_REGEX.test(String(value || '').trim())
}

async function allocateOrderCodeInTransaction(tx: Transaction, adminDb: Firestore, now: Date): Promise<string> {
  const year = now.getFullYear()
  const counterRef = adminDb.collection(ORDER_COUNTER_COLLECTION).doc(ORDER_COUNTER_DOC_ID)
  const counterSnap = await tx.get(counterRef)
  const counter = counterSnap.exists ? (counterSnap.data() as any) : {}
  const storedYear = Number(counter?.year || 0)
  const storedLast = Number(counter?.lastSequence || 0)

  const nextSequence = storedYear === year ? storedLast + 1 : 1
  tx.set(
    counterRef,
    {
      year,
      lastSequence: nextSequence,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: counterSnap.exists ? counter?.createdAt || FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
  return formatOrderCode(year, nextSequence)
}

export async function generateOrderCode(adminDb: Firestore): Promise<string> {
  const now = new Date()
  return adminDb.runTransaction((tx) => allocateOrderCodeInTransaction(tx, adminDb, now))
}

export async function ensureInviteOrderFoundation(
  adminDb: Firestore,
  inviteId: string
): Promise<EnsureInviteOrderFoundationResult> {
  const inviteRef = adminDb.collection('invites').doc(inviteId)

  const foundation = await adminDb.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef)
    if (!inviteSnap.exists) throw new Error('Invite not found')

    const invite = inviteSnap.data() as any
    const paymentRef = adminDb.collection('payments').doc(inviteId)
    const paymentSnap = await tx.get(paymentRef)
    const payment = paymentSnap.exists ? (paymentSnap.data() as any) : {}
    const internalRef = adminDb.collection('invitation_internal').doc(inviteId)
    const internalSnap = await tx.get(internalRef)
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}

    const inviteOrderCode = String(invite?.orderCode || '').trim()
    const inviteOrderNumber = String(invite?.orderNumber || '').trim()
    const currentValidOrderCode = isValidOrderCode(inviteOrderCode)
      ? inviteOrderCode
      : isValidOrderCode(inviteOrderNumber)
        ? inviteOrderNumber
        : ''
    const orderCode = currentValidOrderCode || (await allocateOrderCodeInTransaction(tx, adminDb, new Date()))
    const dispatchMode = normalizeDispatchMode(invite?.dispatchMode)
    const dispatchStatus = normalizeDispatchStatus(invite?.dispatchStatus)
    const ownerId = String(invite?.ownerId || '').trim()
    const needsInviteOrderCode = !isValidOrderCode(inviteOrderCode)
    const needsInviteOrderNumber = String(invite?.orderNumber || '').trim() !== orderCode
    const needsDispatchMode = String(invite?.dispatchMode || '').trim().toLowerCase() !== dispatchMode
    const hasDispatchStatus = Boolean(String(invite?.dispatchStatus || '').trim())
    const needsDispatchStatus = !hasDispatchStatus

    if (needsInviteOrderCode || needsInviteOrderNumber || needsDispatchMode || needsDispatchStatus) {
      tx.set(
        inviteRef,
        {
          ...(needsInviteOrderCode ? { orderCode } : {}),
          ...(needsInviteOrderNumber ? { orderNumber: orderCode } : {}),
          ...(needsDispatchMode ? { dispatchMode } : {}),
          ...(needsDispatchStatus ? { dispatchStatus } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }

    const paymentOrderCode = String(payment?.orderCode || '').trim()
    if (!isValidOrderCode(paymentOrderCode)) {
      tx.set(
        paymentRef,
        {
          inviteId,
          ownerId: payment?.ownerId || ownerId,
          orderCode,
          status: String(payment?.status || invite?.paymentStatus || invite?.status || 'pending'),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }

    const internalOrderCode = String(internal?.orderCode || '').trim()
    if (!isValidOrderCode(internalOrderCode)) {
      tx.set(
        internalRef,
        {
          inviteId,
          orderCode,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }

    return { orderCode, dispatchMode, dispatchStatus }
  })

  const guestsSnap = await inviteRef.collection('guests').get()
  const guestDocs = guestsSnap.docs
  let guestsTagged = 0

  for (let i = 0; i < guestDocs.length; i += 450) {
    const batch = adminDb.batch()
    const chunk = guestDocs.slice(i, i + 450)
    let chunkWrites = 0
    for (const guestDoc of chunk) {
      const guest = guestDoc.data() as any
      const nextOrderCode = String(guest?.orderCode || '').trim()
      const nextSendStatus = String(guest?.sendStatus || '').trim() || 'pending'
      const needsOrderCode = !isValidOrderCode(nextOrderCode)
      const needsSendStatus = !String(guest?.sendStatus || '').trim()
      if (!needsOrderCode && !needsSendStatus) continue
      guestsTagged += 1
      chunkWrites += 1
      batch.set(
        guestDoc.ref,
        {
          orderCode: foundation.orderCode,
          sendStatus: nextSendStatus,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }
    if (chunkWrites > 0) {
      await batch.commit()
    }
  }

  const [jobsSnap, logsSnap] = await Promise.all([
    adminDb.collection('send_jobs').where('inviteId', '==', inviteId).limit(500).get(),
    adminDb.collection('send_logs').where('inviteId', '==', inviteId).limit(1000).get(),
  ])
  const brokenJobCount = jobsSnap.docs.filter((doc) => {
    const row = doc.data() as any
    const jobOrderCode = String(row?.orderCode || '').trim()
    return !isValidOrderCode(jobOrderCode) || jobOrderCode !== foundation.orderCode
  }).length
  const brokenLogCount = logsSnap.docs.filter((doc) => {
    const row = doc.data() as any
    const logOrderCode = String(row?.orderCode || '').trim()
    return !isValidOrderCode(logOrderCode) || logOrderCode !== foundation.orderCode
  }).length
  if (brokenJobCount > 0 || brokenLogCount > 0) {
    console.warn('[ORPHAN_PROTECTION] ensure-invite-detected-broken-relations', {
      inviteId,
      orderCode: foundation.orderCode,
      brokenJobCount,
      brokenLogCount,
    })
  }

  return { ...foundation, guestsTagged }
}
