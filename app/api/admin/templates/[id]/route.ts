import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const runtime = 'nodejs'

function isTemplateType(value: string): value is 'A' | 'B' | 'C' {
  return value === 'A' || value === 'B' || value === 'C'
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return { ok: false as const, status: 401, message: 'Unauthorized' }

  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  if (!app || !adminDb) return { ok: false as const, status: 500, message: 'Admin SDK not configured' }

  const decoded = await getAuth(app).verifyIdToken(token)
  if (!decoded?.uid || !isAdminEmailServer(decoded.email)) {
    return { ok: false as const, status: 401, message: 'Unauthorized' }
  }

  return { ok: true as const, adminDb }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const adminCheck = await verifyAdmin(request)
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status })
    }
    const adminDb = adminCheck.adminDb
    const bucket = getAdminBucket()
    if (!bucket) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
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

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const adminCheck = await verifyAdmin(request)
    if (!adminCheck.ok) {
      return NextResponse.json({ error: adminCheck.message }, { status: adminCheck.status })
    }
    const adminDb = adminCheck.adminDb

    const templateId = String(params?.id || '').trim()
    if (!templateId) {
      return NextResponse.json({ error: 'Template ID is required' }, { status: 400 })
    }

    const body = await request.json().catch(() => ({}))
    const nextType = String(body?.type || '').trim().toUpperCase()
    if (!isTemplateType(nextType)) {
      return NextResponse.json({ error: 'Invalid template type. Expected A, B, or C.' }, { status: 400 })
    }

    const templateRef = adminDb.collection('templates').doc(templateId)
    const templateSnapshot = await templateRef.get()
    if (!templateSnapshot.exists) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    await templateRef.set(
      {
        type: nextType,
        updatedAt: new Date(),
      },
      { merge: true }
    )

    return NextResponse.json({
      ok: true,
      templateId,
      type: nextType,
    })
  } catch (error: any) {
    console.error('❌ [API][ADMIN][TEMPLATES][PATCH] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to update template type' },
      { status: 500 }
    )
  }
}
