import 'server-only'
import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getStorage, Storage } from 'firebase-admin/storage'
import { getFirestore, Firestore } from 'firebase-admin/firestore'
import { loadServiceAccountFromEnvironment } from '@/lib/firebase/service-account'

let adminApp: App | null = null
let adminStorage: Storage | null = null
let adminFirestore: Firestore | null = null
let adminInitDiagnosticsLogged = false
let lastLoadError: string | null = null

function logAdminEnvDiagnostics() {
  if (adminInitDiagnosticsLogged) return
  adminInitDiagnosticsLogged = true

  const loaded = loadServiceAccountFromEnvironment()
  console.info('[FIREBASE_ADMIN] env check', {
    hasSplitCredentials: Boolean(
      process.env.FIREBASE_ADMIN_PROJECT_ID &&
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
        process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ),
    hasBase64: Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim()),
    hasJsonKey: Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim()),
    hasFilePath: Boolean(
      String(process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || '').trim()
    ),
    loadSource: loaded.source,
    loadError: loaded.error,
  })
}

function resolveProjectId(projectIdFromAccount?: string) {
  return (
    String(process.env.FIREBASE_PROJECT_ID || '').trim() ||
    String(process.env.GOOGLE_CLOUD_PROJECT || '').trim() ||
    String(process.env.GCLOUD_PROJECT || '').trim() ||
    String(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim() ||
    String(projectIdFromAccount || '').trim() ||
    ''
  )
}

export function getAdminApp(): App | null {
  if (adminApp) {
    return adminApp
  }

  try {
    logAdminEnvDiagnostics()

    const existingApps = getApps()
    if (existingApps.length > 0) {
      adminApp = existingApps[0]
      console.info('[FIREBASE_ADMIN] initializeApp reused existing app')
      return adminApp
    }

    const loaded = loadServiceAccountFromEnvironment()
    lastLoadError = loaded.error

    if (loaded.account) {
      const projectId = resolveProjectId(loaded.account.projectId)
      try {
        adminApp = initializeApp({
          credential: cert(loaded.account),
          projectId: projectId || loaded.account.projectId,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        })
        lastLoadError = null
        console.info('[FIREBASE_ADMIN] initializeApp success', { source: loaded.source, projectId })
        return adminApp
      } catch (e: any) {
        lastLoadError = e?.message || 'initializeApp failed'
        console.error('[FIREBASE_ADMIN] service account initialization failed:', lastLoadError)
      }
    }

    const hasAdcHint =
      Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
      Boolean(process.env.GOOGLE_CLOUD_PROJECT) ||
      Boolean(process.env.GCLOUD_PROJECT) ||
      Boolean(process.env.K_SERVICE)

    if (!hasAdcHint) {
      console.error('[FIREBASE_ADMIN] not configured:', lastLoadError || 'missing credentials')
      return null
    }

    try {
      adminApp = initializeApp({
        projectId: resolveProjectId() || undefined,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
      lastLoadError = null
      console.info('[FIREBASE_ADMIN] initializeApp success via default credentials')
      return adminApp
    } catch (e: any) {
      lastLoadError = e?.message || 'default credentials failed'
      console.error('[FIREBASE_ADMIN] default credentials initialization failed:', lastLoadError)
      return null
    }
  } catch (error: any) {
    lastLoadError = error?.message || 'unknown initialization error'
    console.error('[FIREBASE_ADMIN] initialization error:', lastLoadError)
    return null
  }
}

export function getAdminStorage(): Storage | null {
  if (adminStorage) {
    return adminStorage
  }

  const app = getAdminApp()
  if (!app) {
    return null
  }

  try {
    adminStorage = getStorage(app)
    return adminStorage
  } catch (error) {
    console.error('[FIREBASE_ADMIN] failed to get storage')
    return null
  }
}

export function getAdminBucket() {
  const storage = getAdminStorage()
  if (!storage) {
    return null
  }

  try {
    return storage.bucket()
  } catch (error) {
    console.error('[FIREBASE_ADMIN] failed to get storage bucket')
    return null
  }
}

export function getAdminFirestore(): Firestore | null {
  if (adminFirestore) {
    return adminFirestore
  }

  const app = getAdminApp()
  if (!app) {
    return null
  }

  try {
    adminFirestore = getFirestore(app)
    return adminFirestore
  } catch (error: any) {
    console.error('[FIREBASE_ADMIN] failed to get firestore:', error?.message || error)
    return null
  }
}

export function isAdminSdkConfigured(): boolean {
  return Boolean(getAdminApp() && getAdminFirestore())
}

export function getAdminSdkStatus() {
  const loaded = loadServiceAccountFromEnvironment()
  const app = getAdminApp()
  const db = getAdminFirestore()
  return {
    configured: Boolean(app && db),
    loadSource: loaded.source,
    loadError: loaded.error || lastLoadError,
    projectId: resolveProjectId(loaded.account?.projectId),
    hasSplitCredentials: Boolean(
      process.env.FIREBASE_ADMIN_PROJECT_ID &&
        process.env.FIREBASE_ADMIN_CLIENT_EMAIL &&
        process.env.FIREBASE_ADMIN_PRIVATE_KEY
    ),
    hasBase64: Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim()),
    hasJsonKey: Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim()),
  }
}
