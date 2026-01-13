import { initializeApp, getApps, cert, App } from 'firebase-admin/app'
import { getStorage, Storage } from 'firebase-admin/storage'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

let adminApp: App | null = null
let adminStorage: Storage | null = null
let adminFirestore: Firestore | null = null

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
    
    if (serviceAccountKey) {
      try {
        const serviceAccount = typeof serviceAccountKey === 'string' 
          ? JSON.parse(serviceAccountKey) 
          : serviceAccountKey

        adminApp = initializeApp({
          credential: cert(serviceAccount),
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        })
        console.log('✅ Firebase Admin initialized with service account')
        return adminApp
      } catch (e) {
        console.error('❌ Failed to parse service account:', e)
      }
    }

    // Fallback: Try default credentials (works on Vercel/Cloud Run)
    try {
      adminApp = initializeApp({
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
