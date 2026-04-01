import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const runtime = 'nodejs'

const DOC_ID = 'homeAssets'
const COLLECTION_ID = 'siteSettings'

type AssetKind = 'hero' | 'previous' | 'brandLogo'

function normalizeKind(value: string): AssetKind | null {
  if (value === 'hero') return 'hero'
  if (value === 'previous') return 'previous'
  if (value === 'brandLogo') return 'brandLogo'
  return null
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')
  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')
  const decoded = await getAuth(app).verifyIdToken(token)
  if (!decoded?.uid || !isAdminEmailServer(decoded.email)) throw new Error('Unauthorized')
  return decoded
}

export async function GET(request: NextRequest) {
  try {
    await verifyAdmin(request)
    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    const docSnap = await adminDb.collection(COLLECTION_ID).doc(DOC_ID).get()
    const data = docSnap.exists ? (docSnap.data() as any) : {}
    return NextResponse.json({
      heroImageUrl: data?.heroImageUrl || '',
      previousInviteImageUrl: data?.previousInviteImageUrl || '',
      brandLogoUrl: data?.brandLogoUrl || '',
      updatedAt: data?.updatedAt?.toDate?.()?.toISOString?.() || null,
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to load home assets' }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const decoded = await verifyAdmin(request)
    const adminDb = getAdminFirestore()
    const bucket = getAdminBucket()
    if (!adminDb || !bucket) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const kindRaw = String(formData.get('kind') || '')
    const kind = normalizeKind(kindRaw)
    if (!kind) return NextResponse.json({ error: 'Invalid kind' }, { status: 400 })
    if (!file) return NextResponse.json({ error: 'Missing file' }, { status: 400 })
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
    }
    if (kind === 'brandLogo' && file.type !== 'image/png') {
      return NextResponse.json({ error: 'Logo must be a PNG image' }, { status: 400 })
    }

    const ext = (file.name.split('.').pop() || 'png').toLowerCase()
    const ts = Date.now()
    const filePath = `site-assets/home/${kind}/${ts}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const fileRef = bucket.file(filePath)

    // Save original bytes to preserve maximum quality.
    await fileRef.save(buffer, {
      metadata: {
        contentType: file.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    })
    try {
      await fileRef.makePublic()
    } catch (error) {
      console.warn('⚠️ [API][HOME_ASSETS] makePublic warning:', error)
    }

    const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`
    const updates: Record<string, any> = {
      updatedAt: new Date(),
      updatedBy: decoded.uid,
    }
    if (kind === 'hero') updates.heroImageUrl = fileUrl
    if (kind === 'previous') updates.previousInviteImageUrl = fileUrl
    if (kind === 'brandLogo') updates.brandLogoUrl = fileUrl
    await adminDb.collection(COLLECTION_ID).doc(DOC_ID).set(updates, { merge: true })

    return NextResponse.json({ ok: true, kind, url: fileUrl })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to upload home asset' }, { status })
  }
}

