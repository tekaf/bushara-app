import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

async function findGuestByToken(token: string, inviteId?: string) {
  const adminDb = getAdminFirestore()
  if (!adminDb) throw new Error('Admin SDK not configured')

  if (inviteId) {
    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return null
    const guestsSnap = await inviteRef.collection('guests').where('rsvpToken', '==', token).limit(1).get()
    if (guestsSnap.empty) return null
    const guestDoc = guestsSnap.docs[0]
    return {
      guestRef: guestDoc.ref,
      inviteId: inviteRef.id,
      guestId: guestDoc.id,
      guest: guestDoc.data() as any,
      invite: inviteSnap.data() as any,
    }
  }

  let snap: FirebaseFirestore.QuerySnapshot<FirebaseFirestore.DocumentData>
  try {
    snap = await adminDb.collectionGroup('guests').where('rsvpToken', '==', token).limit(1).get()
  } catch {
    throw new Error('لا يمكن فتح رابط RSVP القديم. انسخ الرابط الجديد من صفحة المدعوين.')
  }
  if (snap.empty) return null

  const guestDoc = snap.docs[0]
  const inviteRef = guestDoc.ref.parent.parent
  if (!inviteRef) return null
  const inviteSnap = await inviteRef.get()
  if (!inviteSnap.exists) return null

  return {
    guestRef: guestDoc.ref,
    inviteId: inviteRef.id,
    guestId: guestDoc.id,
    guest: guestDoc.data() as any,
    invite: inviteSnap.data() as any,
  }
}

function isFinalRsvpStatus(status: string) {
  return status === 'accepted' || status === 'declined'
}

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = params?.token || ''
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    const inviteId = _.nextUrl.searchParams.get('inv') || _.nextUrl.searchParams.get('inviteId') || ''

    const found = await findGuestByToken(token, inviteId || undefined)
    if (!found) return NextResponse.json({ error: 'Invite token not found' }, { status: 404 })

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    let inviteImageUrl = ''
    const inviteData = found.invite || {}
    if (typeof inviteData?.inviteImageUrl === 'string' && inviteData.inviteImageUrl) {
      inviteImageUrl = inviteData.inviteImageUrl
    } else if (typeof inviteData?.finalUrl === 'string' && inviteData.finalUrl) {
      inviteImageUrl = inviteData.finalUrl
    } else if (typeof inviteData?.previewUrl === 'string' && inviteData.previewUrl) {
      inviteImageUrl = inviteData.previewUrl
    } else if (inviteData?.designId) {
      const templateSnap = await adminDb.collection('templates').doc(String(inviteData.designId)).get()
      if (templateSnap.exists) {
        const template = templateSnap.data() as any
        inviteImageUrl = String(template?.assets?.backgroundUrl || template?.assets?.thumbUrl || '')
      }
    }

    const marketingSnap = await adminDb
      .collection('templates')
      .where('status', '==', 'published')
      .limit(6)
      .get()
    const marketingTemplates = marketingSnap.docs
      .map((doc) => {
        const row = doc.data() as any
        return {
          id: doc.id,
          name: String(row?.name || 'تصميم'),
          imageUrl: String(row?.assets?.thumbUrl || row?.assets?.backgroundUrl || ''),
        }
      })
      .filter((item) => item.imageUrl)
      .slice(0, 3)

    const guestStatus = String(found.guest?.rsvpStatus || found.guest?.status || 'pending')
    const respondedAt = found.guest?.rsvpRespondedAt?.toDate?.()?.toISOString?.() || null

    return NextResponse.json({
      ok: true,
      inviteId: found.inviteId,
      guestId: found.guestId,
      invite: {
        title: found.invite?.title || '',
        groomName: found.invite?.groomName || '',
        brideName: found.invite?.brideName || '',
        date: found.invite?.date || '',
        time: found.invite?.time || '',
        locationName: found.invite?.locationName || '',
        locationMapUrl: found.invite?.locationMapUrl || '',
        imageUrl: inviteImageUrl,
      },
      guest: {
        name: found.guest?.name || '',
        status: guestStatus,
        rsvpStatus: guestStatus,
        respondedAt,
      },
      canRespond: !isFinalRsvpStatus(guestStatus),
      marketingTemplates,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load RSVP' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const token = params?.token || ''
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    const inviteId = request.nextUrl.searchParams.get('inv') || request.nextUrl.searchParams.get('inviteId') || ''
    const body = await request.json().catch(() => ({}))
    const response = String(body?.response || '')
    if (response !== 'accepted' && response !== 'declined') {
      return NextResponse.json({ error: 'Invalid response' }, { status: 400 })
    }

    const found = await findGuestByToken(token, inviteId || undefined)
    if (!found) return NextResponse.json({ error: 'Invite token not found' }, { status: 404 })
    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const txResult = await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(found.guestRef)
      if (!snap.exists) throw new Error('Guest not found')
      const row = snap.data() as any
      const currentStatus = String(row?.rsvpStatus || row?.status || 'pending')
      if (isFinalRsvpStatus(currentStatus)) {
        return {
          updated: false,
          currentStatus,
          respondedAt: row?.rsvpRespondedAt?.toDate?.()?.toISOString?.() || null,
        }
      }
      const now = new Date()
      tx.set(
        found.guestRef,
        {
          status: response,
          rsvpStatus: response,
          rsvpRespondedAt: now,
          updatedAt: now,
        },
        { merge: true }
      )
      return {
        updated: true,
        currentStatus: response,
        respondedAt: now.toISOString(),
      }
    })

    if (!txResult.updated) {
      return NextResponse.json({
        ok: true,
        alreadyResponded: true,
        response: txResult.currentStatus,
        respondedAt: txResult.respondedAt,
      })
    }

    return NextResponse.json({ ok: true, response, respondedAt: txResult.respondedAt })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to update RSVP' }, { status: 500 })
  }
}

