export type WhatsAppWebhookMessage = {
  senderNumber: string
  messageText: string
  profileName?: string
  messageId?: string
  timestamp?: string
}

type MaybeObject = Record<string, any> | null | undefined

function asObject(value: unknown): MaybeObject {
  if (!value || typeof value !== 'object') return null
  return value as Record<string, any>
}

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

export function extractIncomingWhatsAppMessages(payload: unknown): WhatsAppWebhookMessage[] {
  const root = asObject(payload)
  if (!root) return []

  const entries = asArray(root.entry)
  if (!entries.length) return []

  const output: WhatsAppWebhookMessage[] = []

  for (const entryItem of entries) {
    const entry = asObject(entryItem)
    if (!entry) continue

    for (const changeItem of asArray(entry.changes)) {
      const change = asObject(changeItem)
      const value = asObject(change?.value)
      if (!value) continue

      const contacts = asArray(value.contacts)
      const messages = asArray(value.messages)

      for (const messageItem of messages) {
        const message = asObject(messageItem)
        if (!message) continue

        const senderNumber = String(message.from || '').trim()
        const messageText = String(message?.text?.body || '').trim()
        const messageId = String(message.id || '').trim() || undefined
        const timestamp = String(message.timestamp || '').trim() || undefined

        let profileName: string | undefined
        const matchedContact = contacts.find((item) => {
          const contact = asObject(item)
          const waId = String(contact?.wa_id || '').trim()
          return Boolean(waId && waId === senderNumber)
        })
        if (matchedContact) {
          const contact = asObject(matchedContact)
          profileName = String(contact?.profile?.name || '').trim() || undefined
        } else if (contacts.length) {
          const contact = asObject(contacts[0])
          profileName = String(contact?.profile?.name || '').trim() || undefined
        }

        if (!senderNumber || !messageText) continue

        output.push({
          senderNumber,
          messageText,
          profileName,
          messageId,
          timestamp,
        })
      }
    }
  }

  return output
}

