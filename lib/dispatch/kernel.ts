import { FieldValue } from 'firebase-admin/firestore'
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'
import { acquireSendJobLock } from '@/lib/sending/processing-guard'
import {
  validateInvitationRelation,
  validateSendJobRelation,
  type OrphanDispatchStatus,
} from '@/lib/orders/orphan-protection'

export type DispatchKernelDecision =
  | 'valid'
  | 'orphan_blocked'
  | 'locked'
  | 'duplicate_attempt'
  | 'invalid_dispatch_state'
  | 'guest_relation_failed'
  | 'already_sent'
  | 'dispatch_disabled'
  | 'invite_not_ready'

type DispatchKernelSource =
  | 'send_now'
  | 'schedule_send'
  | 'retry_failed'
  | 'reschedule_send'
  | 'cancel_schedule'
  | 'dispatch_pick'
  | 'process_job'
  | 'manual_dispatch'
  | 'wave_processing'
  | string

type DispatchKernelInput = {
  adminDb: Firestore
  source: DispatchKernelSource
  inviteId?: string
  jobId?: string
  checkGuestRelations?: boolean
  blockOnFailure?: boolean
  acquireLock?: boolean
  lockOwner?: string
  lockTtlMs?: number
}

type DispatchKernelContext = {
  inviteRef?: DocumentReference
  invite?: any
  jobRef?: DocumentReference
  job?: any
}

export type DispatchKernelResult = {
  valid: boolean
  decision: DispatchKernelDecision
  reason: string
  source: DispatchKernelSource
  inviteId?: string
  orderCode?: string
  sendJobId?: string
  dispatchMode?: string
  affectedIds?: string[]
  lock?: {
    acquired: boolean
    key?: string
    owner?: string
    expiresAt?: string
  }
  context?: DispatchKernelContext
}

const ORPHAN_STATES = new Set<OrphanDispatchStatus>(['orphan_blocked', 'relation_invalid', 'orphan_detected'])
const API_EXECUTION_SOURCES = new Set<DispatchKernelSource>(['send_now', 'dispatch_pick', 'process_job'])
const START_SEND_SOURCES = new Set<DispatchKernelSource>(['send_now', 'dispatch_pick', 'process_job'])

function kernelLog(result: DispatchKernelResult) {
  const level = result.valid ? console.info : console.warn
  level('[DISPATCH_KERNEL]', {
    decision: result.decision,
    reason: result.reason,
    source: result.source,
    inviteId: result.inviteId || null,
    orderCode: result.orderCode || null,
    sendJobId: result.sendJobId || null,
    dispatchMode: result.dispatchMode || null,
    affectedIds: result.affectedIds || [],
    lock: result.lock || null,
  })
}

async function persistKernelEvent(adminDb: Firestore, result: DispatchKernelResult) {
  try {
    await adminDb.collection('dispatch_kernel_events').add({
      source: result.source,
      decision: result.decision,
      valid: result.valid,
      reason: result.reason,
      inviteId: result.inviteId || '',
      orderCode: result.orderCode || '',
      sendJobId: result.sendJobId || '',
      dispatchMode: result.dispatchMode || '',
      affectedIds: result.affectedIds || [],
      lock: result.lock || null,
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch (error) {
    console.warn('[DISPATCH_KERNEL] event-persist-failed', {
      source: result.source,
      decision: result.decision,
      inviteId: result.inviteId || null,
      sendJobId: result.sendJobId || null,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

function blocked(
  input: DispatchKernelInput,
  data: Omit<DispatchKernelResult, 'valid' | 'source'>
): DispatchKernelResult {
  const result: DispatchKernelResult = { valid: false, source: input.source, ...data }
  kernelLog(result)
  void persistKernelEvent(input.adminDb, result)
  return result
}

function allowed(input: DispatchKernelInput, data: Omit<DispatchKernelResult, 'valid' | 'source' | 'decision'>) {
  const result: DispatchKernelResult = {
    valid: true,
    source: input.source,
    decision: 'valid',
    ...data,
  }
  kernelLog(result)
  void persistKernelEvent(input.adminDb, result)
  return result
}

async function acquireDispatchKernelLock(
  adminDb: Firestore,
  key: string,
  owner: string,
  lockTtlMs: number
): Promise<{ acquired: boolean; reason?: string; expiresAt?: string }> {
  const now = Date.now()
  const expiresAt = new Date(now + Math.max(5_000, lockTtlMs))
  const lockRef = adminDb.collection('dispatch_kernel_locks').doc(key)
  return adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(lockRef)
    if (snap.exists) {
      const row = snap.data() as any
      const lockOwner = String(row?.owner || '')
      const untilMs = Number(row?.expiresAt?.toMillis?.() || 0)
      const active = untilMs > now
      if (active && lockOwner !== owner) {
        return { acquired: false, reason: 'already_locked' }
      }
    }
    tx.set(
      lockRef,
      {
        owner,
        key,
        source: key.split(':')[0],
        acquiredAt: FieldValue.serverTimestamp(),
        expiresAt,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    return { acquired: true, expiresAt: expiresAt.toISOString() }
  })
}

function buildInviteDispatchLockKey(inviteId: string) {
  return `invite:${inviteId}:dispatch`
}

type ReleaseDispatchKernelLockInput = {
  inviteId?: string
  lockKey?: string
  lockOwner: string
}

type RenewDispatchKernelLockInput = {
  inviteId?: string
  lockKey?: string
  lockOwner: string
  lockTtlMs?: number
}

export async function releaseDispatchKernelLock(adminDb: Firestore, input: ReleaseDispatchKernelLockInput) {
  const key = String(input.lockKey || '').trim() || buildInviteDispatchLockKey(String(input.inviteId || '').trim())
  if (!key || !String(input.lockOwner || '').trim()) return { released: false, reason: 'invalid_input' as const }
  const ref = adminDb.collection('dispatch_kernel_locks').doc(key)
  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { released: false, reason: 'lock_not_found' as const }
    const row = snap.data() as any
    if (String(row?.owner || '') !== String(input.lockOwner || '').trim()) {
      return { released: false, reason: 'not_lock_owner' as const }
    }
    tx.set(
      ref,
      {
        owner: FieldValue.delete(),
        expiresAt: FieldValue.delete(),
        releasedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    return { released: true as const }
  })
  try {
    await adminDb.collection('dispatch_kernel_events').add({
      source: 'lock_release',
      decision: result.released ? 'valid' : 'locked',
      valid: result.released === true,
      reason: result.released ? 'Dispatch kernel lock released' : `Dispatch kernel lock release failed (${result.reason})`,
      inviteId: String(input.inviteId || ''),
      sendJobId: '',
      orderCode: '',
      dispatchMode: '',
      affectedIds: [key],
      lock: { key, owner: input.lockOwner, released: result.released, reason: result.reason || '' },
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch {
    // Never fail release lifecycle because of event persistence.
  }
  return result
}

export async function renewDispatchKernelLock(adminDb: Firestore, input: RenewDispatchKernelLockInput) {
  const key = String(input.lockKey || '').trim() || buildInviteDispatchLockKey(String(input.inviteId || '').trim())
  const owner = String(input.lockOwner || '').trim()
  const ttl = Math.max(5_000, Number(input.lockTtlMs || 60_000))
  if (!key || !owner) return { renewed: false, reason: 'invalid_input' as const }
  const ref = adminDb.collection('dispatch_kernel_locks').doc(key)
  const expiresAt = new Date(Date.now() + ttl)
  const result = await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) return { renewed: false, reason: 'lock_not_found' as const }
    const row = snap.data() as any
    if (String(row?.owner || '') !== owner) return { renewed: false, reason: 'not_lock_owner' as const }
    tx.set(
      ref,
      {
        expiresAt,
        renewedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
    return { renewed: true as const, expiresAt: expiresAt.toISOString() }
  })
  try {
    await adminDb.collection('dispatch_kernel_events').add({
      source: 'lock_renew',
      decision: result.renewed ? 'valid' : 'locked',
      valid: result.renewed === true,
      reason: result.renewed ? 'Dispatch kernel lock renewed' : `Dispatch kernel lock renew failed (${result.reason})`,
      inviteId: String(input.inviteId || ''),
      sendJobId: '',
      orderCode: '',
      dispatchMode: '',
      affectedIds: [key],
      lock: { key, owner, renewed: result.renewed, reason: result.reason || '', expiresAt: result.expiresAt || '' },
      createdAt: FieldValue.serverTimestamp(),
    })
  } catch {
    // Never fail renew lifecycle because of event persistence.
  }
  return result
}

function shouldValidateAsInvite(input: DispatchKernelInput) {
  return Boolean(input.inviteId) && !input.jobId
}

export async function runDispatchProtection(input: DispatchKernelInput): Promise<DispatchKernelResult> {
  const adminDb = input.adminDb
  const blockOnFailure = input.blockOnFailure !== false
  const checkGuestRelations = input.checkGuestRelations === true

  let inviteId = String(input.inviteId || '').trim()
  let sendJobId = String(input.jobId || '').trim()
  let orderCode = ''
  let inviteRef: DocumentReference | undefined
  let invite: any
  let jobRef: DocumentReference | undefined
  let job: any

  if (sendJobId) {
    const jobValidation = await validateSendJobRelation(adminDb, sendJobId, {
      operation: `dispatch_kernel:${input.source}`,
      blockOnFailure,
      checkGuestRelations,
    })
    if (!jobValidation.ok) {
      const decision =
        jobValidation.code === 'guest_relation_invalid'
          ? 'guest_relation_failed'
          : jobValidation.code === 'dispatch_orphan_state' || jobValidation.code.includes('invite')
            ? 'orphan_blocked'
            : 'invalid_dispatch_state'
      return blocked(input, {
        decision,
        reason: jobValidation.reason,
        inviteId: jobValidation.inviteId,
        sendJobId,
        orderCode: jobValidation.orderCode,
      })
    }
    inviteId = jobValidation.inviteId
    orderCode = jobValidation.orderCode
    inviteRef = jobValidation.inviteRef
    invite = jobValidation.invite
    jobRef = jobValidation.jobRef
    job = jobValidation.job
  } else if (shouldValidateAsInvite(input)) {
    const inviteValidation = await validateInvitationRelation(adminDb, inviteId, {
      operation: `dispatch_kernel:${input.source}`,
      blockOnFailure,
      checkGuestRelations,
    })
    if (!inviteValidation.ok) {
      const decision =
        inviteValidation.code === 'guest_relation_invalid'
          ? 'guest_relation_failed'
          : inviteValidation.code === 'dispatch_orphan_state' || inviteValidation.code === 'invitation_missing'
            ? 'orphan_blocked'
            : 'invalid_dispatch_state'
      return blocked(input, {
        decision,
        reason: inviteValidation.reason,
        inviteId,
        orderCode: inviteValidation.orderCode,
        affectedIds: inviteValidation.invalidGuestIds,
      })
    }
    orderCode = inviteValidation.orderCode
    inviteRef = inviteValidation.inviteRef
    invite = inviteValidation.invite
  }

  const dispatchMode = String(invite?.dispatchMode || 'manual').trim().toLowerCase()
  const dispatchStatus = String(invite?.dispatchStatus || 'pending').trim().toLowerCase()
  const invitePaid = String(invite?.paymentStatus || invite?.status || '') === 'paid'
  const dispatchEnabled = invite?.dispatchEnabled !== false

  if (!dispatchEnabled) {
    return blocked(input, {
      decision: 'dispatch_disabled',
      reason: 'Dispatch is disabled for invitation',
      inviteId,
      orderCode,
      sendJobId,
      dispatchMode,
      context: { inviteRef, invite, jobRef, job },
    })
  }

  if (
    !invitePaid &&
    ['send_now', 'schedule_send', 'retry_failed', 'reschedule_send', 'dispatch_pick', 'process_job'].includes(input.source)
  ) {
    return blocked(input, {
      decision: 'invite_not_ready',
      reason: 'Invitation is not paid/ready for dispatch',
      inviteId,
      orderCode,
      sendJobId,
      dispatchMode,
      context: { inviteRef, invite, jobRef, job },
    })
  }

  if (ORPHAN_STATES.has(dispatchStatus as OrphanDispatchStatus)) {
    return blocked(input, {
      decision: 'orphan_blocked',
      reason: `Dispatch status is blocked (${dispatchStatus})`,
      inviteId,
      orderCode,
      sendJobId,
      dispatchMode,
      context: { inviteRef, invite, jobRef, job },
    })
  }

  if (START_SEND_SOURCES.has(input.source) && dispatchStatus === 'completed') {
    return blocked(input, {
      decision: 'already_sent',
      reason: 'Dispatch already completed for this invitation',
      inviteId,
      orderCode,
      sendJobId,
      dispatchMode,
      context: { inviteRef, invite, jobRef, job },
    })
  }

  if (API_EXECUTION_SOURCES.has(input.source) && dispatchMode === 'manual') {
    return blocked(input, {
      decision: 'invalid_dispatch_state',
      reason: 'API dispatch is blocked while invitation is in manual mode',
      inviteId,
      orderCode,
      sendJobId,
      dispatchMode,
      context: { inviteRef, invite, jobRef, job },
    })
  }

  if (input.source === 'manual_dispatch' && dispatchMode === 'api') {
    return blocked(input, {
      decision: 'invalid_dispatch_state',
      reason: 'Manual dispatch is blocked while invitation is in api mode',
      inviteId,
      orderCode,
      sendJobId,
      dispatchMode,
      context: { inviteRef, invite, jobRef, job },
    })
  }

  // Duplicate foundation for invite-level starts.
  if (!sendJobId && inviteId && ['send_now', 'schedule_send', 'retry_failed'].includes(input.source)) {
    const activeJobsSnap = await adminDb
      .collection('send_jobs')
      .where('inviteId', '==', inviteId)
      .where('status', 'in', ['scheduled', 'dispatching', 'processing'])
      .limit(1)
      .get()
      .catch(() => null)
    if (activeJobsSnap && !activeJobsSnap.empty) {
      const first = activeJobsSnap.docs[0]
      return blocked(input, {
        decision: 'duplicate_attempt',
        reason: 'Active dispatch job already exists',
        inviteId,
        orderCode,
        sendJobId: first.id,
        dispatchMode,
        affectedIds: [first.id],
        context: { inviteRef, invite },
      })
    }
  }

  // Lock foundation for job processing and invite-level dispatch entrypoints.
  if (input.acquireLock) {
    const owner = String(input.lockOwner || `${input.source}-${Date.now()}`).trim()
    const ttl = Math.max(5_000, Number(input.lockTtlMs || 60_000))
    if (sendJobId) {
      const jobLock = await acquireSendJobLock(adminDb, {
        jobId: sendJobId,
        lockOwner: owner,
        lockTtlMs: ttl,
      })
      if (!jobLock.acquired) {
        return blocked(input, {
          decision: 'locked',
          reason: `Send job lock not acquired (${jobLock.reason || 'unknown'})`,
          inviteId,
          orderCode,
          sendJobId,
          dispatchMode,
          lock: { acquired: false, owner },
          context: { inviteRef, invite, jobRef, job },
        })
      }
      return allowed(input, {
        reason: 'Dispatch protection checks passed',
        inviteId,
        orderCode,
        sendJobId,
        dispatchMode,
        lock: {
          acquired: true,
          owner,
          expiresAt: jobLock.lockExpiresAt?.toISOString(),
        },
        context: { inviteRef, invite, jobRef, job },
      })
    }

    if (inviteId) {
      const key = buildInviteDispatchLockKey(inviteId)
      const inviteLock = await acquireDispatchKernelLock(adminDb, key, owner, ttl)
      if (!inviteLock.acquired) {
        return blocked(input, {
          decision: 'locked',
          reason: `Invite dispatch lock not acquired (${inviteLock.reason || 'unknown'})`,
          inviteId,
          orderCode,
          dispatchMode,
          lock: { acquired: false, owner },
          context: { inviteRef, invite },
        })
      }
      return allowed(input, {
        reason: 'Dispatch protection checks passed',
        inviteId,
        orderCode,
        dispatchMode,
        lock: {
          acquired: true,
          key,
          owner,
          expiresAt: inviteLock.expiresAt,
        },
        context: { inviteRef, invite },
      })
    }
  }

  return allowed(input, {
    reason: 'Dispatch protection checks passed',
    inviteId,
    orderCode,
    sendJobId,
    dispatchMode,
    context: { inviteRef, invite, jobRef, job },
  })
}
