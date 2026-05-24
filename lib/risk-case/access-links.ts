import crypto from 'crypto'

export type AccessLinkRecord = {
  id: string
  inviteId: string
  orderCode: string
  allowedEmail: string
  role: 'risk_case_operator'
  expiresAt: string | null
  createdByAdmin: string
  createdAt: string | null
  revokedAt: string | null
  revokedByAdmin: string
  usedAt: string | null
  lastAccessAt: string | null
}

function normalizeEmail(email: string) {
  return String(email || '').trim().toLowerCase()
}

export function isValidEmail(email: string) {
  const normalized = normalizeEmail(email)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
}

function toIso(value: any): string | null {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    const d = value.toDate()
    return d instanceof Date && Number.isFinite(d.getTime()) ? d.toISOString() : null
  }
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.toISOString()
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}

function hashTokenSecret(secret: string) {
  return crypto.createHash('sha256').update(secret).digest('hex')
}

function parseRawToken(rawToken: string) {
  const token = String(rawToken || '').trim()
  const [tokenId, secret] = token.split('.')
  if (!tokenId || !secret) return null
  return { tokenId, secret, token }
}

function buildDocRef(adminDb: FirebaseFirestore.Firestore, tokenId: string) {
  return adminDb.collection('risk_case_access_links').doc(tokenId)
}

export async function createRiskCaseAccessLink(params: {
  adminDb: FirebaseFirestore.Firestore
  inviteId: string
  orderCode: string
  allowedEmail: string
  createdByAdmin: string
  expiresInHours?: number
}) {
  const { adminDb, inviteId, orderCode, createdByAdmin } = params
  const allowedEmail = normalizeEmail(params.allowedEmail)
  const expiresInHours = Math.max(1, Number(params.expiresInHours || 48))
  const tokenId = crypto.randomBytes(12).toString('hex')
  const secret = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashTokenSecret(secret)
  const rawToken = `${tokenId}.${secret}`
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
  await buildDocRef(adminDb, tokenId).set({
    tokenId,
    tokenHash,
    inviteId,
    orderCode,
    allowedEmail,
    role: 'risk_case_operator',
    expiresAt,
    createdByAdmin,
    createdAt: new Date(),
    revokedAt: null,
    revokedByAdmin: '',
    usedAt: null,
    lastAccessAt: null,
    lastIp: '',
    lastUserAgent: '',
  })
  return {
    tokenId,
    token: rawToken,
    allowedEmail,
    expiresAtIso: expiresAt.toISOString(),
    path: `/risk-case/access/${encodeURIComponent(rawToken)}`,
  }
}

export async function listRiskCaseAccessLinks(params: {
  adminDb: FirebaseFirestore.Firestore
  inviteId: string
  limit?: number
}) {
  const { adminDb, inviteId, limit = 25 } = params
  const snap = await adminDb
    .collection('risk_case_access_links')
    .where('inviteId', '==', inviteId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get()
  return snap.docs.map((doc) => {
    const row = doc.data() as any
    const expiresAt = toIso(row?.expiresAt)
    const revokedAt = toIso(row?.revokedAt)
    const now = Date.now()
    const expiresMs = expiresAt ? new Date(expiresAt).getTime() : 0
    const status = revokedAt ? 'revoked' : expiresMs > 0 && expiresMs < now ? 'expired' : 'active'
    return {
      id: doc.id,
      inviteId: String(row?.inviteId || ''),
      orderCode: String(row?.orderCode || ''),
      allowedEmail: String(row?.allowedEmail || ''),
      role: 'risk_case_operator' as const,
      expiresAt,
      createdByAdmin: String(row?.createdByAdmin || ''),
      createdAt: toIso(row?.createdAt),
      revokedAt,
      revokedByAdmin: String(row?.revokedByAdmin || ''),
      usedAt: toIso(row?.usedAt),
      lastAccessAt: toIso(row?.lastAccessAt),
      status,
    }
  })
}

export async function revokeRiskCaseAccessLink(params: {
  adminDb: FirebaseFirestore.Firestore
  inviteId: string
  tokenId: string
  revokedByAdmin: string
}) {
  const { adminDb, inviteId, tokenId, revokedByAdmin } = params
  const ref = buildDocRef(adminDb, tokenId)
  const snap = await ref.get()
  if (!snap.exists) throw new Error('Access link not found')
  const row = snap.data() as any
  if (String(row?.inviteId || '') !== inviteId) throw new Error('Access link does not belong to invite')
  if (row?.revokedAt) return { alreadyRevoked: true }
  await ref.set(
    {
      revokedAt: new Date(),
      revokedByAdmin,
      updatedAt: new Date(),
    },
    { merge: true }
  )
  return { alreadyRevoked: false }
}

export async function resolveRiskCaseAccessToken(params: {
  adminDb: FirebaseFirestore.Firestore
  rawToken: string
  touch?: boolean
  requestIp?: string
  requestUserAgent?: string
}) {
  const { adminDb, rawToken, touch = false, requestIp = '', requestUserAgent = '' } = params
  const parsed = parseRawToken(rawToken)
  if (!parsed) return { ok: false as const, status: 401, error: 'Invalid access token' }
  const { tokenId, secret } = parsed
  const ref = buildDocRef(adminDb, tokenId)
  const snap = await ref.get()
  if (!snap.exists) return { ok: false as const, status: 401, error: 'Invalid access token' }
  const row = snap.data() as any
  const expectedHash = String(row?.tokenHash || '')
  if (!expectedHash || expectedHash !== hashTokenSecret(secret)) {
    return { ok: false as const, status: 401, error: 'Invalid access token' }
  }
  if (row?.revokedAt) return { ok: false as const, status: 403, error: 'Access link revoked' }
  const expiresAtMs = row?.expiresAt?.toMillis?.() || new Date(row?.expiresAt || 0).getTime()
  if (Number.isFinite(expiresAtMs) && expiresAtMs > 0 && expiresAtMs < Date.now()) {
    return { ok: false as const, status: 403, error: 'Access link expired' }
  }
  if (touch) {
    await ref.set(
      {
        lastAccessAt: new Date(),
        usedAt: row?.usedAt || new Date(),
        lastIp: requestIp || row?.lastIp || '',
        lastUserAgent: requestUserAgent || row?.lastUserAgent || '',
      },
      { merge: true }
    )
  }
  return {
    ok: true as const,
    tokenId,
    inviteId: String(row?.inviteId || ''),
    orderCode: String(row?.orderCode || ''),
    allowedEmail: String(row?.allowedEmail || ''),
    role: String(row?.role || 'risk_case_operator'),
    expiresAt: toIso(row?.expiresAt),
  }
}
