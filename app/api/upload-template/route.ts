import { NextRequest, NextResponse } from 'next/server'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '@/lib/firebase/config'

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const templateId = formData.get('templateId') as string
    const fileExtension = formData.get('fileExtension') as string

    if (!file || !templateId || !fileExtension) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    // Convert File to Blob
    const arrayBuffer = await file.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: file.type })

    // Upload to Firebase Storage
    const fileRef = ref(storage, `templates/${templateId}/background.${fileExtension}`)
    await uploadBytes(fileRef, blob)
    const fileUrl = await getDownloadURL(fileRef)

    return NextResponse.json({ url: fileUrl })
  } catch (error: any) {
    console.error('Error uploading file:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to upload file' },
      { status: 500 }
    )
  }
}
