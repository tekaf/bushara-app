import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { generateFontFaces } from '@/lib/render/fonts'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const app = getAdminApp()
    if (!app) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid || !isAdminEmailServer(decoded.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const css = await generateFontFaces()
    return NextResponse.json({ ok: true, css })
  } catch (error: any) {
    console.error('❌ [API][ADMIN][FONTS][CSS] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to generate fonts css' },
      { status: 500 }
    )
  }
}

