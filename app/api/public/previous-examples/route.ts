import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

type PreviousExampleRow = {
  id: string
  title: string
  sortOrder?: number
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
      console.error('❌ [API][PUBLIC][PREVIOUS_EXAMPLES] admin firestore unavailable')
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
          sortOrder: Number.isFinite(Number(data?.sortOrder)) ? Number(data.sortOrder) : 9999,
          assets: data?.assets || {},
          createdAt: data?.createdAt?.toMillis?.() || 0,
        }
      })
      .sort((a, b) => {
        const orderA = Number.isFinite(a.sortOrder) ? Number(a.sortOrder) : 9999
        const orderB = Number.isFinite(b.sortOrder) ? Number(b.sortOrder) : 9999
        if (orderA !== orderB) return orderA - orderB
        return (b.createdAt || 0) - (a.createdAt || 0)
      })

    const diagnostics = rows.map((row) => {
      const previewUrl = row.assets?.previewUrl || row.assets?.thumbUrl || ''
      return {
        id: row.id,
        title: row.title,
        previewUrl,
        startsWithHttp: previewUrl.startsWith('http://') || previewUrl.startsWith('https://'),
        startsWithSlash: previewUrl.startsWith('/'),
      }
    })

    console.log('✅ [API][PUBLIC][PREVIOUS_EXAMPLES] fetched:', {
      count: rows.length,
      isZero: rows.length === 0,
      diagnostics,
    })

    if (!rows.length) {
      console.warn('⚠️ [API][PUBLIC][PREVIOUS_EXAMPLES] query returned zero published rows')
    }

    return NextResponse.json({ items: rows })
  } catch (error: any) {
    console.error('❌ [API][PUBLIC][PREVIOUS_EXAMPLES] failed:', error)
    return NextResponse.json({ items: [] })
  }
}
