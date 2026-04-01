import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const runtime = 'nodejs'

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const app = getAdminApp()
    const adminDb = getAdminFirestore()
    const bucket = getAdminBucket()
    if (!app || !adminDb || !bucket) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid || !isAdminEmailServer(decoded.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const id = params?.id
    if (!id) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 })
    }

    const docRef = adminDb.collection('previousExamples').doc(id)
    const snapshot = await docRef.get()
    if (!snapshot.exists) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const [files] = await bucket.getFiles({ prefix: `previous-examples/${id}/` })
    for (const file of files) {
      try {
        await file.delete({ ignoreNotFound: true })
      } catch (error) {
        console.warn('⚠️ [API][PREVIOUS_EXAMPLES][DELETE] file delete warning:', file.name, error)
      }
    }

    await docRef.delete()
    return NextResponse.json({ ok: true, id })
  } catch (error: any) {
    console.error('❌ [API][PREVIOUS_EXAMPLES][DELETE] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to delete previous example' },
      { status: 500 }
    )
  }
}
