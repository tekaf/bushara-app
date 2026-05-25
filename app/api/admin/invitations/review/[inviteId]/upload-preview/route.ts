import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'

export const runtime = 'nodejs'
export const maxDuration = 30

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')
  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  const email = decoded.email || (await auth.getUser(decoded.uid)).email || ''
  if (!isAdminEmailServer(email)) throw new Error('Unauthorized')
  return decoded.uid
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = String(params?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const imageBase64 = String(body?.imageBase64 || '').trim()
    if (!imageBase64) {
      return NextResponse.json({ error: 'Missing imageBase64 preview payload' }, { status: 400 })
    }

    const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '')
    const pngBuffer = Buffer.from(base64Data, 'base64')
    if (!pngBuffer.length) {
      return NextResponse.json({ error: 'Invalid preview image data' }, { status: 400 })
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteSnap = await adminDb.collection('invites').doc(inviteId).get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)

    const bucket = getAdminBucket()
    if (!bucket) return NextResponse.json({ error: 'Storage not configured' }, { status: 500 })

    const fileName = `workshop-previews/${inviteId}/${Date.now()}.png`
    const fileRef = bucket.file(fileName)
    await fileRef.save(pngBuffer, { metadata: { contentType: 'image/png' } })

    try {
      await fileRef.makePublic()
    } catch {
      // ignore if bucket uses uniform access only
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
      action: 'admin_preview_uploaded',
      notes: 'Workshop preview captured in browser and uploaded (no server Chromium).',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
      actorRole: 'admin',
    })

    return NextResponse.json({
      ok: true,
      adminPreviewUrl,
      deployTag: process.env.VERCEL_GIT_COMMIT_SHA || 'local',
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload preview'
    const status = message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
