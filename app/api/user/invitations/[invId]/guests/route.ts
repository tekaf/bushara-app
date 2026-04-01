import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

type IncomingGuest = {
  phoneLocal: string
  phoneE164: string
  name?: string
}

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

function getInviteLimit(invite: any): number {
  const numeric = Number(invite?.guestLimit || invite?.packageGuests || 0)
  if (!Number.isNaN(numeric) && numeric > 0) return numeric
  const packageId = String(invite?.packageId || '')
  if (packageId === '50') return 50
  if (packageId === '75') return 75
  if (packageId === '100') return 100
  if (packageId === '150') return 150
  return 50
}

function canAccessGuestsForInvite(invite: any): boolean {
  const workflowStatus = String(invite?.workflowStatus || '')
  if (!workflowStatus) {
    // Backward compatibility for old invites before workshop flow.
    return invite?.paymentStatus === 'paid' || invite?.status === 'paid' || invite?.inviteLockedAfterPayment === true
  }
  return workflowStatus === 'approved'
}

export async function GET(request: NextRequest, { params }: { params: { invId: string } }) {
  try {
    const { uid, adminDb } = await getSession(request)
    const inviteId = params?.invId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = inviteSnap.data() as any
    if (!canAccessGuestsForInvite(invite)) {
      return NextResponse.json(
        { error: 'Guests access is blocked until workshop approval' },
        { status: 409 }
      )
    }
    const isOwner = invite?.ownerId === uid
    let collaborator: any = null
    if (!isOwner) {
      const cSnap = await inviteRef.collection('collaborators').doc(uid).get()
      collaborator = cSnap.exists ? cSnap.data() : null
      if (!collaborator) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const filter = request.nextUrl.searchParams.get('filter') || 'all'
    const guestsSnap = await inviteRef.collection('guests').orderBy('createdAt', 'desc').limit(1000).get()
    const toEffectiveStatus = (row: any) => {
      const rsvp = String(row?.rsvpStatus || '').trim()
      if (rsvp === 'accepted' || rsvp === 'declined') return rsvp
      return String(row?.status || 'pending')
    }

    let rows = guestsSnap.docs.map((doc) => {
      const raw = doc.data() as any
      return {
        id: doc.id,
        ...raw,
        status: toEffectiveStatus(raw),
      }
    })
    if (!isOwner) rows = rows.filter((row) => row.assignedToUid === uid)
    if (filter !== 'all') rows = rows.filter((row) => row.status === filter)

    const totalAll = guestsSnap.size
    const acceptedAll = guestsSnap.docs.filter((d) => toEffectiveStatus(d.data()) === 'accepted').length
    const declinedAll = guestsSnap.docs.filter((d) => toEffectiveStatus(d.data()) === 'declined').length
    const sentAll = guestsSnap.docs.filter((d) => String((d.data() as any)?.status || '') === 'sent').length
    const pendingAll = totalAll - acceptedAll - declinedAll

    return NextResponse.json({
      guests: rows,
      scope: isOwner ? 'owner' : 'collaborator',
      quota: isOwner
        ? { total: getInviteLimit(invite), used: totalAll, remaining: Math.max(0, getInviteLimit(invite) - totalAll) }
        : {
            total: Number(collaborator?.quota || 0),
            used: Number(collaborator?.used || 0),
            remaining: Math.max(0, Number(collaborator?.quota || 0) - Number(collaborator?.used || 0)),
          },
      stats: {
        total: totalAll,
        sent: sentAll,
        accepted: acceptedAll,
        declined: declinedAll,
        pending: pendingAll,
      },
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load guests' }, { status })
  }
}

export async function POST(request: NextRequest, { params }: { params: { invId: string } }) {
  try {
    const { uid, adminDb } = await getSession(request)
    const inviteId = params?.invId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })
    const body = await request.json()
    const guests = (body?.guests || []) as IncomingGuest[]
    if (!Array.isArray(guests) || guests.length === 0) {
      return NextResponse.json({ error: 'No guests to save' }, { status: 400 })
    }

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = inviteSnap.data() as any
    if (!canAccessGuestsForInvite(invite)) {
      return NextResponse.json(
        { error: 'Guests access is blocked until workshop approval' },
        { status: 409 }
      )
    }
    const isOwner = invite?.ownerId === uid
    let collaboratorRef: any = null
    if (!isOwner) {
      collaboratorRef = inviteRef.collection('collaborators').doc(uid)
      const cSnap = await collaboratorRef.get()
      const collaborator = cSnap.exists ? cSnap.data() : null
      if (!collaborator) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const incoming = guests.filter((g) => g?.phoneE164 && g?.phoneLocal)
    const uniqueMap = new Map<string, IncomingGuest>()
    incoming.forEach((g) => uniqueMap.set(g.phoneE164, g))
    const uniqueGuests = Array.from(uniqueMap.values())

    const result = await adminDb.runTransaction(async (tx) => {
      const txInviteSnap = await tx.get(inviteRef)
      if (!txInviteSnap.exists) {
        return { ok: false as const, status: 404, error: 'Invite not found' }
      }
      const txInvite = txInviteSnap.data() as any
      if (!canAccessGuestsForInvite(txInvite)) {
        return {
          ok: false as const,
          status: 409,
          error: 'Guests access is blocked until workshop approval',
        }
      }

      let txCollaborator: any = null
      if (!isOwner && collaboratorRef) {
        const txCollaboratorSnap = await tx.get(collaboratorRef)
        txCollaborator = txCollaboratorSnap.exists ? txCollaboratorSnap.data() : null
        if (!txCollaborator) {
          return { ok: false as const, status: 403, error: 'Forbidden' }
        }
      }

      const txGuestsSnap = await tx.get(inviteRef.collection('guests'))
      const txExistingPhones = new Set(
        txGuestsSnap.docs.map((d) => String((d.data() as any).phoneE164 || '').trim())
      )
      const txToWrite = uniqueGuests.filter((g) => !txExistingPhones.has(String(g.phoneE164 || '').trim()))

      if (txToWrite.length === 0) {
        const limit = isOwner ? getInviteLimit(txInvite) : Number(txCollaborator?.quota || 0)
        return {
          ok: true as const,
          added: 0,
          skipped: incoming.length,
          totalAfter: txGuestsSnap.size,
          limit,
          message: 'All guests already exist',
        }
      }

      let writableCount = txToWrite.length
      let partialMessage = ''
      if (isOwner) {
        const limit = getInviteLimit(txInvite)
        const remaining = Math.max(0, limit - txGuestsSnap.size)
        if (remaining <= 0) {
          return {
            ok: false as const,
            status: 409,
            error: `Quota exceeded: limit ${limit}, current ${txGuestsSnap.size}, trying ${txToWrite.length}`,
          }
        }
        if (txToWrite.length > remaining) {
          writableCount = remaining
          partialMessage = `Reached package limit. Added only ${remaining} guest(s).`
        }
      } else {
        const used = Number(txCollaborator?.used || 0)
        const quota = Number(txCollaborator?.quota || 0)
        const remaining = Math.max(0, quota - used)
        if (remaining <= 0) {
          return {
            ok: false as const,
            status: 409,
            error: `Quota exceeded: your quota ${quota}, used ${used}, trying ${txToWrite.length}`,
          }
        }
        if (txToWrite.length > remaining) {
          writableCount = remaining
          partialMessage = `Reached collaborator quota. Added only ${remaining} guest(s).`
        }
      }

      const finalToWrite = txToWrite.slice(0, writableCount)
      finalToWrite.forEach((guest) => {
        const ref = inviteRef.collection('guests').doc()
        tx.set(ref, {
          phoneLocal: guest.phoneLocal,
          phoneE164: guest.phoneE164,
          name: guest.name?.trim() || '',
          status: 'pending',
          sendStatus: 'pending',
          sendAttemptCount: 0,
          lastSendAt: null,
          lastSendError: '',
          assignedToUid: uid,
          assignedToLabel: isOwner ? 'أنت' : 'شريك',
          createdByUid: uid,
          createdAt: new Date(),
          updatedAt: new Date(),
          rsvpToken: crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, ''),
        })
      })

      if (!isOwner && collaboratorRef) {
        tx.set(
          collaboratorRef,
          {
            used: Number(txCollaborator?.used || 0) + finalToWrite.length,
            updatedAt: new Date(),
          },
          { merge: true }
        )
      }

      const limit = isOwner ? getInviteLimit(txInvite) : Number(txCollaborator?.quota || 0)
      return {
        ok: true as const,
        added: finalToWrite.length,
        skipped: incoming.length - finalToWrite.length,
        totalAfter: txGuestsSnap.size + finalToWrite.length,
        limit,
        ...(partialMessage ? { message: partialMessage } : {}),
      }
    })

    if (!result.ok) {
      console.warn('[GUESTS][POST] blocked', {
        inviteId,
        uid,
        isOwner,
        error: result.error,
      })
      return NextResponse.json({ error: result.error }, { status: result.status })
    }

    console.log('[GUESTS][POST] completed', {
      inviteId,
      uid,
      isOwner,
      incoming: incoming.length,
      unique: uniqueGuests.length,
      added: result.added,
      skipped: result.skipped,
      totalAfter: result.totalAfter,
      limit: result.limit,
    })

    return NextResponse.json({
      ok: true,
      added: result.added,
      skipped: result.skipped,
      totalAfter: result.totalAfter,
      limit: result.limit,
      ...(result.message ? { message: result.message } : {}),
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to save guests' }, { status })
  }
}
