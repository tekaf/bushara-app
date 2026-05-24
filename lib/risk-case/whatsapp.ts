export type GenerateWhatsAppLinkInput = {
  normalizedPhone: string
  messageText: string
}

export type GenerateWhatsAppLinkResult =
  | { ok: true; url: string }
  | { ok: false; reason: string }

export function generateWhatsAppLink(input: GenerateWhatsAppLinkInput): GenerateWhatsAppLinkResult {
  const normalizedPhone = String(input.normalizedPhone || '').trim()
  const messageText = String(input.messageText || '').trim()

  if (!/^9665\d{8}$/.test(normalizedPhone)) {
    return { ok: false, reason: 'Invalid normalized phone for WhatsApp link' }
  }
  if (!messageText) {
    return { ok: false, reason: 'Message text is empty' }
  }

  const encoded = encodeURIComponent(messageText)
  return { ok: true, url: `https://wa.me/${normalizedPhone}?text=${encoded}` }
}
