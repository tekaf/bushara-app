import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const url = request.nextUrl.searchParams.get('url') || ''
    const filename = request.nextUrl.searchParams.get('filename') || 'bushara-invite.png'

    if (!url) {
      return NextResponse.json({ error: 'Missing url' }, { status: 400 })
    }

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return NextResponse.json({ error: 'Invalid url' }, { status: 400 })
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return NextResponse.json({ error: 'Invalid protocol' }, { status: 400 })
    }

    const upstream = await fetch(parsed.toString())
    if (!upstream.ok) {
      return NextResponse.json({ error: `Upstream failed: ${upstream.status}` }, { status: 502 })
    }

    const arrayBuffer = await upstream.arrayBuffer()
    const contentType = upstream.headers.get('content-type') || 'image/png'

    return new NextResponse(arrayBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to download file' },
      { status: 500 }
    )
  }
}
