import './chromium-env'

import type { Browser, Page } from 'puppeteer-core'
import { closeServerlessBrowser, launchServerlessBrowser } from '@/lib/pdf/launch-browser'

export type HtmlScreenshotOptions = {
  width: number
  height: number
  deviceScaleFactor?: number
}

async function waitForRenderAssets(page: Page) {
  await page.waitForNetworkIdle({ idleTime: 500, timeout: 30000 }).catch(() => null)
  await page.evaluate(async () => {
    await document.fonts.ready
    const imgs = Array.from(document.images)
    await Promise.all(
      imgs.map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.onload = () => resolve()
              img.onerror = () => resolve()
            })
      )
    )
  })
}

export async function renderHtmlToPngBuffer(html: string, options: HtmlScreenshotOptions): Promise<Buffer> {
  let browser: Browser | null = null
  try {
    browser = await launchServerlessBrowser()
    const page = await browser.newPage()
    await page.setViewport({
      width: options.width,
      height: options.height,
      deviceScaleFactor: options.deviceScaleFactor ?? 1,
    })
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 })
    await waitForRenderAssets(page)

    const screenshot = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: options.width, height: options.height },
      omitBackground: false,
    })
    await page.close()
    return Buffer.from(screenshot as Uint8Array)
  } finally {
    await closeServerlessBrowser(browser)
  }
}
