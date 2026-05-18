import { FieldValue } from 'firebase-admin/firestore'
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'
import { ensureInviteOrderFoundation, isValidOrderCode } from '@/lib/orders/order-code'

export type OrphanDispatchStatus = 'orphan_blocked' | 'relation_invalid' | 'orphan_detected'
export type OrphanGuestSendStatus = 'blocked_orphan' | 'relation_failed'

type ValidationOptions = {
  operation: string
  blockOnFailure?: boolean
  checkGuestRelations?: boolean
}

type ValidationFailureCode =
  | 'invitation_missing'
  | 'order_code_invalid'
  | 'dispatch_orphan_state'
  | 'guest_relation_invalid'
  | 'send_job_missing'
  | 'send_job_invite_missing'
  | 'send_job_order_mismatch'
  | 'guest_missing'
  | 'guest_order_mismatch'

type InvitationValidationResult =
  | {
      ok: true
      inviteId: string
      inviteRef: DocumentReference
      invite: any
      orderCode: string
    }
  | {
      ok: false
      code: ValidationFailureCode
      inviteId: string
      reason: string
      inviteRef?: DocumentReference
      invite?: any
      orderCode?: string
      invalidGuestIds?: string[]
    }

type SendJobValidationResult =
  | {
      ok: true
      jobId: string
      jobRef: DocumentReference
      job: any
      inviteId: string
      inviteRef: DocumentReference
      invite: any
      orderCode: string
    }
  | {
      ok: false
      code: ValidationFailureCode
      jobId: string
      reason: string
      inviteId?: string
      orderCode?: string
    }

const ORPHAN_DISPATCH_STATUSES = new Set<string>(['orphan_blocked', 'relation_invalid', 'orphan_detected'])

function orphanLog(event: string, payload: Record<string, unknown>) {
  console.warn(`[ORPHAN_PROTECTION] ${event}`, payload)
}

async function markInviteDispatchStatus(
  adminDb: Firestore,
  inviteRef: DocumentReference,
  status: OrphanDispatchStatus,
  reason: string
) {
  await inviteRef.set(
    {
      dispatchStatus: status,
      orphanProtection: {
        reason,
        detectedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
  await adminDb.collection('orphan_protection_events').add({
    scope: 'invitation',
    inviteId: inviteRef.id,
    status,
    reason,
    createdAt: FieldValue.serverTimestamp(),
  })
}

async function markGuestsRelationFailed(
  inviteRef: DocumentReference,
  guestIds: string[],
  status: OrphanGuestSendStatus
) {
  for (let i = 0; i < guestIds.length; i += 450) {
    const batch = inviteRef.firestore.batch()
    for (const guestId of guestIds.slice(i, i + 450)) {
      batch.set(
        inviteRef.collection('guests').doc(guestId),
        {
          sendStatus: status,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }
    await batch.commit()
  }
}

async function markSendJobOrphanBlocked(
  adminDb: Firestore,
  jobRef: DocumentReference,
  input: {
    reason: string
    inviteId?: string
    orderCode?: string
    status?: OrphanDispatchStatus
  }
) {
  const blockedStatus = input.status || 'orphan_blocked'
  await jobRef.set(
    {
      status: 'orphan_blocked',
      orphanProtection: {
        reason: input.reason,
        detectedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
      ...(input.orderCode ? { orderCode: input.orderCode } : {}),
    },
    { merge: true }
  )
  if (input.inviteId) {
    await adminDb.collection('invites').doc(input.inviteId).set(
      {
        dispatchStatus: blockedStatus,
        orphanProtection: {
          reason: input.reason,
          detectedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  }
  await adminDb.collection('orphan_protection_events').add({
    scope: 'send_job',
    sendJobId: jobRef.id,
    inviteId: input.inviteId || '',
    orderCode: input.orderCode || '',
    status: 'orphan_blocked',
    reason: input.reason,
    createdAt: FieldValue.serverTimestamp(),
  })
}

export async function validateInvitationRelation(
  adminDb: Firestore,
  inviteId: string,
  options: ValidationOptions
): Promise<InvitationValidationResult> {
  const inviteRef = adminDb.collection('invites').doc(inviteId)
  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) {
    orphanLog('invitation_missing', { inviteId, operation: options.operation })
    return { ok: false, code: 'invitation_missing', inviteId, reason: 'Invitation not found' }
  }

  await ensureInviteOrderFoundation(adminDb, inviteId)
  const normalizedInviteSnap = await inviteRef.get()
  const invite = normalizedInviteSnap.data() as any
  const orderCode = String(invite?.orderCode || invite?.orderNumber || '').trim()

  if (!isValidOrderCode(orderCode)) {
    const reason = 'Invitation orderCode is invalid after foundation ensure'
    orphanLog('order_code_invalid', { inviteId, operation: options.operation, orderCode })
    if (options.blockOnFailure) {
      await markInviteDispatchStatus(adminDb, inviteRef, 'relation_invalid', reason)
    }
    return { ok: false, code: 'order_code_invalid', inviteId, reason, inviteRef, invite }
  }

  const dispatchStatus = String(invite?.dispatchStatus || '').trim().toLowerCase()
  if (ORPHAN_DISPATCH_STATUSES.has(dispatchStatus)) {
    const reason = `Invitation is in orphan dispatch status (${dispatchStatus})`
    orphanLog('dispatch_orphan_state', { inviteId, operation: options.operation, dispatchStatus, orderCode })
    return {
      ok: false,
      code: 'dispatch_orphan_state',
      inviteId,
      reason,
      inviteRef,
      invite,
      orderCode,
    }
  }

  if (options.checkGuestRelations) {
    const guestsSnap = await inviteRef.collection('guests').get()
    const invalidGuestIds = guestsSnap.docs
      .filter((doc) => {
        const guest = doc.data() as any
        const guestOrderCode = String(guest?.orderCode || '').trim()
        return !isValidOrderCode(guestOrderCode) || guestOrderCode !== orderCode
      })
      .map((doc) => doc.id)

    if (invalidGuestIds.length > 0) {
      const reason = `Detected ${invalidGuestIds.length} guests with broken relation to invitation orderCode`
      orphanLog('guest_relation_invalid', {
        inviteId,
        orderCode,
        operation: options.operation,
        invalidGuestsCount: invalidGuestIds.length,
      })
      if (options.blockOnFailure) {
        await markInviteDispatchStatus(adminDb, inviteRef, 'relation_invalid', reason)
        await markGuestsRelationFailed(inviteRef, invalidGuestIds, 'relation_failed')
      }
      return {
        ok: false,
        code: 'guest_relation_invalid',
        inviteId,
        reason,
        inviteRef,
        invite,
        orderCode,
        invalidGuestIds,
      }
    }
  }

  return { ok: true, inviteId, inviteRef, invite, orderCode }
}

export async function validateSendJobRelation(
  adminDb: Firestore,
  jobId: string,
  options: ValidationOptions
): Promise<SendJobValidationResult> {
  const jobRef = adminDb.collection('send_jobs').doc(jobId)
  const jobSnap = await jobRef.get()
  if (!jobSnap.exists) {
    orphanLog('send_job_missing', { sendJobId: jobId, operation: options.operation })
    return { ok: false, code: 'send_job_missing', jobId, reason: 'Send job not found' }
  }
  const job = jobSnap.data() as any
  const inviteId = String(job?.inviteId || '').trim()
  if (!inviteId) {
    const reason = 'Send job has no inviteId relation'
    orphanLog('send_job_invite_missing', { sendJobId: jobId, operation: options.operation })
    if (options.blockOnFailure) {
      await markSendJobOrphanBlocked(adminDb, jobRef, { reason, status: 'relation_invalid' })
    }
    return { ok: false, code: 'send_job_invite_missing', jobId, reason }
  }

  const inviteValidation = await validateInvitationRelation(adminDb, inviteId, {
    operation: `${options.operation}:send_job`,
    blockOnFailure: options.blockOnFailure,
    checkGuestRelations: options.checkGuestRelations,
  })
  if (!inviteValidation.ok) {
    if (options.blockOnFailure) {
      await markSendJobOrphanBlocked(adminDb, jobRef, {
        inviteId,
        orderCode: inviteValidation.orderCode,
        reason: inviteValidation.reason,
      })
    }
    return {
      ok: false,
      code: inviteValidation.code,
      jobId,
      inviteId,
      orderCode: inviteValidation.orderCode,
      reason: inviteValidation.reason,
    }
  }

  const jobOrderCode = String(job?.orderCode || '').trim()
  if (!isValidOrderCode(jobOrderCode) || jobOrderCode !== inviteValidation.orderCode) {
    const reason = 'Send job orderCode does not match invitation orderCode'
    orphanLog('send_job_order_mismatch', {
      sendJobId: jobId,
      inviteId,
      operation: options.operation,
      jobOrderCode,
      inviteOrderCode: inviteValidation.orderCode,
    })
    if (options.blockOnFailure) {
      await markSendJobOrphanBlocked(adminDb, jobRef, {
        inviteId,
        orderCode: inviteValidation.orderCode,
        reason,
        status: 'relation_invalid',
      })
    }
    return {
      ok: false,
      code: 'send_job_order_mismatch',
      jobId,
      inviteId,
      orderCode: inviteValidation.orderCode,
      reason,
    }
  }

  return {
    ok: true,
    jobId,
    jobRef,
    job,
    inviteId,
    inviteRef: inviteValidation.inviteRef,
    invite: inviteValidation.invite,
    orderCode: inviteValidation.orderCode,
  }
}

export async function validateGuestRelation(
  adminDb: Firestore,
  inviteId: string,
  guestId: string,
  options: ValidationOptions
) {
  const inviteValidation = await validateInvitationRelation(adminDb, inviteId, {
    operation: `${options.operation}:guest`,
    blockOnFailure: options.blockOnFailure,
    checkGuestRelations: false,
  })
  if (!inviteValidation.ok) {
    return {
      ok: false as const,
      code: inviteValidation.code,
      reason: inviteValidation.reason,
      inviteId,
      guestId,
      orderCode: inviteValidation.orderCode,
    }
  }

  const guestRef = inviteValidation.inviteRef.collection('guests').doc(guestId)
  const guestSnap = await guestRef.get()
  if (!guestSnap.exists) {
    orphanLog('guest_missing', { inviteId, guestId, operation: options.operation })
    return { ok: false as const, code: 'guest_missing' as const, reason: 'Guest not found', inviteId, guestId }
  }
  const guest = guestSnap.data() as any
  const guestOrderCode = String(guest?.orderCode || '').trim()
  if (!isValidOrderCode(guestOrderCode) || guestOrderCode !== inviteValidation.orderCode) {
    const reason = 'Guest orderCode is invalid or does not match invitation'
    orphanLog('guest_order_mismatch', {
      inviteId,
      guestId,
      operation: options.operation,
      guestOrderCode,
      inviteOrderCode: inviteValidation.orderCode,
    })
    if (options.blockOnFailure) {
      await guestRef.set(
        {
          sendStatus: 'relation_failed',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
      await markInviteDispatchStatus(adminDb, inviteValidation.inviteRef, 'relation_invalid', reason)
    }
    return {
      ok: false as const,
      code: 'guest_order_mismatch' as const,
      reason,
      inviteId,
      guestId,
      orderCode: inviteValidation.orderCode,
    }
  }

  return {
    ok: true as const,
    inviteId,
    guestId,
    inviteRef: inviteValidation.inviteRef,
    invite: inviteValidation.invite,
    guestRef,
    guest,
    orderCode: inviteValidation.orderCode,
  }
}
