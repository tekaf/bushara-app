import { NextRequest, NextResponse } from 'next/server'
import { getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import { convertPdfUrlToPng, createThumbnailFromPngBuffer } from '@/lib/pdf/toPng'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const startedAt = Date.now()
    console.log('📤 [API][UPLOAD_TEMPLATE] Starting upload request...')
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    const templateId = formData.get('templateId') as string
    const templateName = (formData.get('name') as string) || ''
    const templateType = (formData.get('type') as string) || ''

    console.log('📤 [API][UPLOAD_TEMPLATE] Request data:', {
      templateId,
      templateName,
      templateType,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
    })

    if (!file || !templateId || !templateName || !templateType) {
      console.error('❌ [API][UPLOAD_TEMPLATE] Missing required fields')
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    if (file.type !== 'application/pdf') {
      return NextResponse.json(
        { error: 'Only PDF uploads are allowed for template backgrounds' },
        { status: 400 }
      )
    }

    if (!['A', 'B', 'C'].includes(templateType)) {
      return NextResponse.json(
        { error: 'Invalid template type. Expected A, B, or C.' },
        { status: 400 }
      )
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const pdfBuffer = Buffer.from(arrayBuffer)

    // Use Firebase Admin SDK (bypasses all security rules)
    const bucket = getAdminBucket()
    
    if (!bucket) {
      console.error('❌ [API][UPLOAD_TEMPLATE] Firebase Admin SDK not configured')
      return NextResponse.json(
        { 
          error: 'Firebase Admin SDK not configured. Please set FIREBASE_SERVICE_ACCOUNT_KEY in .env.local',
          hint: 'Get service account key from Firebase Console → Project Settings → Service Accounts'
        },
        { status: 500 }
      )
    }

    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Firestore Admin SDK not configured' },
        { status: 500 }
      )
    }

    try {
      const pdfPath = `templates/${templateId}/source.pdf`
      const pngPath = `templates/${templateId}/background.png`
      const thumbPath = `templates/${templateId}/thumb.jpg`

      const pdfRef = bucket.file(pdfPath)
      await pdfRef.save(pdfBuffer, {
        metadata: {
          contentType: 'application/pdf',
        },
      })
      console.log('✅ [API][UPLOAD_TEMPLATE] PDF uploaded:', pdfPath)

      try {
        await pdfRef.makePublic()
      } catch (publicError: any) {
        console.warn('⚠️ [API][UPLOAD_TEMPLATE] Could not make PDF public:', publicError.message)
      }

      const [signedPdfUrl] = await pdfRef.getSignedUrl({
        action: 'read',
        expires: Date.now() + 15 * 60 * 1000,
      })

      const conversion = await convertPdfUrlToPng(signedPdfUrl)
      console.log(
        `✅ [API][UPLOAD_TEMPLATE] Converted PDF -> PNG ${conversion.dimensions.width}x${conversion.dimensions.height} in ${conversion.elapsedMs}ms`
      )

      const pngRef = bucket.file(pngPath)
      await pngRef.save(conversion.pngBuffer, {
        metadata: { contentType: 'image/png' },
      })

      const thumb = await createThumbnailFromPngBuffer(conversion.pngBuffer)
      const thumbRef = bucket.file(thumbPath)
      await thumbRef.save(thumb.thumbBuffer, {
        metadata: { contentType: 'image/jpeg' },
      })

      try {
        await pngRef.makePublic()
      } catch (publicError: any) {
        console.warn('⚠️ [API][UPLOAD_TEMPLATE] Could not make PNG public:', publicError.message)
      }
      try {
        await thumbRef.makePublic()
      } catch (publicError: any) {
        console.warn('⚠️ [API][UPLOAD_TEMPLATE] Could not make thumb public:', publicError.message)
      }

      const backgroundPdfUrl = `https://storage.googleapis.com/${bucket.name}/${pdfPath}`
      const backgroundUrl = `https://storage.googleapis.com/${bucket.name}/${pngPath}`
      const thumbUrl = `https://storage.googleapis.com/${bucket.name}/${thumbPath}`

      const templateRef = adminDb.collection('templates').doc(templateId)
      const templateSnapshot = await templateRef.get()
      const now = new Date()

      await templateRef.set(
        {
          name: templateName,
          type: templateType,
          status: 'published',
          fileType: 'pdf',
          assets: {
            backgroundPdfUrl,
            backgroundUrl,
            thumbUrl,
          },
          updatedAt: now,
          ...(templateSnapshot.exists ? {} : { createdAt: now }),
        },
        { merge: true }
      )

      console.log('✅ [API][UPLOAD_TEMPLATE] Template saved in Firestore:', {
        templateId,
        backgroundPdfUrl,
        backgroundUrl,
        thumbUrl,
        pngDimensions: conversion.dimensions,
        thumbElapsedMs: thumb.elapsedMs,
        totalMs: Date.now() - startedAt,
      })

      return NextResponse.json({
        templateId,
        backgroundPdfUrl,
        backgroundUrl,
        thumbUrl,
        dimensions: conversion.dimensions,
        timings: {
          convertMs: conversion.elapsedMs,
          thumbnailMs: thumb.elapsedMs,
          totalMs: Date.now() - startedAt,
        },
      })
    } catch (adminError: any) {
      console.error('❌ [API][UPLOAD_TEMPLATE] Pipeline failed:', {
        message: adminError.message,
        code: adminError.code,
        stack: adminError.stack,
      })
      return NextResponse.json(
        { 
          error: `PDF upload/convert failed: ${adminError.message}`,
          code: adminError.code,
          hint: 'Check Firebase Admin SDK, PDF file validity, and Playwright/Chromium runtime'
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('❌ [API][UPLOAD_TEMPLATE] Error uploading file:', {
      message: error.message,
      code: error.code,
      stack: error.stack,
    })
    return NextResponse.json(
      { 
        error: error.message || 'Failed to upload file',
        code: error.code 
      },
      { status: 500 }
    )
  }
}
