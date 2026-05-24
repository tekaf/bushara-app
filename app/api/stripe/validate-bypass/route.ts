import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

async function verifyUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')
  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')
  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  return decoded.uid
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i += 1) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

export async function POST(request: NextRequest) {
  try {
    await verifyUser(request)
    const body = await request.json().catch(() => ({}))
    const submittedCode = String(body?.code || '').trim()
    const expectedCode = String(process.env.PAYMENT_BYPASS_CODE || '').trim()
    if (!expectedCode) {
      return NextResponse.json({ error: 'Bypass code is not configured' }, { status: 503 })
    }
    if (!submittedCode || !safeEqual(submittedCode, expectedCode)) {
      return NextResponse.json({ error: 'Invalid bypass code' }, { status: 403 })
    }
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed validating bypass code' }, { status })
  }
}
