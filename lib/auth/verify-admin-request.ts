import { NextRequest } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const ADMIN_SDK_USER_ERROR_AR =
  'تعذر تحميل قائمة المراجعة بسبب مشكلة في إعدادات الخادم. يرجى التحقق من إعدادات Firebase Admin (FIREBASE_SERVICE_ACCOUNT_KEY).'

export type VerifiedAdminContext = {
  uid: string
  email: string
  adminDb: FirebaseFirestore.Firestore
}

export function isAdminSdkError(message: string | undefined | null) {
  const value = String(message || '').toLowerCase()
  return value.includes('admin sdk not configured') || value.includes('admin_sdk_not_configured')
}

export async function verifyAdminRequest(request: NextRequest): Promise<VerifiedAdminContext> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  if (!app || !adminDb) throw new Error('ADMIN_SDK_NOT_CONFIGURED')

  const auth = getAuth(app)
  let decoded
  try {
    decoded = await auth.verifyIdToken(token)
  } catch {
    throw new Error('Unauthorized')
  }

  if (!decoded?.uid) throw new Error('Unauthorized')

  const email = decoded.email || (await auth.getUser(decoded.uid)).email || ''
  if (!isAdminEmailServer(email)) throw new Error('Unauthorized')

  return { uid: decoded.uid, email, adminDb }
}
