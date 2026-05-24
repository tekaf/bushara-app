import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'
import { sanitizeForFirestore, sanitizeRenderFieldsByTemplateType, type SnapshotTemplateType } from '@/lib/workshop/snapshot'
import { type FinalInvitationSnapshot } from '@/lib/workshop/snapshot'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'

export const runtime = 'nodejs'

const WORKSHOP_EDITABLE_STATUSES = new Set<string>([
  INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
  INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
  INVITE_WORKFLOW_STATUS.APPROVED,
  INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SENT,
])

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

function cleanText(value: unknown, maxLen: number) {
  return String(value || '')
    .trim()
    .slice(0, maxLen)
}

function pickOptionalClean(body: Record<string, any>, key: string, maxLen: number): string | undefined {
  if (!Object.prototype.hasOwnProperty.call(body, key)) return undefined
  return cleanText(body?.[key], maxLen)
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const skipSnapshotSync = body?.skipSnapshotSync === true
    const updates: Record<string, string> = {}
    const textFields: Array<[string, number]> = [
      ['title', 120],
      ['selectedOccasion', 80],
      ['groomName', 80],
      ['brideName', 80],
      ['groomNameEn', 80],
      ['brideNameEn', 80],
      ['brideFatherName', 100],
      ['groomFatherName', 100],
      ['engagementDate', 40],
      ['invitationType', 40],
      ['date', 40],
      ['dateText', 120],
      ['time', 40],
      ['locationName', 160],
      ['venueText', 160],
      ['hallLocation', 160],
      ['receptionTime', 80],
      ['zaffaTime', 80],
      ['introText', 160],
      ['inviteLine', 200],
      ['verseOrDua', 240],
      ['fullDateLine', 200],
      ['weddingDayLine', 200],
      ['fatherOfBride', 100],
      ['fatherOfGroom', 100],
      ['motherOfBride', 100],
      ['motherOfGroom', 100],
    ]
    for (const [key, maxLen] of textFields) {
      const value = pickOptionalClean(body, key, maxLen)
      if (value === undefined) continue
      updates[key] = value
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)
    const invite = inviteSnap.data() as any

    const workflowStatus = String(invite?.workflowStatus || '').trim()
    if (!WORKSHOP_EDITABLE_STATUSES.has(workflowStatus)) {
      return NextResponse.json(
        { error: `Editing is not allowed for workflow status: ${workflowStatus || 'unknown'}.` },
        { status: 409 }
      )
    }

    if (Object.keys(updates).length > 0) {
      await inviteRef.set(
        {
          ...updates,
          workshopEditedAt: FieldValue.serverTimestamp(),
          workshopEditedBy: adminUid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )
    }

    if (!skipSnapshotSync) {
      const internalRef = adminDb.collection('invitation_internal').doc(inviteId)
      const internalSnap = await internalRef.get()
      const internal = internalSnap.exists ? (internalSnap.data() as any) : {}
      const snapshot = (internal?.finalInvitationSnapshot || null) as FinalInvitationSnapshot | null
      if (snapshot?.fields) {
        const templateType = (snapshot?.templateType || 'A') as SnapshotTemplateType
        const nextFields = { ...(snapshot.fields || {}) } as any
        if ('groomName' in updates) nextFields.groomNameAr = updates.groomName
        if ('brideName' in updates) nextFields.brideNameAr = updates.brideName
        if ('groomNameEn' in updates) nextFields.groomNameEn = updates.groomNameEn
        if ('brideNameEn' in updates) nextFields.brideNameEn = updates.brideNameEn
        if ('dateText' in updates || 'date' in updates) {
          const dateValue = updates.dateText || updates.date || ''
          nextFields.dateText = dateValue
          nextFields.date_en = dateValue
        }
        if ('hallLocation' in updates || 'locationName' in updates || 'venueText' in updates) {
          const location = updates.hallLocation || updates.locationName || updates.venueText || ''
          nextFields.hallLocation = location
          nextFields.location_name = location
          nextFields.venueText = location
        }
        if ('receptionTime' in updates || 'time' in updates) nextFields.receptionTime = updates.receptionTime || updates.time || ''
        if ('zaffaTime' in updates) nextFields.zaffaTime = updates.zaffaTime
        if ('introText' in updates) nextFields.intro_text = updates.introText
        if ('inviteLine' in updates) nextFields.invite_line = updates.inviteLine
        if ('verseOrDua' in updates) nextFields.verse_or_dua = updates.verseOrDua
        if ('fatherOfBride' in updates) nextFields.fatherOfBride = updates.fatherOfBride
        if ('fatherOfGroom' in updates) nextFields.fatherOfGroom = updates.fatherOfGroom
        if ('brideFatherName' in updates && !('fatherOfBride' in updates)) nextFields.fatherOfBride = updates.brideFatherName
        if ('groomFatherName' in updates && !('fatherOfGroom' in updates)) nextFields.fatherOfGroom = updates.groomFatherName
        if ('motherOfBride' in updates) nextFields.motherOfBride = updates.motherOfBride
        if ('motherOfGroom' in updates) nextFields.motherOfGroom = updates.motherOfGroom
        if ('fullDateLine' in updates) nextFields.fullDateLine = updates.fullDateLine
        if ('weddingDayLine' in updates) nextFields.weddingDayLine = updates.weddingDayLine

        await internalRef.set(
          {
            finalInvitationSnapshot: sanitizeForFirestore({
              ...snapshot,
              templateType,
              backgroundUrl: String(snapshot.backgroundUrl || ''),
              fields: sanitizeRenderFieldsByTemplateType(nextFields, templateType),
              updatedAt: new Date().toISOString(),
            }),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        )
      }
    }

    await adminDb.collection('invitation_reviews').add({
      inviteId,
      action: 'edited_by_admin',
      notes: 'Minor text/date/location corrections were applied by admin.',
      changes: updates,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
      actorRole: 'admin',
    })

    return NextResponse.json({ ok: true, updates })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to edit invite' }, { status })
  }
}

