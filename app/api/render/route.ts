import { NextRequest, NextResponse } from 'next/server'
import { getAdminBucket, getAdminFirestore } from '@/lib/firebase/admin'
import type { Template } from '@/lib/firebase/types'
import { getPreset } from '@/lib/template-presets/loader'
import { generateHTML, type RenderFields } from '@/lib/render/engine'
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
    const { templateId, variant, fields: rawFields } = await request.json()

    console.log('📤 [RENDER] Request data:', { templateId, variant, fields: rawFields })

    if (!templateId || !rawFields) {
      console.error('❌ [RENDER] Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Map fields to RenderFields format
    const fields: RenderFields = {
      groomNameAr: rawFields.groomNameAr,
      brideNameAr: rawFields.brideNameAr,
      groomNameEn: rawFields.groomNameEn,
      brideNameEn: rawFields.brideNameEn,
      dateText: rawFields.dateText,
      date_en: rawFields.date_en || rawFields.dateText,
      venueText: rawFields.venueText,
      location_name: rawFields.location_name || rawFields.venueText,
      verse_or_dua: rawFields.verse_or_dua,
      intro_text: rawFields.intro_text,
      invite_line: rawFields.invite_line,
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

    // Generate HTML with fonts from Firestore
    console.log('📤 [RENDER] Generating HTML with fonts...')
    // Enable debug mode if ?debug=true in query string
    const debugMode = request.nextUrl.searchParams.get('debug') === 'true'
    // Enable grid overlay if ?grid=true in query string
    const showGrid = request.nextUrl.searchParams.get('grid') === 'true'
    const gridColumns = parseInt(request.nextUrl.searchParams.get('gridColumns') || '26')
    const gridRows = parseInt(request.nextUrl.searchParams.get('gridRows') || '30')
    
    console.log('📤 [RENDER] Options:', { debugMode, showGrid, gridColumns, gridRows })
    
    const html = await generateHTML(preset, template.assets.backgroundUrl, fields, { 
      debug: debugMode,
      showGrid: showGrid,
      gridColumns: gridColumns,
      gridRows: gridRows,
      layoutB: template.layoutB, // Pass saved layout if exists
    })
    console.log('✅ [RENDER] HTML generated', debugMode ? '(DEBUG MODE)' : '', showGrid ? '(GRID MODE)' : '')

    // Render with Playwright
    console.log('📤 [RENDER] Launching browser...')
    const browserInstance = await getBrowser()
    console.log('✅ [RENDER] Browser launched')
    
    // HARD-FIX: Exact viewport 1080x1920, deviceScaleFactor=1, no scaling
    const page = await browserInstance.newPage({
      viewport: { 
        width: 1080, 
        height: 1920,
        deviceScaleFactor: 1,
      },
    })

    console.log('📤 [RENDER] Setting page content...')
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500) // Wait for fonts to load

    console.log('📤 [RENDER] Taking screenshot...')
    // HARD-FIX: Exact size screenshot, no scaling
    const screenshot = await page.screenshot({
      type: 'png',
      clip: {
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
      },
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
    
    // Clean fields: remove undefined values (Firestore doesn't accept undefined)
    const cleanFields: Record<string, any> = {}
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined && value !== null && value !== '') {
        cleanFields[key] = value
      }
    }
    
    await adminDb.collection('renders').add({
      templateId,
      variant,
      fields: cleanFields,
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

