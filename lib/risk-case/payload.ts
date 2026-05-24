import { runDispatchProtection } from '@/lib/dispatch/kernel'
import { prepareRiskCaseDispatchData } from '@/lib/risk-case/prepare-dispatch'
import {
  DEFAULT_RISK_CASE_TEMPLATE,
  buildInviteEventDate,
  buildInviteHostName,
  buildInviteOccasionType,
} from '@/lib/risk-case/message'

function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    const d = value.toDate()
    return d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : null
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

export async function buildRiskCasePayload(params: {
  adminDb: FirebaseFirestore.Firestore
  inviteId: string
  actorId: string
  source: string
  appOrigin?: string
  allowPrepareIfMissing?: boolean
  forceRegenerate?: boolean
}) {
  const {
    adminDb,
    inviteId,
    actorId,
    source,
    appOrigin = '',
    allowPrepareIfMissing = false,
    forceRegenerate = false,
  } = params

  const protection = await runDispatchProtection({
    adminDb,
    source: 'manual_dispatch',
    inviteId,
    checkGuestRelations: true,
    blockOnFailure: true,
  })
  if (!protection.valid) {
    return {
      ok: false as const,
      status: protection.decision === 'orphan_blocked' ? 404 : 409,
      error: protection.reason,
      decision: protection.decision,
      orderCode: String(protection.orderCode || ''),
    }
  }

  const inviteRef = adminDb.collection('invites').doc(inviteId)
  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) return { ok: false as const, status: 404, error: 'Invite not found' }
  const invite = inviteSnap.data() as any

  if (String(invite?.dispatchMode || 'manual').trim().toLowerCase() !== 'manual') {
    return {
      ok: false as const,
      status: 409,
      error: 'Risk Case is available only for manual dispatch mode',
      decision: 'invalid_dispatch_state',
    }
  }

  const dispatchRef = adminDb.collection('risk_case_dispatches').doc(inviteId)
  const dispatchSnap = await dispatchRef.get()
  if ((!dispatchSnap.exists && allowPrepareIfMissing) || forceRegenerate) {
    const prepared = await prepareRiskCaseDispatchData({
      adminDb,
      inviteId,
      preparedBy: actorId,
      source,
      appOrigin,
      forceRegenerate,
    })
    if (!prepared.ok) {
      return {
        ok: false as const,
        status: prepared.blocked ? 409 : 500,
        error: prepared.reason || 'Failed to prepare risk case data',
        decision: prepared.decision || 'blocked',
      }
    }
  } else if (!dispatchSnap.exists) {
    return { ok: false as const, status: 404, error: 'Risk Case dispatch record not found' }
  }

  const [freshDispatchSnap, wavesSnap, entriesSnap] = await Promise.all([
    dispatchRef.get(),
    adminDb.collection('risk_case_waves').where('inviteId', '==', inviteId).get(),
    dispatchRef.collection('entries').get(),
  ])
  if (!freshDispatchSnap.exists) {
    return { ok: false as const, status: 404, error: 'Risk Case dispatch record not found' }
  }
  const dispatch = freshDispatchSnap.data() as any

  const waves = wavesSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
    .sort((a, b) => Number(a.waveNumber || 0) - Number(b.waveNumber || 0))
    .map((wave) => ({
      id: wave.id,
      waveNumber: Number(wave.waveNumber || 0),
      waveStatus: String(wave.waveStatus || 'ready_manual'),
      totalGuestsInWave: Number(wave.totalGuestsInWave || 0),
    }))

  const entries = entriesSnap.docs
    .map((doc) => ({ id: doc.id, ...(doc.data() as any) }))
    .sort((a, b) => {
      const waveDiff = Number(a.waveNumber || 0) - Number(b.waveNumber || 0)
      if (waveDiff !== 0) return waveDiff
      return String(a.guestName || '').localeCompare(String(b.guestName || ''))
    })
    .map((entry) => ({
      guestId: String(entry.guestId || entry.id),
      guestName: String(entry.guestName || ''),
      rawPhone: String(entry.rawPhone || entry.phone || ''),
      normalizedPhone: String(entry.normalizedPhone || ''),
      invitationLink: String(entry.invitationLink || ''),
      shortInvitationLink: String(entry.shortInvitationLink || ''),
      whatsappLink: String(entry.whatsappLink || ''),
      messageText: String(entry.messageText || ''),
      sendStatus: String(entry.sendStatus || 'pending_manual'),
      reason: String(entry.reason || ''),
      waveNumber: Number(entry.waveNumber || 1),
      manualSendCount: Number(entry.manualSendCount || 0),
      lastAttemptAt: toIso(entry.lastAttemptAt),
      sentByAdmin: String(entry.sentByAdmin || ''),
      sentAt: toIso(entry.sentAt),
    }))

  return {
    ok: true as const,
    orderCode: String(invite?.orderCode || invite?.orderNumber || protection.orderCode || ''),
    payload: {
      ok: true,
      invite: {
        id: inviteId,
        orderCode: String(invite?.orderCode || invite?.orderNumber || ''),
        occasionType: buildInviteOccasionType(invite),
        hostName: buildInviteHostName(invite),
        eventDate: buildInviteEventDate(invite),
        dispatchMode: String(invite?.dispatchMode || 'manual'),
        dispatchState: String(dispatch?.dispatchState || invite?.dispatchStatus || 'pending_manual'),
      },
      dispatch: {
        dispatchId: inviteId,
        currentWave: Number(dispatch?.currentWave || 1),
        totalGuests: Number(dispatch?.totalGuests || entries.length),
        totalWaves: Number(dispatch?.totalWaves || waves.length),
        preparedAt: toIso(dispatch?.preparedAt),
        preparedBy: String(dispatch?.preparedBy || ''),
        dispatchState: String(dispatch?.dispatchState || 'ready_manual'),
      },
      dispatchControl: {
        dispatchMode: String(invite?.dispatchMode || 'manual'),
        dispatchStatus: String(invite?.dispatchStatus || 'pending'),
        apiHealthStatus: String(invite?.apiHealthStatus || ''),
        apiFailureReason: String(invite?.apiFailureReason || ''),
        apiCheckedAt: toIso(invite?.apiCheckedAt),
        apiCheckedBy: String(invite?.apiCheckedBy || ''),
        manualPreparedAt: toIso(invite?.manualPreparedAt),
        manualPreparedBy: String(invite?.manualPreparedBy || ''),
      },
      messageTemplate: DEFAULT_RISK_CASE_TEMPLATE,
      waves,
      entries,
    },
  }
}
