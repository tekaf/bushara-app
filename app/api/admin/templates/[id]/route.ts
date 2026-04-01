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

    const templateId = params?.id
    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const templateRef = adminDb.collection('templates').doc(templateId)
    const templateSnapshot = await templateRef.get()
    if (!templateSnapshot.exists) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const [files] = await bucket.getFiles({ prefix: `templates/${templateId}/` })
    let deletedFiles = 0
    for (const file of files) {
      try {
        await file.delete({ ignoreNotFound: true })
        deletedFiles += 1
      } catch (e) {
        console.warn('⚠️ [API][ADMIN][TEMPLATES][DELETE] Failed deleting file:', file.name)
      }
    }

    const rendersSnap = await adminDb
      .collection('renders')
      .where('templateId', '==', templateId)
      .get()

    let deletedRenders = 0
    if (!rendersSnap.empty) {
      const batch = adminDb.batch()
      rendersSnap.docs.forEach((doc) => {
        batch.delete(doc.ref)
        deletedRenders += 1
      })
      await batch.commit()
    }

    await templateRef.delete()

    return NextResponse.json({
      ok: true,
      templateId,
      deletedFiles,
      deletedRenders,
    })
  } catch (error: any) {
    console.error('❌ [API][ADMIN][TEMPLATES][DELETE] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to delete template' },
      { status: 500 }
    )
  }
}
