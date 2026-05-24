import { FieldValue } from 'firebase-admin/firestore'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'
import { runDispatchProtection } from '@/lib/dispatch/kernel'
import { prepareRiskCaseDispatchData } from '@/lib/risk-case/prepare-dispatch'
import { runWhatsAppApiHealthCheck } from '@/lib/sending/api-health-check'

type ModeControlInput = {
  adminDb: FirebaseFirestore.Firestore
  inviteId: string
  mode: 'manual' | 'api'
  adminId: string
  appOrigin: string
}

export async function setDispatchModeWithHealthCheck(input: ModeControlInput) {
  const { adminDb, inviteId, mode, adminId, appOrigin } = input
  const foundation = await ensureInviteOrderFoundation(adminDb, inviteId)
  const protection = await runDispatchProtection({
    adminDb,
    source: 'dispatch_mode_control',
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
      orderCode: protection.orderCode || '',
    }
  }

  const inviteRef = adminDb.collection('invites').doc(inviteId)
  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) return { ok: false as const, status: 404, error: 'Invite not found' }
  const invite = inviteSnap.data() as any
  const oldMode = String(invite?.dispatchMode || foundation.dispatchMode || 'manual').trim().toLowerCase()
  const orderCode = String(invite?.orderCode || invite?.orderNumber || foundation.orderCode || '').trim()

  if (mode === 'manual') {
    if (oldMode === 'api') {
      await inviteRef.set(
        {
          dispatchMode: 'manual',
          dispatchStatus: 'preparing',
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }
    const prepared = await prepareRiskCaseDispatchData({
      adminDb,
      inviteId,
      preparedBy: adminId,
      source: 'dispatch_mode_manual',
      appOrigin,
    })
    if (!prepared.ok) {
      return {
        ok: false as const,
        status: prepared.blocked ? 409 : 500,
        error: prepared.reason || 'Failed to prepare manual risk case',
        decision: prepared.decision || 'blocked',
      }
    }

    await inviteRef.set(
      {
        dispatchMode: 'manual',
        dispatchStatus: 'ready',
        apiHealthStatus: invite?.apiHealthStatus || '',
        apiFailureReason: invite?.apiFailureReason || '',
        apiCheckedAt: invite?.apiCheckedAt || null,
        apiCheckedBy: invite?.apiCheckedBy || '',
        manualPreparedAt: FieldValue.serverTimestamp(),
        manualPreparedBy: adminId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    console.info('[DISPATCH_MODE_CONTROL]', {
      orderCode,
      inviteId,
      oldMode,
      newMode: 'manual',
      adminId,
      apiHealthStatus: String(invite?.apiHealthStatus || ''),
      reason: 'manual_selected_by_admin',
    })

    return {
      ok: true as const,
      status: 200,
      inviteId,
      orderCode,
      oldMode,
      newMode: 'manual' as const,
      dispatchMode: 'manual' as const,
      dispatchStatus: 'ready' as const,
      apiHealthStatus: String(invite?.apiHealthStatus || ''),
      apiFailureReason: String(invite?.apiFailureReason || ''),
      message: 'Risk Case جاهز للإرسال اليدوي.',
      apiChecks: [] as any[],
      fallbackApplied: false,
    }
  }

  const health = runWhatsAppApiHealthCheck()
  if (health.ok) {
    await inviteRef.set(
      {
        dispatchMode: 'api',
        dispatchStatus: 'ready',
        apiHealthStatus: 'passed',
        apiFailureReason: '',
        apiCheckedAt: FieldValue.serverTimestamp(),
        apiCheckedBy: adminId,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    console.info('[DISPATCH_MODE_CONTROL]', {
      orderCode,
      inviteId,
      oldMode,
      newMode: 'api',
      adminId,
      apiHealthStatus: 'passed',
      reason: 'api_health_passed',
    })

    return {
      ok: true as const,
      status: 200,
      inviteId,
      orderCode,
      oldMode,
      newMode: 'api' as const,
      dispatchMode: 'api' as const,
      dispatchStatus: 'ready' as const,
      apiHealthStatus: 'passed',
      apiFailureReason: '',
      apiChecks: health.checks,
      fallbackApplied: false,
      message: 'API جاهز وتم تفعيل وضع الإرسال API.',
    }
  }

  await inviteRef.set(
    {
      dispatchMode: 'manual',
      dispatchStatus: 'preparing',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  const fallbackPrepare = await prepareRiskCaseDispatchData({
    adminDb,
    inviteId,
    preparedBy: adminId,
    source: 'dispatch_mode_api_failed_fallback',
    appOrigin,
  })
  if (!fallbackPrepare.ok) {
    return {
      ok: false as const,
      status: fallbackPrepare.blocked ? 409 : 500,
      error: `API health check failed (${health.reason}) and fallback prepare failed (${fallbackPrepare.reason || 'unknown'})`,
      decision: fallbackPrepare.decision || 'blocked',
    }
  }

  await inviteRef.set(
    {
      dispatchMode: 'manual',
      dispatchStatus: 'ready',
      apiHealthStatus: 'failed',
      apiFailureReason: health.reason || 'API health check failed',
      apiCheckedAt: FieldValue.serverTimestamp(),
      apiCheckedBy: adminId,
      manualPreparedAt: FieldValue.serverTimestamp(),
      manualPreparedBy: adminId,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  const fallbackReason = health.reason || 'API health check failed'
  console.info('[DISPATCH_MODE_CONTROL]', {
    orderCode,
    inviteId,
    oldMode,
    newMode: 'manual',
    adminId,
    apiHealthStatus: 'failed',
    reason: fallbackReason,
  })

  return {
    ok: true as const,
    status: 200,
    inviteId,
    orderCode,
    oldMode,
    newMode: 'manual' as const,
    dispatchMode: 'manual' as const,
    dispatchStatus: 'ready' as const,
    apiHealthStatus: 'failed',
    apiFailureReason: fallbackReason,
    apiChecks: health.checks,
    fallbackApplied: true,
    message: 'تعذر تفعيل API، وتم تحويل الطلب إلى Risk Case للإرسال اليدوي.',
  }
}
