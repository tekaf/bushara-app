type SendEmailInput = {
  to: string[]
  subject: string
  html: string
  text?: string
}

export async function sendEmail(input: SendEmailInput) {
  const recipients = input.to.map((email) => String(email || '').trim().toLowerCase()).filter(Boolean)
  if (!recipients.length) {
    throw new Error('No recipients configured')
  }

  const resendApiKey = process.env.RESEND_API_KEY || ''
  if (!resendApiKey) {
    console.warn('[EMAIL] RESEND_API_KEY not configured; skipping send.')
    return { delivered: false, skipped: true, recipients }
  }

  const sender =
    process.env.NOTIFICATION_FROM_EMAIL ||
    process.env.RESEND_FROM_EMAIL ||
    'Busharh <no-reply@busharh.com>'

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: recipients,
      subject: input.subject,
      html: input.html,
      text: input.text || '',
    }),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`Email provider failed with status ${response.status}: ${payload}`)
  }

  return { delivered: true, skipped: false, recipients }
}
