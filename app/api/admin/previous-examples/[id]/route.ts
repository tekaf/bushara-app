import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import sharp from 'sharp'
import { getAdminApp, getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { convertPdfUrlToPng, createThumbnailFromPngBuffer } from '@/lib/pdf/toPng'

export const runtime = 'nodejs'

export async function PUT(
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

    const formData = await request.formData()
    const titleRaw = (formData.get('title') as string) || ''
    const sortOrderRaw = (formData.get('sortOrder') as string) || ''
    const statusRaw = String(formData.get('status') || '').trim().toLowerCase()
    const file = formData.get('file') as File | null

    const title = titleRaw.trim()
    const sortOrder = Number(sortOrderRaw)
    const updates: Record<string, any> = { updatedAt: new Date() }

    if (title) updates.title = title
    if (Number.isFinite(sortOrder)) updates.sortOrder = sortOrder
    if (statusRaw === 'draft' || statusRaw === 'published') updates.status = statusRaw

    if (file) {
      const isPdf = file.type === 'application/pdf'
      const isImage = file.type.startsWith('image/')
      if (!isPdf && !isImage) {
        return NextResponse.json({ error: 'Only PDF or image files are allowed' }, { status: 400 })
      }

      const [existingFiles] = await bucket.getFiles({ prefix: `previous-examples/${id}/` })
      for (const oldFile of existingFiles) {
        try {
          await oldFile.delete({ ignoreNotFound: true })
        } catch (error) {
          console.warn('⚠️ [API][PREVIOUS_EXAMPLES][PUT] old file delete warning:', oldFile.name, error)
        }
      }

      const sourceExt = isPdf ? 'pdf' : file.name.split('.').pop() || 'png'
      const sourcePath = `previous-examples/${id}/source.${sourceExt}`
      const previewPath = `previous-examples/${id}/preview.png`
      const thumbPath = `previous-examples/${id}/thumb.jpg`
      const sourceRef = bucket.file(sourcePath)
      const sourceBuffer = Buffer.from(await file.arrayBuffer())

      await sourceRef.save(sourceBuffer, {
        metadata: {
          contentType: isPdf ? 'application/pdf' : file.type || 'application/octet-stream',
        },
      })

      let previewBuffer: Buffer
      if (isPdf) {
        const [signedPdfUrl] = await sourceRef.getSignedUrl({
          action: 'read',
          expires: Date.now() + 15 * 60 * 1000,
        })
        const conversion = await convertPdfUrlToPng(signedPdfUrl)
        previewBuffer = conversion.pngBuffer
      } else {
        previewBuffer = await sharp(sourceBuffer)
          .resize(3240, 5760, { fit: 'cover', position: 'centre' })
          .png({ compressionLevel: 9 })
          .toBuffer()
      }

      const previewRef = bucket.file(previewPath)
      await previewRef.save(previewBuffer, {
        metadata: { contentType: 'image/png' },
      })

      const thumb = await createThumbnailFromPngBuffer(previewBuffer)
      const thumbRef = bucket.file(thumbPath)
      await thumbRef.save(thumb.thumbBuffer, {
        metadata: { contentType: 'image/jpeg' },
      })

      try {
        await sourceRef.makePublic()
        await previewRef.makePublic()
        await thumbRef.makePublic()
      } catch (error) {
        console.warn('⚠️ [API][PREVIOUS_EXAMPLES][PUT] makePublic warning:', error)
      }

      updates.sourceType = isPdf ? 'pdf' : 'image'
      updates.assets = {
        sourceUrl: `https://storage.googleapis.com/${bucket.name}/${sourcePath}`,
        previewUrl: `https://storage.googleapis.com/${bucket.name}/${previewPath}`,
        thumbUrl: `https://storage.googleapis.com/${bucket.name}/${thumbPath}`,
      }
    }

    if (!Object.keys(updates).length) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    await docRef.set(updates, { merge: true })
    return NextResponse.json({ ok: true, id })
  } catch (error: any) {
    console.error('❌ [API][PREVIOUS_EXAMPLES][PUT] failed:', error)
    return NextResponse.json({ error: error?.message || 'Failed to update previous example' }, { status: 500 })
  }
}

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
