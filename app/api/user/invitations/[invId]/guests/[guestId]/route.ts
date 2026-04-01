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

async function canAccessInvite(adminDb: any, uid: string, inviteId: string) {
  const inviteRef = adminDb.collection('invites').doc(inviteId)
  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) return { allowed: false, reason: 'Invite not found', inviteRef, isOwner: false }
  const invite = inviteSnap.data() as any
  const isOwner = invite?.ownerId === uid
  if (isOwner) return { allowed: true, inviteRef, isOwner: true }
  const collaboratorSnap = await inviteRef.collection('collaborators').doc(uid).get()
  if (!collaboratorSnap.exists) return { allowed: false, reason: 'Forbidden', inviteRef, isOwner: false }
  return { allowed: true, inviteRef, isOwner: false }
}

function canAccessGuestsForInvite(invite: any): boolean {
  const workflowStatus = String(invite?.workflowStatus || '')
  if (!workflowStatus) {
    // Backward compatibility for old invites before workshop flow.
    return invite?.paymentStatus === 'paid' || invite?.status === 'paid' || invite?.inviteLockedAfterPayment === true
  }
  return workflowStatus === 'approved'
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { invId: string; guestId: string } }
) {
  try {
    const { uid, adminDb } = await getSession(request)
    const inviteId = params?.invId
    const guestId = params?.guestId
    if (!inviteId || !guestId) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })

    const access = await canAccessInvite(adminDb, uid, inviteId)
    if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: 403 })
    const inviteSnap = await access.inviteRef.get()
    const invite = inviteSnap.data() as any
    if (!canAccessGuestsForInvite(invite)) {
      return NextResponse.json(
        { error: 'Guests access is blocked until workshop approval' },
        { status: 409 }
      )
    }

    const guestRef = access.inviteRef.collection('guests').doc(guestId)
    const guestSnap = await guestRef.get()
    if (!guestSnap.exists) return NextResponse.json({ error: 'Guest not found' }, { status: 404 })
    const guest = guestSnap.data() as any
    if (!access.isOwner && guest?.assignedToUid !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    await guestRef.set(
      {
        ...(typeof body?.name === 'string' ? { name: body.name.trim() } : {}),
        ...(typeof body?.phoneLocal === 'string' ? { phoneLocal: body.phoneLocal } : {}),
        ...(typeof body?.phoneE164 === 'string' ? { phoneE164: body.phoneE164 } : {}),
        ...(typeof body?.status === 'string' ? { status: body.status } : {}),
        updatedAt: new Date(),
      },
      { merge: true }
    )
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to update guest' }, { status })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { invId: string; guestId: string } }
) {
  try {
    const { uid, adminDb } = await getSession(request)
    const inviteId = params?.invId
    const guestId = params?.guestId
    if (!inviteId || !guestId) return NextResponse.json({ error: 'Missing ids' }, { status: 400 })

    const access = await canAccessInvite(adminDb, uid, inviteId)
    if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: 403 })
    const inviteSnap = await access.inviteRef.get()
    const invite = inviteSnap.data() as any
    if (!canAccessGuestsForInvite(invite)) {
      return NextResponse.json(
        { error: 'Guests access is blocked until workshop approval' },
        { status: 409 }
      )
    }

    const guestRef = access.inviteRef.collection('guests').doc(guestId)
    const guestSnap = await guestRef.get()
    if (!guestSnap.exists) return NextResponse.json({ error: 'Guest not found' }, { status: 404 })
    const guest = guestSnap.data() as any
    if (!access.isOwner && guest?.assignedToUid !== uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const effectiveStatus = String(guest?.rsvpStatus || guest?.status || 'pending')
    if (effectiveStatus !== 'declined') {
      return NextResponse.json(
        { error: 'Guest can be deleted only if they declined the invitation.' },
        { status: 409 }
      )
    }

    await guestRef.delete()
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to delete guest' }, { status })
  }
}
