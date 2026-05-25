import { NextRequest, NextResponse } from 'next/server'
import { renderFinalPngToStorage } from '@/lib/render/final-png'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    const { templateId, variant, fields: rawFields, renderOptions } = await request.json()
    if (!templateId || !rawFields) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const url = await renderFinalPngToStorage({
      templateId,
      variant,
      fields: rawFields as Record<string, unknown>,
      renderOptions,
      assetBaseUrl: request.nextUrl.origin,
    })

    return NextResponse.json({ url, renderId: url.split('/').slice(-2)[0] || '' })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error rendering image'
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      {
        error: message,
        ...(isDev && error instanceof Error ? { details: { stack: error.stack } } : {}),
      },
      { status: 500 }
    )
  }
}
