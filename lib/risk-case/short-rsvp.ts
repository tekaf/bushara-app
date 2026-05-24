import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore, WriteBatch } from 'firebase-admin/firestore'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function isValidShortRsvpCode(code: string): boolean {
  return /^[A-Z0-9]{4,8}$/.test(String(code || '').trim())
}

function randomShortCode(length = 6): string {
  let out = ''
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return out
}

export async function resolveGuestShortRsvpCode(params: {
  adminDb: Firestore
  inviteId: string
  guestId: string
  rsvpToken: string
  preferredCode?: string
  usedCodes: Set<string>
}): Promise<string> {
  const { adminDb, inviteId, guestId, rsvpToken, preferredCode = '', usedCodes } = params

  const canUseCode = async (candidateCode: string): Promise<boolean> => {
    const code = String(candidateCode || '').trim().toUpperCase()
    if (!isValidShortRsvpCode(code)) return false
    if (usedCodes.has(code)) return false
    const codeRef = adminDb.collection('rsvp_short_links').doc(code)
    const snap = await codeRef.get()
    if (!snap.exists) return true
    const row = snap.data() as any
    return String(row?.inviteId || '') === inviteId && String(row?.guestId || '') === guestId && String(row?.rsvpToken || '') === rsvpToken
  }

  const preferred = String(preferredCode || '').trim().toUpperCase()
  if (preferred && (await canUseCode(preferred))) {
    usedCodes.add(preferred)
    return preferred
  }

  for (let i = 0; i < 30; i += 1) {
    const candidate = randomShortCode(6)
    if (!(await canUseCode(candidate))) continue
    usedCodes.add(candidate)
    return candidate
  }

  throw new Error(`Failed generating unique short RSVP code for guest ${guestId}`)
}

export function buildShortInvitationLink(appOrigin: string, shortCode: string): string {
  const origin = String(appOrigin || '').trim().replace(/\/+$/, '')
  const code = String(shortCode || '').trim().toUpperCase()
  return `${origin}/i/${encodeURIComponent(code)}`
}

export function addShortRsvpMappingToBatch(params: {
  adminDb: Firestore
  batch: WriteBatch
  code: string
  inviteId: string
  guestId: string
  rsvpToken: string
}) {
  const { adminDb, batch, code, inviteId, guestId, rsvpToken } = params
  const codeRef = adminDb.collection('rsvp_short_links').doc(code)
  batch.set(
    codeRef,
    {
      code,
      inviteId,
      guestId,
      rsvpToken,
      active: true,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
}
