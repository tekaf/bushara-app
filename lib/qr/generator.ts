import { v4 as uuidv4 } from 'uuid'

export function generateQRToken(): string {
  return uuidv4()
}

export function generateInviteURL(inviteId: string, qrToken: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/invite/${inviteId}?t=${qrToken}`
  }
  return `https://yourdomain.com/invite/${inviteId}?t=${qrToken}`
}

