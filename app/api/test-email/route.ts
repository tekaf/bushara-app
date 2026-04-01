import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const TEST_RECIPIENT = 'tekafplus@gmail.com'

async function sendTestEmail() {
  const resendApiKey = process.env.RESEND_API_KEY || ''
  const sender = process.env.RESEND_FROM_EMAIL || ''

  if (!resendApiKey) {
    return NextResponse.json(
      { ok: false, error: 'Missing RESEND_API_KEY in environment variables.' },
      { status: 500 }
    )
  }

  if (!sender) {
    return NextResponse.json(
      { ok: false, error: 'Missing RESEND_FROM_EMAIL in environment variables.' },
      { status: 500 }
    )
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: [TEST_RECIPIENT],
        subject: 'Busharh Resend Test Email',
        html: '<p>This is a temporary test email from <strong>Busharh</strong>.</p>',
        text: 'This is a temporary test email from Busharh.',
      }),
    })

    const payload = await response.json().catch(() => ({}))

    if (!response.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Failed to send test email via Resend.',
          status: response.status,
          details: payload,
        },
        { status: 500 }
      )
    }

    return NextResponse.json({
      ok: true,
      message: `Test email sent to ${TEST_RECIPIENT}.`,
      resend: payload,
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error?.message || 'Unexpected error while sending test email.',
      },
      { status: 500 }
    )
  }
}

export async function GET() {
  return sendTestEmail()
}

export async function POST() {
  return sendTestEmail()
}
