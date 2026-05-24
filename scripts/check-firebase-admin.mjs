/**
 * Usage: node --env-file=.env.local scripts/check-firebase-admin.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function loadEnvLocal() {
  try {
    const raw = readFileSync(join(root, '.env.local'), 'utf8')
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq <= 0) continue
      const key = trimmed.slice(0, eq).trim()
      let value = trimmed.slice(eq + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (!process.env[key]) process.env[key] = value
    }
  } catch {
    // .env.local optional when using --env-file
  }
}

loadEnvLocal()

const { loadServiceAccountFromEnvironment } = await import('../lib/firebase/service-account.ts')
const { cert, initializeApp, getApps } = await import('firebase-admin/app')

const loaded = loadServiceAccountFromEnvironment()
console.log('load source:', loaded.source)
console.log('load error:', loaded.error)

if (!loaded.account) {
  console.log('\n❌ Firebase Admin credentials not loaded.')
  console.log('Set one of:')
  console.log('  - FIREBASE_ADMIN_PROJECT_ID + FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY')
  console.log('  - FIREBASE_SERVICE_ACCOUNT_BASE64')
  console.log('  - FIREBASE_SERVICE_ACCOUNT_KEY')
  process.exit(1)
}

try {
  if (getApps().length === 0) {
    initializeApp({
      credential: cert(loaded.account),
      projectId: loaded.account.projectId,
    })
  }
  console.log('\n✅ Firebase Admin initialized successfully')
  console.log('projectId:', loaded.account.projectId)
  console.log('clientEmail:', loaded.account.clientEmail)
} catch (error) {
  console.log('\n❌ initializeApp failed:', error?.message || error)
  process.exit(1)
}
