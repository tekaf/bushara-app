import 'server-only'
import { FieldValue, Firestore } from 'firebase-admin/firestore'
import { getMoyasarInvitesCollection } from '@/lib/moyasar/server'
import type { MoyasarPayment } from '@/lib/moyasar/types'

export async function markInvitationPaidFromMoyasar(
  adminDb: Firestore,
  invitationId: string,
  payment: MoyasarPayment
): Promise<{ alreadyPaid: boolean }> {
  const invitesCollection = getMoyasarInvitesCollection()
  const inviteRef = adminDb.collection(invitesCollection).doc(invitationId)
  const inviteSnap = await inviteRef.get()

  if (!inviteSnap.exists) {
    throw new Error(`Invite not found: ${invitationId}`)
  }

  const existing = inviteSnap.data() as Record<string, unknown>
  if (existing?.paymentStatus === 'paid' || existing?.paid === true) {
    console.info('[MOYASAR_FIRESTORE_UPDATED] skipped — already paid', { invitationId })
    return { alreadyPaid: true }
  }

  await inviteRef.set(
    {
      paid: true,
      paymentStatus: 'paid',
      status: 'paid',
      orderStatus: 'pending_review',
      paidAt: FieldValue.serverTimestamp(),
      inviteLockedAfterPayment: true,
      paymentProvider: 'moyasar',
      paymentMethod: 'moyasar',
      moyasarPaymentId: payment.id,
      moyasarInvoiceId: payment.invoice_id || existing?.moyasarInvoiceId || null,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  console.info('[MOYASAR_FIRESTORE_UPDATED]', {
    invitationId,
    collection: invitesCollection,
    paymentId: payment.id,
  })

  return { alreadyPaid: false }
}
