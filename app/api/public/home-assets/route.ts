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
        heroImageUrl: '',
        previousInviteImageUrl: '',
        brandLogoUrl: '',
      })
    }
    const snap = await adminDb.collection('siteSettings').doc('homeAssets').get()
    const data = snap.exists ? (snap.data() as any) : {}
    return NextResponse.json({
      heroImageUrl: data?.heroImageUrl || '',
      previousInviteImageUrl: data?.previousInviteImageUrl || '',
      brandLogoUrl: data?.brandLogoUrl || '',
    })
  } catch (error: any) {
    console.error('❌ [API][PUBLIC][HOME_ASSETS] failed:', error)
    return NextResponse.json({
      heroImageUrl: '',
      previousInviteImageUrl: '',
      brandLogoUrl: '',
    })
  }
}

