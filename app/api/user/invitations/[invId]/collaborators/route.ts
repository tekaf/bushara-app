import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

async function getSession(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')
  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  if (!app || !adminDb) throw new Error('Admin SDK not configured')
  const decoded = await getAuth(app).verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  return { uid: decoded.uid, adminDb }
}

async function assertOwner(adminDb: any, invId: string, uid: string) {
  const inviteRef = adminDb.collection('invites').doc(invId)
  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) throw new Error('Invite not found')
  const invite = inviteSnap.data() as any
  if (invite?.ownerId !== uid) throw new Error('Forbidden')
  return inviteRef
}

export async function GET(request: NextRequest, { params }: { params: { invId: string } }) {
  try {
    const { uid, adminDb } = await getSession(request)
    const inviteId = params?.invId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })
    const inviteRef = await assertOwner(adminDb, inviteId, uid)
    const snap = await inviteRef.collection('collaborators').get()
    const collaborators = snap.docs.map((doc: any) => ({ id: doc.id, ...(doc.data() as any) }))
    return NextResponse.json({ collaborators })
  } catch (error: any) {
    const status =
      error?.message === 'Unauthorized' ? 401 : error?.message === 'Forbidden' ? 403 : error?.message === 'Invite not found' ? 404 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load collaborators' }, { status })
  }
}

export async function POST(request: NextRequest, { params }: { params: { invId: string } }) {
  try {
    const { uid, adminDb } = await getSession(request)
    const inviteId = params?.invId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })
    const inviteRef = await assertOwner(adminDb, inviteId, uid)

    const body = await request.json()
    const email = String(body?.email || '').trim().toLowerCase()
    const quota = Math.max(1, Number(body?.quota || 0))
    if (!email || !Number.isFinite(quota)) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const userSnap = await adminDb.collection('users').where('email', '==', email).limit(1).get()
    if (userSnap.empty) {
      return NextResponse.json({ error: 'User not found by this email' }, { status: 404 })
    }
    const userDoc = userSnap.docs[0]
    const collaboratorUid = userDoc.id
    const userData = userDoc.data() as any
    if (collaboratorUid === uid) {
      return NextResponse.json({ error: 'You are already the owner' }, { status: 400 })
    }

    await inviteRef.collection('collaborators').doc(collaboratorUid).set(
      {
        uid: collaboratorUid,
        email,
        name: userData?.name || '',
        role: 'collaborator',
        quota,
        used: 0,
        invitedBy: uid,
        inviteAccepted: true,
        updatedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({
      ok: true,
      collaboratorUid,
      inviteLink: `/guests?invId=${encodeURIComponent(inviteId)}`,
    })
  } catch (error: any) {
    const status =
      error?.message === 'Unauthorized' ? 401 : error?.message === 'Forbidden' ? 403 : error?.message === 'Invite not found' ? 404 : 500
    return NextResponse.json({ error: error?.message || 'Failed to add collaborator' }, { status })
  }
}

