import { NextRequest, NextResponse } from 'next/server'
import { doc, getDoc, collection, addDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
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

  chromium.setGraphicsMode(false)
  browser = await playwright.chromium.launch({
    args: chromium.args,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  })

  return browser
}

export async function POST(request: NextRequest) {
  try {
    const { templateId, variant, fields } = await request.json()

    if (!templateId || !fields) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Load template
    const templateDoc = await getDoc(doc(db, 'templates', templateId))
    if (!templateDoc.exists()) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const template = {
      id: templateDoc.id,
      ...templateDoc.data(),
    } as Template

    // Load preset
    const preset = getPreset(template.type)

    // Generate HTML
    const html = generateHTML(preset, template.assets.backgroundUrl, fields)

    // Render with Playwright
    const browserInstance = await getBrowser()
    const page = await browserInstance.newPage({
      viewport: { width: 1080, height: 1920 },
    })

    await page.setContent(html, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1000) // Wait for fonts to load

    const screenshot = await page.screenshot({
      type: 'png',
      fullPage: false,
    })

    await page.close()

    // Upload to Storage
    const renderId = crypto.randomUUID()
    const outputRef = ref(storage, `outputs/${renderId}/preview.png`)
    await uploadBytes(outputRef, screenshot as Buffer)
    const outputUrl = await getDownloadURL(outputRef)

    // Save render record
    await addDoc(collection(db, 'renders'), {
      templateId,
      variant,
      fields,
      status: 'completed',
      outputUrl,
      createdAt: new Date(),
    })

    return NextResponse.json({
      url: outputUrl,
      renderId,
    })
  } catch (error: any) {
    console.error('Render error:', error)
    return NextResponse.json(
      { error: error.message || 'Error rendering image' },
      { status: 500 }
    )
  }
}

