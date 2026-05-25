import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { getAdminBucket } from '@/lib/firebase/admin'

export async function uploadWorkshopPreviewPng(
  adminDb: Firestore,
  inviteId: string,
  pngBuffer: Buffer,
  adminUid: string,
  reviewAction: string,
  reviewNotes: string
): Promise<string> {
  const bucket = getAdminBucket()
  if (!bucket) throw new Error('Storage not configured')

  const fileName = `workshop-previews/${inviteId}/${Date.now()}.png`
  const fileRef = bucket.file(fileName)
  await fileRef.save(pngBuffer, { metadata: { contentType: 'image/png' } })

  try {
    await fileRef.makePublic()
  } catch {
    // ignore
  }

  const adminPreviewUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`

  await adminDb.collection('invitation_internal').doc(inviteId).set(
    {
      adminPreviewUrl,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  await adminDb.collection('invitation_reviews').add({
    inviteId,
    action: reviewAction,
    notes: reviewNotes,
    createdAt: FieldValue.serverTimestamp(),
    createdBy: adminUid,
    actorRole: 'admin',
  })

  return adminPreviewUrl
}
