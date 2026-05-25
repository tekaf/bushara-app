import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import chromium from '@sparticuz/chromium'
import playwright from 'playwright-core'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'
import { ensurePaidInviteWorkshopReady } from '@/lib/admin/ensure-workshop-ready'

export const runtime = 'nodejs'
export const maxDuration = 30

let browser: any = null

async function getBrowser() {
  if (browser) return browser
  try {
    const graphicsModeControl = (chromium as any).setGraphicsMode
    if (typeof graphicsModeControl === 'function') {
      graphicsModeControl(false)
    } else if (typeof graphicsModeControl === 'boolean') {
      ;(chromium as any).setGraphicsMode = false
    }
    const chromiumHeadless = chromium.headless === 'new' ? true : chromium.headless
    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromiumHeadless,
    })
  } catch {
    browser = await playwright.chromium.launch({ headless: true })
  }
  return browser
}

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')
  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  const email = decoded.email || (await auth.getUser(decoded.uid)).email || ''
  if (!isAdminEmailServer(email)) throw new Error('Unauthorized')
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export async function GET(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    await verifyAdmin(request)
    const inviteId = String(params?.inviteId || '').trim()
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteSnap = await adminDb.collection('invites').doc(inviteId).get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)

    const ready = await ensurePaidInviteWorkshopReady(adminDb, inviteId, {
      origin: request.nextUrl.origin,
    })
    const invite = ready.invite as any
    const imageUrl = String(
      ready.adminPreviewUrl ||
        invite?.inviteImageUrl ||
        invite?.finalUrl ||
        invite?.previewUrl ||
        ''
    ).trim()
    if (!imageUrl) {
      return NextResponse.json({ error: 'No invite preview available for PDF export' }, { status: 409 })
    }

    const html = `
      <!doctype html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <style>
            html, body {
              margin: 0;
              padding: 0;
              width: 1080px;
              height: 1920px;
              background: #ffffff;
            }
            .page {
              width: 1080px;
              height: 1920px;
              overflow: hidden;
            }
            img {
              width: 1080px;
              height: 1920px;
              object-fit: cover;
              display: block;
            }
          </style>
        </head>
        <body>
          <div class="page">
            <img src="${escapeHtml(imageUrl)}" alt="Invitation" />
          </div>
        </body>
      </html>
    `

    const browserInstance = await getBrowser()
    const page = await browserInstance.newPage({
      viewport: { width: 1080, height: 1920, deviceScaleFactor: 2 },
    })
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.waitForFunction(() => {
      const img = document.querySelector('img')
      return !!img && (img as HTMLImageElement).complete
    })
    const pdfBuffer = await page.pdf({
      printBackground: true,
      width: '1080px',
      height: '1920px',
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
      pageRanges: '1',
    })
    await page.close()

    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    const status = error?.message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: error?.message || 'Failed to export invite PDF' }, { status })
  }
}

