import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return NextResponse.json({
        heroImageUrl: '/home/hero-invitation.webp',
        contactPreviewImageUrl: '/home/contact-preview.webp',
      })
    }

    const snap = await adminDb.collection('homeAssets').doc('landing').get()
    const data = snap.exists ? (snap.data() as any) : {}

    return NextResponse.json({
      heroImageUrl: String(data?.heroImageUrl || '/home/hero-invitation.webp'),
      contactPreviewImageUrl: String(data?.contactPreviewImageUrl || '/home/contact-preview.webp'),
    })
  } catch (error: any) {
    console.error('❌ [API][PUBLIC][HOME_ASSETS] failed:', error)
    return NextResponse.json({
      heroImageUrl: '/home/hero-invitation.webp',
      contactPreviewImageUrl: '/home/contact-preview.webp',
    })
  }
}

