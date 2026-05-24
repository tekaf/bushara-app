type RiskCaseAccessEmailInput = {
  to: string
  orderCode: string
  occasionType: string
  accessUrl: string
  expiresAtIso: string
}

function formatHtml(input: RiskCaseAccessEmailInput) {
  return `
    <div style="font-family: Arial, sans-serif; line-height:1.6; direction: rtl; text-align: right;">
      <h2 style="margin-bottom: 8px;">رابط تشغيل الإرسال اليدوي</h2>
      <p style="margin: 0 0 12px;">تمت مشاركة وصول محدود لك لتشغيل Risk Case.</p>
      <ul style="padding-right: 18px;">
        <li><strong>رقم الطلب:</strong> ${input.orderCode}</li>
        <li><strong>نوع المناسبة:</strong> ${input.occasionType || '-'}</li>
        <li><strong>ينتهي الرابط:</strong> ${input.expiresAtIso}</li>
      </ul>
      <p style="margin-top: 14px;">
        <a href="${input.accessUrl}" target="_blank" rel="noopener noreferrer">فتح صفحة الإرسال اليدوي</a>
      </p>
      <p style="margin-top: 14px; color:#b91c1c;">تنبيه: الرابط خاص بك ولا يجب مشاركته مع أي طرف آخر.</p>
    </div>
  `.trim()
}

function formatText(input: RiskCaseAccessEmailInput) {
  return [
    'رابط تشغيل الإرسال اليدوي',
    '',
    `رقم الطلب: ${input.orderCode}`,
    `نوع المناسبة: ${input.occasionType || '-'}`,
    `ينتهي الرابط: ${input.expiresAtIso}`,
    `الرابط: ${input.accessUrl}`,
    '',
    'تنبيه: الرابط خاص بك ولا يجب مشاركته.',
  ].join('\n')
}

export async function sendRiskCaseAccessEmail(input: RiskCaseAccessEmailInput) {
  const resendApiKey = process.env.RESEND_API_KEY || ''
  const sender = process.env.RESEND_FROM_EMAIL || 'Busharh <no-reply@busharh.com>'
  if (!resendApiKey) {
    console.warn('[RISK_CASE_ACCESS] RESEND_API_KEY not configured; email send skipped.')
    return { delivered: false }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: sender,
      to: [input.to],
      subject: `رابط Risk Case - ${input.orderCode}`,
      html: formatHtml(input),
      text: formatText(input),
    }),
  })

  if (!response.ok) {
    const payload = await response.text()
    throw new Error(`Failed to send access email: ${response.status} ${payload}`)
  }

  return { delivered: true }
}
