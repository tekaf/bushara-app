import { NextRequest } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const ADMIN_SDK_USER_ERROR_AR =
  'تعذر تحميل قائمة المراجعة: إعدادات Firebase Admin غير صحيحة على الخادم. أضف مفاتيح FIREBASE_ADMIN_* أو FIREBASE_SERVICE_ACCOUNT_BASE64 في Vercel ثم أعد النشر.'

export type AdminAuthErrorCode =
  | 'missing_token'
  | 'admin_sdk_not_configured'
  | 'token_invalid'
  | 'email_not_allowed'
  | 'unknown'

export type VerifiedAdminContext = {
  uid: string
  email: string
  adminDb: FirebaseFirestore.Firestore
}

export class AdminAuthError extends Error {
  code: AdminAuthErrorCode
  constructor(code: AdminAuthErrorCode, message: string) {
    super(message)
    this.code = code
  }
}

export function isAdminSdkError(message: string | undefined | null) {
  const value = String(message || '').toLowerCase()
  return value.includes('admin sdk not configured') || value.includes('admin_sdk_not_configured')
}

export function adminAuthErrorToResponse(error: unknown) {
  if (error instanceof AdminAuthError) {
    switch (error.code) {
      case 'missing_token':
        return { status: 401, error: 'يجب تسجيل الدخول أولاً.', code: error.code }
      case 'token_invalid':
        return {
          status: 401,
          error:
            'جلسة الدخول غير صالحة أو انتهت. سجّل الخروج ثم ادخل مرة أخرى. تأكد أن Firebase Admin و NEXT_PUBLIC_FIREBASE_PROJECT_ID لنفس المشروع.',
          code: error.code,
        }
      case 'email_not_allowed':
        return {
          status: 403,
          error:
            'بريدك غير مضاف كأدمن على الخادم. أضف بريدك في Vercel: ADMIN_EMAILS و NEXT_PUBLIC_ADMIN_EMAILS ثم أعد النشر.',
          code: error.code,
        }
      case 'admin_sdk_not_configured':
        return { status: 503, error: ADMIN_SDK_USER_ERROR_AR, code: error.code }
      default:
        return { status: 500, error: error.message || 'Unknown admin auth error', code: error.code }
    }
  }

  const message = String((error as Error)?.message || '')
  if (message === 'Unauthorized') {
    return { status: 401, error: 'غير مصرح.', code: 'unknown' as AdminAuthErrorCode }
  }
  if (isAdminSdkError(message)) {
    return { status: 503, error: ADMIN_SDK_USER_ERROR_AR, code: 'admin_sdk_not_configured' as AdminAuthErrorCode }
  }
  return { status: 500, error: message || 'Server error', code: 'unknown' as AdminAuthErrorCode }
}

export async function verifyAdminRequest(request: NextRequest): Promise<VerifiedAdminContext> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''
  if (!token) {
    throw new AdminAuthError('missing_token', 'Missing bearer token')
  }

  const app = getAdminApp()
  const adminDb = getAdminFirestore()
  if (!app || !adminDb) {
    throw new AdminAuthError('admin_sdk_not_configured', 'Admin SDK not configured')
  }

  const auth = getAuth(app)
  let decoded
  try {
    decoded = await auth.verifyIdToken(token)
  } catch (tokenError: any) {
    console.error('[verifyAdmin] verifyIdToken failed:', tokenError?.code || tokenError?.message)
    throw new AdminAuthError('token_invalid', 'Invalid Firebase ID token')
  }

  if (!decoded?.uid) {
    throw new AdminAuthError('token_invalid', 'Token missing uid')
  }

  let email = String(decoded.email || '').trim()
  if (!email) {
    try {
      const userRecord = await auth.getUser(decoded.uid)
      email = String(userRecord.email || '').trim()
    } catch {
      email = ''
    }
  }

  if (!email) {
    throw new AdminAuthError('email_not_allowed', 'No email on Firebase user')
  }

  if (!isAdminEmailServer(email)) {
    console.error('[verifyAdmin] email not in admin allowlist:', email)
    throw new AdminAuthError('email_not_allowed', `Email not allowed: ${email}`)
  }

  return { uid: decoded.uid, email, adminDb }
}
