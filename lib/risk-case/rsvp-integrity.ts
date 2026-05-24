type ValidateGuestRsvpIntegrityInput = {
  inviteId: string
  guestId: string
  orderCode: string
  guest: any
  appOrigin: string
}

type ValidateGuestRsvpIntegrityResult =
  | {
      ok: true
      invitationLink: string
      rsvpToken: string
    }
  | {
      ok: false
      code: 'missing_rsvp_token' | 'invalid_rsvp_token' | 'invalid_invitation_link' | 'guest_relation_invalid'
      reason: string
    }

function logRsvpIntegrity(event: string, payload: Record<string, unknown>) {
  console.warn('[RISK_CASE][RSVP_INTEGRITY]', { event, ...payload })
}

function isValidRsvpToken(token: string): boolean {
  const clean = String(token || '').trim()
  return /^[a-zA-Z0-9_-]{20,}$/.test(clean)
}

export function buildRiskCaseInvitationLink(appOrigin: string, inviteId: string, token: string): string {
  const origin = String(appOrigin || '').trim().replace(/\/+$/, '')
  const safeToken = encodeURIComponent(String(token || '').trim())
  const safeInviteId = encodeURIComponent(String(inviteId || '').trim())
  return `${origin}/rsvp/${safeToken}?inv=${safeInviteId}`
}

function isLocalhostLink(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(String(value || '').trim())
}

export function validateGuestRsvpIntegrity(
  input: ValidateGuestRsvpIntegrityInput
): ValidateGuestRsvpIntegrityResult {
  const rsvpToken = String(input.guest?.rsvpToken || '').trim()
  if (!rsvpToken) {
    logRsvpIntegrity('blocked_missing_rsvp_token', {
      inviteId: input.inviteId,
      guestId: input.guestId,
      orderCode: input.orderCode,
      reason: 'Missing rsvpToken',
    })
    return { ok: false, code: 'missing_rsvp_token', reason: 'Guest is missing rsvpToken' }
  }

  if (!isValidRsvpToken(rsvpToken)) {
    logRsvpIntegrity('blocked_invalid_rsvp_token', {
      inviteId: input.inviteId,
      guestId: input.guestId,
      orderCode: input.orderCode,
      reason: 'Invalid rsvpToken format',
    })
    return { ok: false, code: 'invalid_rsvp_token', reason: 'Guest has invalid rsvpToken format' }
  }

  const guestOrderCode = String(input.guest?.orderCode || '').trim()
  if (guestOrderCode && guestOrderCode !== input.orderCode) {
    logRsvpIntegrity('blocked_guest_relation_invalid', {
      inviteId: input.inviteId,
      guestId: input.guestId,
      orderCode: input.orderCode,
      guestOrderCode,
      reason: 'Guest orderCode mismatch',
    })
    return { ok: false, code: 'guest_relation_invalid', reason: 'Guest relation invalid: orderCode mismatch' }
  }

  const invitationLink = buildRiskCaseInvitationLink(input.appOrigin, input.inviteId, rsvpToken)
  if (!/^https?:\/\/[^/]+\/rsvp\/[^?]+\?inv=.+$/.test(invitationLink)) {
    logRsvpIntegrity('blocked_invalid_invitation_link', {
      inviteId: input.inviteId,
      guestId: input.guestId,
      orderCode: input.orderCode,
      invitationLink,
      reason: 'Invitation link format invalid',
    })
    return { ok: false, code: 'invalid_invitation_link', reason: 'Generated invitation link is invalid' }
  }
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production'
  if (isProduction && isLocalhostLink(invitationLink)) {
    logRsvpIntegrity('blocked_localhost_invitation_link', {
      inviteId: input.inviteId,
      guestId: input.guestId,
      orderCode: input.orderCode,
      invitationLink,
      reason: 'Localhost invitation links are blocked in Risk Case',
    })
    return { ok: false, code: 'invalid_invitation_link', reason: 'Generated invitation link must not use localhost' }
  }

  return { ok: true, invitationLink, rsvpToken }
}
