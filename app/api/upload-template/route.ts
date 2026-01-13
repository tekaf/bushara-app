import { NextRequest, NextResponse } from 'next/server'
import { getAdminBucket } from '@/lib/firebase/admin'

export async function POST(request: NextRequest) {
  try {
    console.log('📤 [API] Starting upload request...')
    
    const formData = await request.formData()
    const file = formData.get('file') as File
    const templateId = formData.get('templateId') as string
    const fileExtension = formData.get('fileExtension') as string
    const isThumbnail = formData.get('isThumbnail') === 'true'

    console.log('📤 [API] Request data:', {
      templateId,
      fileExtension,
      isThumbnail,
      fileName: file?.name,
      fileSize: file?.size,
      fileType: file?.type,
    })

    if (!file || !templateId || !fileExtension) {
      console.error('❌ [API] Missing required fields')
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const fileName = isThumbnail 
      ? `templates/${templateId}/thumb.${fileExtension}`
      : `templates/${templateId}/background.${fileExtension}`

    console.log('📤 [API] File path:', fileName)
    console.log('📤 [API] Buffer size:', buffer.length, 'bytes')

    // Use Firebase Admin SDK (bypasses all security rules)
    const bucket = getAdminBucket()
    
    if (!bucket) {
      console.error('❌ [API] Firebase Admin SDK not configured')
      return NextResponse.json(
        { 
          error: 'Firebase Admin SDK not configured. Please set FIREBASE_SERVICE_ACCOUNT_KEY in .env.local',
          hint: 'Get service account key from Firebase Console → Project Settings → Service Accounts'
        },
        { status: 500 }
      )
    }

    console.log('📤 [API] Bucket name:', bucket.name)
    console.log('📤 [API] BEFORE UPLOAD - Starting file upload...')

    try {
      const fileRef = bucket.file(fileName)
      
      // Save file using bucket.save()
      await fileRef.save(buffer, {
        metadata: {
          contentType: file.type || 'application/octet-stream',
        },
      })

      console.log('✅ [API] AFTER UPLOAD - File saved successfully')

      // Make file publicly accessible
      try {
        await fileRef.makePublic()
        console.log('✅ [API] File made public')
      } catch (publicError: any) {
        // File might already be public, or we don't have permission - that's okay
        console.warn('⚠️ [API] Could not make file public (may already be public):', publicError.message)
      }

      // Get public URL
      const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`
      const storagePath = fileName
      
      console.log('📤 [API] BEFORE RESPONSE - Preparing response...')
      console.log('📤 [API] Download URL:', fileUrl)
      console.log('📤 [API] Storage Path:', storagePath)
      
      const response = {
        url: fileUrl,
        downloadUrl: fileUrl,
        storagePath: storagePath,
        bucket: bucket.name,
      }
      
      console.log('✅ [API] Returning response:', response)
      return NextResponse.json(response)
    } catch (adminError: any) {
      console.error('❌ [API] Admin SDK upload failed:', {
        message: adminError.message,
        code: adminError.code,
        stack: adminError.stack,
      })
      return NextResponse.json(
        { 
          error: `Upload failed: ${adminError.message}`,
          code: adminError.code,
          hint: 'Check Firebase Admin SDK configuration and service account permissions'
        },
        { status: 500 }
      )
    }
  } catch (error: any) {
    console.error('❌ [API] Error uploading file:', {
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
