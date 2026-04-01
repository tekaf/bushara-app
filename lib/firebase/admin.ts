import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getStorage, Storage } from 'firebase-admin/storage'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

let adminApp: App | null = null
let adminStorage: Storage | null = null
let adminFirestore: Firestore | null = null

function parseServiceAccountFromEnv(raw: string) {
  const attempts: string[] = []
  const trimmed = raw.trim()

  attempts.push(trimmed)

  // Some shells store JSON as a quoted string in env files.
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    attempts.push(trimmed.slice(1, -1))
  }

  // Common issue: private_key includes literal newlines instead of escaped \n.
  attempts.push(
    trimmed.replace(/"private_key"\s*:\s*"([\s\S]*?)"/m, (_full, keyValue: string) => {
      const escaped = keyValue.replace(/\r?\n/g, '\\n')
      return `"private_key":"${escaped}"`
    })
  )

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate)
    } catch {
      // Continue to next parse strategy.
    }
  }

  throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY')
}

export function getAdminApp(): App | null {
  if (adminApp) {
    return adminApp
  }

  try {
    // Check if already initialized
    const existingApps = getApps()
    if (existingApps.length > 0) {
      adminApp = existingApps[0]
      return adminApp
    }

    // Try to get service account from environment
    const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
    const projectId =
      process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
    
    if (serviceAccountKey) {
      try {
        const serviceAccount =
          typeof serviceAccountKey === 'string'
            ? parseServiceAccountFromEnv(serviceAccountKey)
            : serviceAccountKey

        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        })
        console.log('✅ Firebase Admin initialized with service account')
        return adminApp
      } catch (e) {
        console.error('❌ Failed to parse service account:', e)
      }
    }

    // Fallback: Try default credentials only when environment likely has ADC configured.
    const hasAdcHint =
      Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
      Boolean(process.env.GOOGLE_CLOUD_PROJECT) ||
      Boolean(process.env.GCLOUD_PROJECT) ||
      Boolean(process.env.K_SERVICE)

    if (!hasAdcHint) {
      console.error('❌ Firebase Admin not configured: FIREBASE_SERVICE_ACCOUNT_KEY is missing')
      return null
    }

    try {
      adminApp = initializeApp({
        projectId,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
      console.log('✅ Firebase Admin initialized with default credentials')
      return adminApp
    } catch (e) {
      console.error('❌ Failed to initialize with default credentials:', e)
      return null
    }
  } catch (error) {
    console.error('❌ Firebase Admin initialization error:', error)
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
    console.error('❌ Failed to get Admin Storage:', error)
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
    console.error('❌ Failed to get bucket:', error)
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
  } catch (error) {
    console.error('❌ Failed to get Admin Firestore:', error)
    return null
  }
}
