import { NextRequest, NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'

function invalidInvitationHtml() {
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>رابط دعوة غير صالح</title>
    <style>
      body { font-family: Arial, sans-serif; background: #f8fafc; color: #1f2937; margin: 0; }
      .wrap { max-width: 560px; margin: 80px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px; }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 8px 0; line-height: 1.7; color: #4b5563; }
    </style>
  </head>
  <body>
    <div class="wrap">
      <h1>رابط الدعوة غير صالح</h1>
      <p>تعذر فتح الدعوة عبر الرابط المختصر. يرجى التواصل مع صاحب الدعوة للحصول على رابط صحيح.</p>
    </div>
  </body>
</html>`
}

export async function GET(request: NextRequest, { params }: { params: { code: string } }) {
  try {
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return new NextResponse('Admin SDK not configured', { status: 500 })
    }
    const code = String(params?.code || '').trim().toUpperCase()
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      return new NextResponse('Not Found', { status: 404 })
    }

    const codeSnap = await adminDb.collection('rsvp_short_links').doc(code).get()
    if (!codeSnap.exists) {
      return new NextResponse('Not Found', { status: 404 })
    }
    const codeRow = codeSnap.data() as any
    if (codeRow?.active === false) {
      return new NextResponse(invalidInvitationHtml(), {
        status: 410,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const inviteId = String(codeRow?.inviteId || '').trim()
    const guestId = String(codeRow?.guestId || '').trim()
    const rsvpToken = String(codeRow?.rsvpToken || '').trim()
    if (!inviteId || !guestId || !rsvpToken) {
      return new NextResponse(invalidInvitationHtml(), {
        status: 410,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const guestSnap = await adminDb.collection('invites').doc(inviteId).collection('guests').doc(guestId).get()
    if (!guestSnap.exists) {
      return new NextResponse(invalidInvitationHtml(), {
        status: 410,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }
    const guest = guestSnap.data() as any
    if (String(guest?.rsvpToken || '').trim() !== rsvpToken) {
      return new NextResponse(invalidInvitationHtml(), {
        status: 410,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    const targetUrl = new URL(`/rsvp/${encodeURIComponent(rsvpToken)}?inv=${encodeURIComponent(inviteId)}`, request.url)
    return NextResponse.redirect(targetUrl, { status: 307 })
  } catch {
    return new NextResponse(invalidInvitationHtml(), {
      status: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }
}
