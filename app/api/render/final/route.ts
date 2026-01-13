import { NextRequest, NextResponse } from 'next/server'
import { doc, getDoc, collection, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { getAdminBucket } from '@/lib/firebase/admin'
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
    console.log('✅ [RENDER/FINAL] Browser launched with Chromium')
  } catch (chromiumError: any) {
    console.warn('⚠️ [RENDER/FINAL] Chromium failed, trying system browser:', chromiumError.message)
    // Fallback to system browser (for local development)
    try {
      browser = await playwright.chromium.launch({
        headless: true,
      })
      console.log('✅ [RENDER/FINAL] Browser launched with system Chromium')
    } catch (systemError: any) {
      console.error('❌ [RENDER/FINAL] Failed to launch browser:', systemError.message)
      throw new Error(`Failed to launch browser: ${systemError.message}`)
    }
  }

  return browser
}

export async function POST(request: NextRequest) {
  try {
    console.log('📤 [RENDER/FINAL] Starting final render request...')
    const { templateId, variant, fields } = await request.json()

    console.log('📤 [RENDER/FINAL] Request data:', { templateId, variant, fields })

    if (!templateId || !fields) {
      console.error('❌ [RENDER/FINAL] Missing required fields')
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Load template
    console.log('📤 [RENDER/FINAL] Loading template from Firestore...')
    const templateDoc = await getDoc(doc(db, 'templates', templateId))
    if (!templateDoc.exists()) {
      console.error('❌ [RENDER/FINAL] Template not found:', templateId)
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const template = {
      id: templateDoc.id,
      ...templateDoc.data(),
    } as Template
    console.log('✅ [RENDER/FINAL] Template loaded:', template.name)

    // Load preset
    const preset = getPreset(template.type)
    console.log('✅ [RENDER/FINAL] Preset loaded:', template.type)

    // Generate HTML
    console.log('📤 [RENDER/FINAL] Generating HTML...')
    const html = generateHTML(preset, template.assets.backgroundUrl, fields)
    console.log('✅ [RENDER/FINAL] HTML generated')

    // Render with Playwright
    console.log('📤 [RENDER/FINAL] Launching browser...')
    const browserInstance = await getBrowser()
    console.log('✅ [RENDER/FINAL] Browser launched')
    
    const page = await browserInstance.newPage({
      viewport: { width: 1080, height: 1920 },
    })

    console.log('📤 [RENDER/FINAL] Setting page content...')
    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1500) // Wait for fonts to load

    console.log('📤 [RENDER/FINAL] Taking screenshot...')
    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    })
    console.log('✅ [RENDER/FINAL] Screenshot taken, size:', (screenshot as Buffer).length, 'bytes')

    await page.close()

    // Upload to Storage using Admin SDK
    console.log('📤 [RENDER/FINAL] Uploading to Storage...')
    const bucket = getAdminBucket()
    if (!bucket) {
      console.error('❌ [RENDER/FINAL] Admin bucket not available')
      return NextResponse.json(
        { error: 'Storage not configured' },
        { status: 500 }
      )
    }

    const renderId = crypto.randomUUID()
    const fileName = `outputs/${renderId}/final.png`
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
      console.warn('⚠️ [RENDER/FINAL] Could not make file public:', publicError.message)
    }

    const outputUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`
    console.log('✅ [RENDER/FINAL] File uploaded:', outputUrl)

    // Save render record
    console.log('📤 [RENDER/FINAL] Saving render record...')
    await addDoc(collection(db, 'renders'), {
      templateId,
      variant,
      fields,
      status: 'completed',
      outputUrl,
      createdAt: new Date(),
    })
    console.log('✅ [RENDER/FINAL] Render record saved')

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
    console.error('❌ [RENDER/FINAL] Error:', errorDetails)
    
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

