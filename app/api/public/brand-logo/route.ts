import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  const fallbackUrl = new URL('/favicon.png', request.nextUrl.origin)
  try {
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return NextResponse.redirect(fallbackUrl, { status: 307 })
    }

    const snap = await adminDb.collection('siteSettings').doc('homeAssets').get()
    const data = snap.exists ? (snap.data() as any) : {}
    const brandLogoUrl = String(data?.brandLogoUrl || '').trim()

    if (!brandLogoUrl) {
      return NextResponse.redirect(fallbackUrl, { status: 307 })
    }

    return NextResponse.redirect(brandLogoUrl, { status: 307 })
  } catch {
    return NextResponse.redirect(fallbackUrl, { status: 307 })
  }
}
