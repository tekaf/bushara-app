import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'

export const runtime = 'nodejs'

type LayoutB = {
  groom: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
  bride: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
  date: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
}

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

function n(value: unknown, fallback = 0) {
  const x = Number(value)
  return Number.isFinite(x) ? x : fallback
}

export async function GET(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteSnap = await adminDb.collection('invites').doc(inviteId).get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = inviteSnap.data() as any

    const internalSnap = await adminDb.collection('invitation_internal').doc(inviteId).get()
    const internal = internalSnap.exists ? (internalSnap.data() as any) : {}

    const templateSnap = await adminDb.collection('templates').doc(String(invite?.designId || '')).get()
    const template = templateSnap.exists ? (templateSnap.data() as any) : {}

    return NextResponse.json({
      ok: true,
      invite: {
        id: inviteId,
        designId: String(invite?.designId || ''),
        workflowStatus: String(invite?.workflowStatus || ''),
      },
      designer: {
        layoutB: internal?.workshopDesigner?.layoutB || template?.layoutB || null,
        blockStyleOverrides: internal?.workshopDesigner?.blockStyleOverrides || {},
      },
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load designer config' }, { status })
  }
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const layoutIn = (body?.layoutB || {}) as Partial<LayoutB>
    const styleIn = (body?.blockStyleOverrides || {}) as Record<string, any>

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    const invite = inviteSnap.data() as any
    if (String(invite?.workflowStatus || '') !== INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW) {
      return NextResponse.json({ error: 'Designer is available only in workshop review.' }, { status: 409 })
    }

    const layoutB: LayoutB = {
      groom: {
        xPx: Math.max(0, Math.round(n(layoutIn?.groom?.xPx, 726))),
        yPx: Math.max(0, Math.round(n(layoutIn?.groom?.yPx, 539))),
        fontSize: Math.max(10, Math.round(n(layoutIn?.groom?.fontSize, 54))),
      },
      bride: {
        xPx: Math.max(0, Math.round(n(layoutIn?.bride?.xPx, 126))),
        yPx: Math.max(0, Math.round(n(layoutIn?.bride?.yPx, 537))),
        fontSize: Math.max(10, Math.round(n(layoutIn?.bride?.fontSize, 54))),
      },
      date: {
        xPx: Math.max(0, Math.round(n(layoutIn?.date?.xPx, 461))),
        yPx: Math.max(0, Math.round(n(layoutIn?.date?.yPx, 1301))),
        fontSize: Math.max(10, Math.round(n(layoutIn?.date?.fontSize, 24))),
      },
    }

    const blockStyleOverrides: Record<string, any> = {}
    for (const key of ['groom_name', 'bride_name', 'date']) {
      const row = styleIn?.[key] || {}
      blockStyleOverrides[key] = {
        color: String(row?.color || '').trim() || undefined,
        fontFamily: String(row?.fontFamily || '').trim() || undefined,
        fontWeight: Number.isFinite(Number(row?.fontWeight)) ? Number(row?.fontWeight) : undefined,
      }
    }

    await adminDb.collection('invitation_internal').doc(inviteId).set(
      {
        workshopDesigner: {
          layoutB,
          blockStyleOverrides,
          updatedAt: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await adminDb.collection('invitation_reviews').add({
      inviteId,
      action: 'designer_updated',
      notes: 'Workshop designer settings updated by admin.',
      createdAt: FieldValue.serverTimestamp(),
      createdBy: adminUid,
      actorRole: 'admin',
    })

    return NextResponse.json({ ok: true, layoutB, blockStyleOverrides })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to save designer config' }, { status })
  }
}

