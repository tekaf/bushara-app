import { readFileSync } from 'node:fs'
import type { ServiceAccount } from 'firebase-admin/app'

export type ServiceAccountLoadResult = {
  account: ServiceAccount | null
  source: 'split_env' | 'base64' | 'json_env' | 'file' | null
  error: string | null
}

function normalizePrivateKey(value: string): string {
  return value.replace(/\\n/g, '\n').trim()
}

function fromLegacyJson(parsed: Record<string, unknown>): ServiceAccount | null {
  const projectId = String(parsed.project_id || parsed.projectId || '').trim()
  const clientEmail = String(parsed.client_email || parsed.clientEmail || '').trim()
  const privateKey = normalizePrivateKey(String(parsed.private_key || parsed.privateKey || ''))
  if (!projectId || !clientEmail || !privateKey) return null
  return { projectId, clientEmail, privateKey }
}

export function parseServiceAccountJson(raw: string): ServiceAccount {
  const attempts: string[] = []
  const trimmed = raw.trim()

  attempts.push(trimmed)

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && !trimmed.includes('\\"type\\"'))
  ) {
    attempts.push(trimmed.slice(1, -1))
  }

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

  attempts.push(
    trimmed.replace(/"private_key"\s*:\s*"([\s\S]*?)"/m, (_full, keyValue: string) => {
      const escaped = keyValue.replace(/\r?\n/g, '\\n')
      return `"private_key":"${escaped}"`
    })
  )

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8').trim()
    if (decoded.startsWith('{') && decoded.endsWith('}')) {
      attempts.push(decoded)
    }
  } catch {
    // Ignore.
  }

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate) as Record<string, unknown>
      const account = fromLegacyJson(parsed)
      if (account) return account
    } catch {
      // Continue.
    }
  }

  throw new Error('Invalid service account JSON')
}

export function loadServiceAccountFromEnvironment(): ServiceAccountLoadResult {
  const splitProjectId = String(process.env.FIREBASE_ADMIN_PROJECT_ID || '').trim()
  const splitClientEmail = String(process.env.FIREBASE_ADMIN_CLIENT_EMAIL || '').trim()
  const splitPrivateKey = String(process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').trim()

  if (splitProjectId && splitClientEmail && splitPrivateKey) {
    return {
      account: {
        projectId: splitProjectId,
        clientEmail: splitClientEmail,
        privateKey: normalizePrivateKey(splitPrivateKey),
      },
      source: 'split_env',
      error: null,
    }
  }

  const base64 = String(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '').trim()
  if (base64) {
    try {
      const decoded = Buffer.from(base64, 'base64').toString('utf8')
      return {
        account: parseServiceAccountJson(decoded),
        source: 'base64',
        error: null,
      }
    } catch (error: any) {
      return {
        account: null,
        source: 'base64',
        error: error?.message || 'Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64',
      }
    }
  }

  const jsonEnv = String(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '').trim()
  if (jsonEnv) {
    try {
      return {
        account: parseServiceAccountJson(jsonEnv),
        source: 'json_env',
        error: null,
      }
    } catch (error: any) {
      return {
        account: null,
        source: 'json_env',
        error: error?.message || 'Failed to parse FIREBASE_SERVICE_ACCOUNT_KEY',
      }
    }
  }

  const filePath = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS || ''
  ).trim()

  if (filePath) {
    try {
      const raw = readFileSync(filePath, 'utf8')
      return {
        account: parseServiceAccountJson(raw),
        source: 'file',
        error: null,
      }
    } catch (error: any) {
      return {
        account: null,
        source: 'file',
        error: error?.message || 'Failed to read service account file',
      }
    }
  }

  return {
    account: null,
    source: null,
    error: 'No Firebase Admin credentials found in environment',
  }
}
