import { NextRequest, NextResponse } from 'next/server'
import { getAdminBucket } from '@/lib/firebase/admin'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const templateId = formData.get('templateId') as string
    const fileExtension = formData.get('fileExtension') as string
    const isThumbnail = formData.get('isThumbnail') === 'true'

    if (!file || !templateId || !fileExtension) {
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

    // Use Firebase Admin SDK (bypasses all security rules)
    const bucket = getAdminBucket()
    
    if (!bucket) {
      return NextResponse.json(
        { 
          error: 'Firebase Admin SDK not configured. Please set FIREBASE_SERVICE_ACCOUNT_KEY in .env.local',
          hint: 'Get service account key from Firebase Console → Project Settings → Service Accounts'
        },
        { status: 500 }
      )
    }

    try {
      const fileRef = bucket.file(fileName)
      
      // Save file using bucket.save()
      await fileRef.save(buffer, {
        metadata: {
          contentType: file.type || 'application/octet-stream',
        },
      })

      // Make file publicly accessible
      try {
        await fileRef.makePublic()
      } catch (publicError: any) {
        // File might already be public, or we don't have permission - that's okay
        console.warn('Could not make file public (may already be public):', publicError.message)
      }

      // Get public URL
      const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`
      
      console.log('✅ File uploaded successfully using Admin SDK:', fileUrl)
      return NextResponse.json({ url: fileUrl })
    } catch (adminError: any) {
      console.error('❌ Admin SDK upload failed:', adminError.message, adminError.code)
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
    console.error('❌ Error uploading file:', error)
    return NextResponse.json(
      { 
        error: error.message || 'Failed to upload file',
        code: error.code 
      },
      { status: 500 }
    )
  }
}
