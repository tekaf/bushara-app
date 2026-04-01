import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type PreviousExampleRow = {
  id: string
  title: string
  assets?: {
    sourceUrl?: string
    previewUrl?: string
    thumbUrl?: string
  }
  createdAt?: number
}

export async function GET() {
  try {
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return NextResponse.json({ items: [] })
    }

    const snap = await adminDb
      .collection('previousExamples')
      .where('status', '==', 'published')
      .get()

    const rows: PreviousExampleRow[] = snap.docs
      .map((doc) => {
        const data = doc.data() as any
        return {
          id: doc.id,
          title: data?.title || 'دعوة سابقة',
          assets: data?.assets || {},
          createdAt: data?.createdAt?.toMillis?.() || 0,
        }
      })
      .sort((a, b) => b.createdAt! - a.createdAt!)

    return NextResponse.json({ items: rows })
  } catch (error: any) {
    console.error('❌ [API][PUBLIC][PREVIOUS_EXAMPLES] failed:', error)
    return NextResponse.json({ items: [] })
  }
}
