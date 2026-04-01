import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import sharp from 'sharp'
import { getAdminApp, getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { convertPdfUrlToPng, createThumbnailFromPngBuffer } from '@/lib/pdf/toPng'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const app = getAdminApp()
    const adminDb = getAdminFirestore()
    if (!app || !adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid || !isAdminEmailServer(decoded.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const snap = await adminDb
      .collection('previousExamples')
      .where('status', '==', 'published')
      .get()

    const items = snap.docs
      .map((doc) => {
        const data = doc.data() as any
        return {
          id: doc.id,
          title: data?.title || 'دعوة سابقة',
          status: data?.status || 'published',
          sourceType: data?.sourceType || 'image',
          assets: data?.assets || {},
          createdAt: data?.createdAt?.toMillis?.() || 0,
          updatedAt: data?.updatedAt?.toMillis?.() || 0,
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt)

    return NextResponse.json({ items })
  } catch (error: any) {
    console.error('❌ [API][PREVIOUS_EXAMPLES][LIST] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to load previous examples' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
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

    const startedAt = Date.now()
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const titleRaw = (formData.get('title') as string) || ''
    const title = titleRaw.trim()

    if (!file) {
      return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    }
    if (!title) {
      return NextResponse.json({ error: 'Missing title' }, { status: 400 })
    }

    const isPdf = file.type === 'application/pdf'
    const isImage = file.type.startsWith('image/')
    if (!isPdf && !isImage) {
      return NextResponse.json(
        { error: 'Only PDF or image files are allowed' },
        { status: 400 }
      )
    }

    const exampleRef = adminDb.collection('previousExamples').doc()
    const exampleId = exampleRef.id
    const sourceExt = isPdf ? 'pdf' : file.name.split('.').pop() || 'png'
    const sourcePath = `previous-examples/${exampleId}/source.${sourceExt}`
    const previewPath = `previous-examples/${exampleId}/preview.png`
    const thumbPath = `previous-examples/${exampleId}/thumb.jpg`

    const sourceBuffer = Buffer.from(await file.arrayBuffer())
    const sourceRef = bucket.file(sourcePath)
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
      console.log(
        `✅ [API][PREVIOUS_EXAMPLES][UPLOAD] PDF converted ${conversion.dimensions.width}x${conversion.dimensions.height} in ${conversion.elapsedMs}ms`
      )
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
      console.warn('⚠️ [API][PREVIOUS_EXAMPLES][UPLOAD] makePublic warning:', error)
    }

    const sourceUrl = `https://storage.googleapis.com/${bucket.name}/${sourcePath}`
    const previewUrl = `https://storage.googleapis.com/${bucket.name}/${previewPath}`
    const thumbUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`
    const now = new Date()

    await exampleRef.set({
      title,
      status: 'published',
      sourceType: isPdf ? 'pdf' : 'image',
      assets: {
        sourceUrl,
        previewUrl,
        thumbUrl,
      },
      createdAt: now,
      updatedAt: now,
    })

    console.log('✅ [API][PREVIOUS_EXAMPLES][UPLOAD] done:', {
      exampleId,
      sourceUrl,
      previewUrl,
      thumbUrl,
      totalMs: Date.now() - startedAt,
    })

    return NextResponse.json({
      ok: true,
      id: exampleId,
      title,
      sourceType: isPdf ? 'pdf' : 'image',
      assets: { sourceUrl, previewUrl, thumbUrl },
    })
  } catch (error: any) {
    console.error('❌ [API][PREVIOUS_EXAMPLES][UPLOAD] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to upload previous example' },
      { status: 500 }
    )
  }
}
