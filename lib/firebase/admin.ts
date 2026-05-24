import 'server-only'
import { readFileSync } from 'node:fs'
import { initializeApp, getApps, cert, App, type ServiceAccount } from 'firebase-admin/app'
import { getStorage, Storage } from 'firebase-admin/storage'
import { getFirestore, Firestore } from 'firebase-admin/firestore'

let adminApp: App | null = null
let adminStorage: Storage | null = null
let adminFirestore: Firestore | null = null
let adminInitDiagnosticsLogged = false

function logAdminEnvDiagnostics() {
  if (adminInitDiagnosticsLogged) return
  adminInitDiagnosticsLogged = true
  const hasServiceAccountKey = Boolean(String(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim())
  const hasFirebaseProjectId = Boolean(String(process.env.FIREBASE_PROJECT_ID || '').trim())
  const hasGoogleCloudProject = Boolean(String(process.env.GOOGLE_CLOUD_PROJECT || '').trim())
  const hasGCloudProject = Boolean(String(process.env.GCLOUD_PROJECT || '').trim())
  console.info('[FIREBASE_ADMIN] env check', {
    hasServiceAccountKey,
    hasFirebaseProjectId,
    hasGoogleCloudProject,
    hasGCloudProject,
  })
}

function parseServiceAccountFromEnv(raw: string): ServiceAccount {
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

  // Double-encoded JSON string (common in hosting dashboards).
  if (trimmed.startsWith('"') && trimmed.includes('\\"')) {
    try {
      const unquoted = JSON.parse(trimmed) as string
      if (typeof unquoted === 'string' && unquoted.trim().startsWith('{')) {
        attempts.push(unquoted.trim())
      }
    } catch {
      // Continue.
    }
  }

  // Common issue: private_key includes literal newlines instead of escaped \n.
  attempts.push(
    trimmed.replace(/"private_key"\s*:\s*"([\s\S]*?)"/m, (_full, keyValue: string) => {
      const escaped = keyValue.replace(/\r?\n/g, '\\n')
      return `"private_key":"${escaped}"`
    })
  )

  // Some deployments store the service account as base64-encoded JSON.
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim()
    if (decoded.startsWith('{') && decoded.endsWith('}')) {
      attempts.push(decoded)
    }
  } catch {
    // Ignore base64 decode attempts and continue parse strategies.
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as ServiceAccount
      if (parsed?.projectId && parsed?.privateKey && parsed?.clientEmail) {
        return parsed
      }
      const legacy = parsed as ServiceAccount & {
        project_id?: string
        private_key?: string
        client_email?: string
      }
      if (legacy?.project_id && legacy?.private_key && legacy?.client_email) {
        return {
          projectId: legacy.project_id,
          privateKey: legacy.private_key,
          clientEmail: legacy.client_email,
        }
      }
    } catch {
      // Continue to next parse strategy.
    }
  }

  throw new Error('Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY')
}

function resolveProjectId(serviceAccount?: ServiceAccount | null) {
  return (
    String(process.env.FIREBASE_PROJECT_ID || '').trim() ||
    String(process.env.GOOGLE_CLOUD_PROJECT || '').trim() ||
    String(process.env.GCLOUD_PROJECT || '').trim() ||
    String(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || '').trim() ||
    String(serviceAccount?.projectId || '').trim() ||
    ''
  )
}

export function getAdminApp(): App | null {
  if (adminApp) {
    return adminApp
  }

  try {
    logAdminEnvDiagnostics()
    // Check if already initialized
    const existingApps = getApps()
    if (existingApps.length > 0) {
      adminApp = existingApps[0]
      console.info('[FIREBASE_ADMIN] initializeApp reused existing app')
      return adminApp
    }

    // Try to get service account from environment
    const serviceAccountKey = String(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim()
    const serviceAccountPath = String(
      process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
        process.env.GOOGLE_APPLICATION_CREDENTIALS ||
        ''
    ).trim()

    let serviceAccount: ServiceAccount | null = null

    if (serviceAccountKey) {
      try {
        serviceAccount = parseServiceAccountFromEnv(serviceAccountKey)
      } catch (e: any) {
        console.error('[FIREBASE_ADMIN] service account parse failed:', e?.message || e)
      }
    } else if (serviceAccountPath) {
      try {
        const raw = readFileSync(serviceAccountPath, 'utf8')
        serviceAccount = parseServiceAccountFromEnv(raw)
      } catch (e: any) {
        console.error('[FIREBASE_ADMIN] service account file read failed:', e?.message || e)
      }
    }

    const projectId = resolveProjectId(serviceAccount)

    if (serviceAccount) {
      try {
        adminApp = initializeApp({
          credential: cert(serviceAccount),
          projectId: projectId || serviceAccount.projectId,
          storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        })
        console.info('[FIREBASE_ADMIN] initializeApp success via service account', {
          projectId: projectId || serviceAccount.projectId,
        })
        return adminApp
      } catch (e: any) {
        console.error('[FIREBASE_ADMIN] service account initialization failed:', e?.message || e)
      }
    }

    // Fallback: Try default credentials only when environment likely has ADC configured.
    const hasAdcHint =
      Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS) ||
      Boolean(process.env.GOOGLE_CLOUD_PROJECT) ||
      Boolean(process.env.GCLOUD_PROJECT) ||
      Boolean(process.env.K_SERVICE)

    if (!hasAdcHint) {
      console.error('[FIREBASE_ADMIN] not configured: missing service account and no ADC hints')
      return null
    }

    try {
      adminApp = initializeApp({
        projectId: projectId || undefined,
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      })
      console.info('[FIREBASE_ADMIN] initializeApp success via default credentials')
      return adminApp
    } catch (e) {
      console.error('[FIREBASE_ADMIN] default credentials initialization failed')
      return null
    }
  } catch (error) {
    console.error('[FIREBASE_ADMIN] initialization error')
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
