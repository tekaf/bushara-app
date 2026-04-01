import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    const templateId = request.nextUrl.searchParams.get('templateId') || ''
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!templateId) return NextResponse.json({ error: 'Missing templateId' }, { status: 400 })

    const app = getAdminApp()
    const adminDb = getAdminFirestore()
    if (!app || !adminDb) {
      // Local/dev fallback: keep flow working even without Admin credentials.
      return NextResponse.json({ draft: null, mode: 'local' })
    }

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const draftId = `${decoded.uid}_${templateId}`
    const snap = await adminDb.collection('inviteDrafts').doc(draftId).get()
    if (!snap.exists) return NextResponse.json({ draft: null })

    const data = snap.data() as any
    return NextResponse.json({
      draft: {
        currentStep: data?.currentStep || 1,
        formData: data?.formData || {},
        updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() || null,
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to load invite draft' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const app = getAdminApp()
    const adminDb = getAdminFirestore()
    if (!app || !adminDb) {
      // Local/dev fallback: allow client-side draft persistence only.
      return NextResponse.json({ ok: true, mode: 'local', updatedAt: new Date().toISOString() })
    }

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await request.json()
    const templateId = body?.templateId as string
    if (!templateId) {
      return NextResponse.json({ error: 'Missing templateId' }, { status: 400 })
    }

    const draftId = `${decoded.uid}_${templateId}`
    const docRef = adminDb.collection('inviteDrafts').doc(draftId)
    const docSnap = await docRef.get()
    const now = new Date()
    await docRef.set(
      {
        ownerId: decoded.uid,
        templateId,
        currentStep: Number(body?.currentStep) || 1,
        formData: body?.formData || {},
        updatedAt: now,
        ...(docSnap.exists ? {} : { createdAt: now }),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, updatedAt: now.toISOString() })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to save invite draft' },
      { status: 500 }
    )
  }
}
