import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeAssetUrl(value?: string): string {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value
  }
  return `/${value}`
}

type PreviousExampleRow = {
  id: string
  title: string
  sortOrder?: number
  imageUrl?: string
  previewUrl?: string
  thumbUrl?: string
  url?: string
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

    const collectionName = 'previousExamples'
    const snap = await adminDb.collection(collectionName).get()
    const docs = snap.docs

    const rows: PreviousExampleRow[] = docs
      .map((doc) => {
        const data = doc.data() as any
        const isPublished =
          String(data?.status || '').trim().toLowerCase() === 'published' ||
          data?.isPublished === true ||
          data?.published === true
        const imageUrl = normalizeAssetUrl(
          data?.imageUrl ||
            data?.previewUrl ||
            data?.thumbUrl ||
            data?.url ||
            data?.assets?.previewUrl ||
            data?.assets?.thumbUrl ||
            data?.assets?.sourceUrl
        )
        return {
          id: doc.id,
          title: data?.title || 'دعوة سابقة',
          sortOrder: Number.isFinite(Number(data?.sortOrder)) ? Number(data.sortOrder) : 9999,
          imageUrl,
          previewUrl: normalizeAssetUrl(data?.previewUrl || data?.assets?.previewUrl),
          thumbUrl: normalizeAssetUrl(data?.thumbUrl || data?.assets?.thumbUrl),
          url: normalizeAssetUrl(data?.url || data?.assets?.sourceUrl),
          assets: {
            sourceUrl: normalizeAssetUrl(data?.assets?.sourceUrl || data?.url),
            previewUrl: normalizeAssetUrl(data?.assets?.previewUrl || data?.previewUrl || data?.imageUrl),
            thumbUrl: normalizeAssetUrl(data?.assets?.thumbUrl || data?.thumbUrl),
          },
          createdAt: data?.createdAt?.toMillis?.() || 0,
          status: String(data?.status || ''),
          isPublished,
        }
      })
      .filter((row: any) => row.isPublished && Boolean(row.imageUrl))
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
        previewUrl: previewUrl || row.imageUrl || '',
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
