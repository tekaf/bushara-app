import { NextRequest, NextResponse } from 'next/server'
import { initializeApp, getApps, cert } from 'firebase-admin/app'
import { getStorage } from 'firebase-admin/storage'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage as clientStorage } from '@/lib/firebase/config'

// Initialize Firebase Admin (server-side, bypasses security rules)
let adminApp
try {
  if (getApps().length === 0) {
    // Try to use service account credentials if available
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      : null

    if (serviceAccount) {
      adminApp = initializeApp({
        credential: cert(serviceAccount),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
    } else {
      // Use default credentials (works on Vercel/Cloud Run)
      adminApp = initializeApp({
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
    }
  } else {
    adminApp = getApps()[0]
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error)
  // Fallback: will use client SDK
}

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

    // Try Firebase Admin Storage first (bypasses security rules)
    if (adminApp) {
      try {
        const bucket = getStorage(adminApp).bucket()
        const fileName = isThumbnail 
          ? `templates/${templateId}/thumb.${fileExtension}`
          : `templates/${templateId}/background.${fileExtension}`
        
        const fileRef = bucket.file(fileName)
        
        await fileRef.save(buffer, {
          metadata: {
            contentType: file.type,
          },
        })

        // Make file publicly accessible
        await fileRef.makePublic()

        // Get public URL
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`

        return NextResponse.json({ url: fileUrl })
      } catch (adminError: any) {
        console.error('Admin SDK upload failed, trying client SDK:', adminError)
        // Fall through to client SDK
      }
    }

    // Fallback: Use client SDK (requires proper security rules)
    const fileName = isThumbnail 
      ? `templates/${templateId}/thumb.${fileExtension}`
      : `templates/${templateId}/background.${fileExtension}`
    
    const fileRef = ref(clientStorage, fileName)
    const blob = new Blob([buffer], { type: file.type })
    await uploadBytes(fileRef, blob)
    const fileUrl = await getDownloadURL(fileRef)

    return NextResponse.json({ url: fileUrl })
  } catch (error: any) {
    console.error('Error uploading file:', error)
    
    // Fallback: try client-side upload if admin fails
    if (error.code === 'app/no-app' || !adminApp) {
      return NextResponse.json(
        { error: 'Server configuration error. Please check Firebase Admin setup.' },
        { status: 500 }
      )
    }
    
    return NextResponse.json(
      { error: error.message || 'Failed to upload file' },
      { status: 500 }
    )
  }
}
