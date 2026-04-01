import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const app = getAdminApp()
    const adminDb = getAdminFirestore()
    if (!app || !adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const snap = await adminDb.collection('inviteDrafts').where('ownerId', '==', decoded.uid).limit(200).get()

    const drafts = snap.docs
      .map((d) => {
        const data = d.data() as any
        return {
          id: d.id,
          templateId: String(data?.templateId || ''),
          currentStep: Number(data?.currentStep || 1),
          formData: data?.formData || {},
          updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() || null,
        }
      })
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())

    return NextResponse.json({ drafts })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Failed to load invite drafts' }, { status: 500 })
  }
}

