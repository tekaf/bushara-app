import { getAdminEmailsForServer } from '@/lib/auth/admin-access'

const WORKSHOP_PRIMARY_RECIPIENT = 'tekafplus@gmail.com'

type WorkshopEmailInput = {
  inviteId: string
  orderNumber: string
  customerName: string
  occasionType: string
  reviewUrl: string
}

function formatHtml(input: WorkshopEmailInput) {
  return `
    <div style="font-family: Arial, sans-serif; line-height:1.6; direction: rtl; text-align: right;">
      <h2 style="margin-bottom: 8px;">دعوة جديدة في ورشة التأكد</h2>
      <p style="margin: 0 0 12px;">تم تسجيل نجاح الدفع، والدعوة بانتظار مراجعة الإدارة.</p>
      <ul style="padding-right: 18px;">
        <li><strong>رقم الطلب:</strong> ${input.orderNumber}</li>
        <li><strong>اسم المستخدم:</strong> ${input.customerName}</li>
        <li><strong>نوع المناسبة:</strong> ${input.occasionType}</li>
        <li><strong>رقم الدعوة:</strong> ${input.inviteId}</li>
      </ul>
      <p style="margin-top: 14px;">
        <a href="${input.reviewUrl}" target="_blank" rel="noopener noreferrer">فتح صفحة المراجعة مباشرة</a>
      </p>
    </div>
  `.trim()
}

function formatText(input: WorkshopEmailInput) {
  return [
    'دعوة جديدة في ورشة التأكد',
    '',
    'تم تسجيل نجاح الدفع، والدعوة بانتظار مراجعة الإدارة.',
    `رقم الطلب: ${input.orderNumber}`,
    `اسم المستخدم: ${input.customerName}`,
    `نوع المناسبة: ${input.occasionType}`,
    `رقم الدعوة: ${input.inviteId}`,
    `رابط المراجعة: ${input.reviewUrl}`,
  ].join('\n')
}

export async function sendWorkshopReviewEmail(input: WorkshopEmailInput) {
  const recipients = Array.from(
    new Set([WORKSHOP_PRIMARY_RECIPIENT, ...getAdminEmailsForServer()].map((email) => String(email).trim().toLowerCase()).filter(Boolean))
  )
  if (!recipients.length) {
    throw new Error('No admin recipients configured')
  }

  const resendApiKey = process.env.RESEND_API_KEY || ''
  const sender = process.env.RESEND_FROM_EMAIL || 'Busharh <no-reply@busharh.com>'
  if (!resendApiKey) {
    console.warn('[WORKSHOP][EMAIL] RESEND_API_KEY not configured; email send skipped.')
    return { delivered: false, recipients }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: recipients,
      subject: `ورشة التأكد - طلب ${input.orderNumber}`,
      html: formatHtml(input),
      text: formatText(input),
    }),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`Failed to send admin email: ${response.status} ${payload}`)
  }

  return { delivered: true, recipients }
}

