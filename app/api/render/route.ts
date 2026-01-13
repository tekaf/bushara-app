import { NextRequest, NextResponse } from 'next/server'
import { getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import type { Template } from '@/lib/firebase/types'
import { getPreset } from '@/lib/template-presets/loader'
import { generateHTML } from '@/lib/render/engine'
import chromium from '@sparticuz/chromium'
import playwright from 'playwright-core'

export const runtime = 'nodejs'
export const maxDuration = 30

// Cache browser instance
let browser: any = null

async function getBrowser() {
  if (browser) return browser

  try {
    // Try to use chromium (for production/Vercel)
    chromium.setGraphicsMode(false)
    browser = await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    })
    console.log('✅ [RENDER] Browser launched with Chromium')
  } catch (chromiumError: any) {
    console.warn('⚠️ [RENDER] Chromium failed, trying system browser:', chromiumError.message)
    // Fallback to system browser (for local development)
    try {
      browser = await playwright.chromium.launch({
        headless: true,
      })
      console.log('✅ [RENDER] Browser launched with system Chromium')
    } catch (systemError: any) {
      console.error('❌ [RENDER] Failed to launch browser:', systemError.message)
      throw new Error(`Failed to launch browser: ${systemError.message}`)
    }
  }

  return browser
}

export async function POST(request: NextRequest) {
  try {
    console.log('📤 [RENDER] Starting render request...')
    const { templateId, variant, fields } = await request.json()

    console.log('📤 [RENDER] Request data:', { templateId, variant, fields })

    if (!templateId || !fields) {
      console.error('❌ [RENDER] Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Load template using Admin SDK
    console.log('📤 [RENDER] Loading template from Firestore...')
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      console.error('❌ [RENDER] Admin Firestore not available')
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      )
    }

    const templateDoc = await adminDb.collection('templates').doc(templateId).get()
    if (!templateDoc.exists) {
      console.error('❌ [RENDER] Template not found:', templateId)
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const template = {
      id: templateDoc.id,
      ...templateDoc.data(),
    } as Template
    console.log('✅ [RENDER] Template loaded:', template.name)

    // Load preset
    const preset = getPreset(template.type)
    console.log('✅ [RENDER] Preset loaded:', template.type)

    // Generate HTML
    console.log('📤 [RENDER] Generating HTML...')
    const html = generateHTML(preset, template.assets.backgroundUrl, fields)
    console.log('✅ [RENDER] HTML generated')

    // Render with Playwright
    console.log('📤 [RENDER] Launching browser...')
    const browserInstance = await getBrowser()
    console.log('✅ [RENDER] Browser launched')
    
    const page = await browserInstance.newPage({
      viewport: { width: 1080, height: 1920 },
    })

    console.log('📤 [RENDER] Setting page content...')
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000) // Wait for fonts to load

    console.log('📤 [RENDER] Taking screenshot...')
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    })
    console.log('✅ [RENDER] Screenshot taken, size:', (screenshot as Buffer).length, 'bytes')

    await page.close()

    // Upload to Storage using Admin SDK
    console.log('📤 [RENDER] Uploading to Storage...')
    const bucket = getAdminBucket()
    if (!bucket) {
      console.error('❌ [RENDER] Admin bucket not available')
      return NextResponse.json(
        { error: 'Storage not configured' },
        { status: 500 }
      )
    }

    const renderId = crypto.randomUUID()
    const fileName = `outputs/${renderId}/preview.png`
    const fileRef = bucket.file(fileName)
    
    await fileRef.save(screenshot as Buffer, {
      metadata: {
        contentType: 'image/png',
      },
    })

    // Make file publicly accessible
    try {
      await fileRef.makePublic()
    } catch (publicError: any) {
      console.warn('⚠️ [RENDER] Could not make file public:', publicError.message)
    }

    const outputUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`
    console.log('✅ [RENDER] File uploaded:', outputUrl)

    // Save render record using Admin SDK
    console.log('📤 [RENDER] Saving render record...')
    await adminDb.collection('renders').add({
      templateId,
      variant,
      fields,
      status: 'completed',
      outputUrl,
      createdAt: new Date(),
    })
    console.log('✅ [RENDER] Render record saved')

    return NextResponse.json({
      url: outputUrl,
      renderId,
    })
  } catch (error: any) {
    const errorDetails = {
      message: error.message || 'Unknown error',
      stack: error.stack,
      code: error.code,
      name: error.name,
    }
    console.error('❌ [RENDER] Error:', errorDetails)
    
    // Return detailed error in development, simple message in production
    const isDev = process.env.NODE_ENV === 'development'
    return NextResponse.json(
      { 
        error: error.message || 'Error rendering image',
        ...(isDev && { details: errorDetails })
      },
      { status: 500 }
    )
  }
}

