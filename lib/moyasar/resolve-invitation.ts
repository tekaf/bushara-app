import 'server-only'
import { Firestore } from 'firebase-admin/firestore'
import { getMoyasarInvitesCollection } from '@/lib/moyasar/server'
import type { MoyasarPayment } from '@/lib/moyasar/types'

export function extractInvitationIdFromPayment(payment: MoyasarPayment): string {
  return String(payment?.metadata?.invitationId || payment?.metadata?.inviteId || '').trim()
}

export async function resolveInvitationIdFromPayment(
  adminDb: Firestore,
  payment: MoyasarPayment
): Promise<string> {
  const fromMetadata = extractInvitationIdFromPayment(payment)
  if (fromMetadata) return fromMetadata

  const invoiceId = String(payment?.invoice_id || '').trim()
  if (!invoiceId) return ''

  const invitesCollection = getMoyasarInvitesCollection()
  const byInvoice = await adminDb
    .collection(invitesCollection)
    .where('moyasarInvoiceId', '==', invoiceId)
    .limit(1)
    .get()

  if (!byInvoice.empty) {
    return byInvoice.docs[0].id
  }

  return ''
}
