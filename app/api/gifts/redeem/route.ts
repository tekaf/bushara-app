import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { createHash } from 'crypto'
import { FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

function hashCode(rawCode: string): string {
  return createHash('sha256').update(rawCode).digest('hex')
}

function normalizeGiftCode(rawCode: string): string {
  return rawCode.replace(/\s+/g, '').trim().toUpperCase()
}

function getRequestKey(request: NextRequest, uid: string): string {
  const ip = (request.headers.get('x-forwarded-for') || 'unknown').split(',')[0].trim()
  return `${uid}:${ip}`
}

async function enforceRateLimit(key: string) {
  const adminDb = getAdminFirestore()
  if (!adminDb) throw new Error('Admin SDK not configured')

  const now = Date.now()
  const windowMs = 60_000
  const maxAttempts = 5
  const rateRef = adminDb.collection('gift_redeem_limits').doc(key)

  await adminDb.runTransaction(async (tx) => {
    const snap = await tx.get(rateRef)
    const data = (snap.data() || {}) as { windowStartMs?: number; count?: number }
    const windowStartMs = Number(data.windowStartMs || 0)
    const count = Number(data.count || 0)
    const sameWindow = now - windowStartMs < windowMs
    const nextCount = sameWindow ? count + 1 : 1

    if (sameWindow && count >= maxAttempts) {
      throw new Error('RATE_LIMITED')
    }

    tx.set(
      rateRef,
      {
        windowStartMs: sameWindow ? windowStartMs : now,
        count: nextCount,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )
  })
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const app = getAdminApp()
    const adminDb = getAdminFirestore()
    if (!app || !adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    await enforceRateLimit(getRequestKey(request, decoded.uid))

    const body = await request.json()
    const inputCode = normalizeGiftCode(String(body?.code || ''))
    if (inputCode.length < 12) {
      return NextResponse.json({ error: 'الكود غير صالح أو مستخدم' }, { status: 400 })
    }

    const codeHash = hashCode(inputCode)
    const matchingSnap = await adminDb
      .collection('gift_codes')
      .where('codeHash', '==', codeHash)
      .limit(1)
      .get()

    if (matchingSnap.empty) {
      return NextResponse.json({ error: 'الكود غير صالح أو مستخدم' }, { status: 400 })
    }

    const giftRef = matchingSnap.docs[0].ref
    const giftId = matchingSnap.docs[0].id

    let packageSize = 0
    let packagePrice = 0

    await adminDb.runTransaction(async (tx) => {
      const giftSnap = await tx.get(giftRef)
      const giftData = (giftSnap.data() || {}) as {
        paymentStatus?: string
        status?: string
        redeemedAt?: Timestamp | null
        expiresAt?: Timestamp | null
        packageSize?: number
        packagePrice?: number
      }

      if (!giftSnap.exists) throw new Error('INVALID_OR_USED')
      if (giftData.paymentStatus !== 'paid') throw new Error('INVALID_OR_USED')
      if (giftData.status !== 'active') throw new Error('INVALID_OR_USED')
      if (giftData.redeemedAt) throw new Error('ALREADY_USED')
      if (giftData.expiresAt && giftData.expiresAt.toMillis() < Date.now()) throw new Error('EXPIRED')

      packageSize = Number(giftData.packageSize || 0)
      packagePrice = Number(giftData.packagePrice || 0)
      if (!packageSize || !packagePrice) throw new Error('INVALID_OR_USED')

      const creditRef = adminDb
        .collection('users')
        .doc(decoded.uid)
        .collection('package_credits')
        .doc()

      tx.set(giftRef, {
        redeemedAt: FieldValue.serverTimestamp(),
        redeemedByUid: decoded.uid,
        status: 'redeemed',
        updatedAt: FieldValue.serverTimestamp(),
      })

      tx.set(creditRef, {
        source: 'gift',
        packageSize,
        packagePrice,
        remaining: packageSize,
        giftId,
        status: 'paid',
        createdAt: FieldValue.serverTimestamp(),
        linkedInvitationId: null,
      })
    })

    return NextResponse.json({
      ok: true,
      message: 'تم تفعيل الباقة بنجاح',
      packageSize,
      packagePrice,
    })
  } catch (error: any) {
    if (error?.message === 'RATE_LIMITED') {
      return NextResponse.json(
        { error: 'تم تجاوز عدد المحاولات. حاول مرة أخرى بعد دقيقة.' },
        { status: 429 }
      )
    }
    if (error?.message === 'ALREADY_USED') {
      return NextResponse.json({ error: 'هذا الكود تم استخدامه' }, { status: 400 })
    }
    if (error?.message === 'EXPIRED') {
      return NextResponse.json({ error: 'انتهت صلاحية الكود' }, { status: 400 })
    }
    if (error?.message === 'INVALID_OR_USED') {
      return NextResponse.json({ error: 'الكود غير صالح أو مستخدم' }, { status: 400 })
    }
    return NextResponse.json({ error: 'تعذر تفعيل الكود حالياً' }, { status: 500 })
  }
}

