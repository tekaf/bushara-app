import { getAdminEmailsForServer } from '@/lib/auth/admin-access'
import { sendEmail } from '@/lib/notifications/email'

type WorkshopEmailInput = {
  inviteId: string
  orderNumber: string
  customerName: string
  phoneNumber: string
  occasionType: string
  packageLabel: string
  amountSar: number
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
        <li><strong>رقم الجوال:</strong> ${input.phoneNumber || '-'}</li>
        <li><strong>نوع المناسبة:</strong> ${input.occasionType}</li>
        <li><strong>الباقة:</strong> ${input.packageLabel || '-'}</li>
        <li><strong>المبلغ:</strong> ${input.amountSar || 0} ر.س</li>
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
    `رقم الجوال: ${input.phoneNumber || '-'}`,
    `نوع المناسبة: ${input.occasionType}`,
    `الباقة: ${input.packageLabel || '-'}`,
    `المبلغ: ${input.amountSar || 0} ر.س`,
    `رقم الدعوة: ${input.inviteId}`,
    `رابط المراجعة: ${input.reviewUrl}`,
  ].join('\n')
}

export async function sendWorkshopReviewEmail(input: WorkshopEmailInput) {
  const notifyEmail = String(process.env.ADMIN_NOTIFY_EMAIL || '')
    .trim()
    .toLowerCase()
  const recipients = Array.from(
    new Set([notifyEmail, ...getAdminEmailsForServer()].map((email) => String(email).trim().toLowerCase()).filter(Boolean))
  )
  if (!recipients.length) {
    throw new Error('No admin recipients configured')
  }
  const result = await sendEmail({
    to: recipients,
    subject: `طلب مدفوع جديد - ${input.orderNumber}`,
    html: formatHtml(input),
    text: formatText(input),
  })
  return { delivered: result.delivered, recipients }
}

