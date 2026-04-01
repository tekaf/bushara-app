import chromium from '@sparticuz/chromium'
import playwright from 'playwright-core'

const VIEWPORT_WIDTH = 1080
const VIEWPORT_HEIGHT = 1920
const DEVICE_SCALE_FACTOR = 3
const TARGET_WIDTH = VIEWPORT_WIDTH * DEVICE_SCALE_FACTOR
const TARGET_HEIGHT = VIEWPORT_HEIGHT * DEVICE_SCALE_FACTOR

function getPngDimensions(buffer: Buffer) {
  // PNG IHDR chunk stores width/height at bytes 16..23 (big-endian).
  if (buffer.length < 24 || buffer.toString('ascii', 1, 4) !== 'PNG') {
    throw new Error('Invalid PNG output from PDF conversion')
  }

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  }
}

async function launchBrowser() {
  try {
    const graphicsModeControl = (chromium as any).setGraphicsMode
    if (typeof graphicsModeControl === 'function') {
      graphicsModeControl(false)
    } else if (typeof graphicsModeControl === 'boolean') {
      ;(chromium as any).setGraphicsMode = false
    }
    const chromiumHeadless = chromium.headless === 'new' ? true : chromium.headless
    return await playwright.chromium.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: chromiumHeadless,
    })
  } catch (chromiumError: any) {
    console.warn(
      '⚠️ [PDF->PNG] Chromium bundle failed, falling back to system browser:',
      chromiumError?.message
    )
    return await playwright.chromium.launch({ headless: true })
  }
}

async function renderPdfBufferWithPdfJs(context: any, pdfBuffer: Buffer) {
  const page = await context.newPage()
  const pdfBase64 = pdfBuffer.toString('base64')

  const html = `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <style>
          html, body {
            margin: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            background: #fff;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          #pdf-canvas {
            width: ${VIEWPORT_WIDTH}px;
            height: ${VIEWPORT_HEIGHT}px;
            display: block;
          }
        </style>
      </head>
      <body data-render-status="loading">
        <canvas id="pdf-canvas" width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}"></canvas>
        <script type="module">
          import * as pdfjsLib from 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.mjs';
          pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.7.76/build/pdf.worker.mjs';

          try {
            const b64 = '${pdfBase64}';
            const binary = atob(b64);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

            const loadingTask = pdfjsLib.getDocument({ data: bytes });
            const pdf = await loadingTask.promise;
            const firstPage = await pdf.getPage(1);

            const canvas = document.getElementById('pdf-canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('2D context unavailable');

            const targetW = ${TARGET_WIDTH};
            const targetH = ${TARGET_HEIGHT};
            const baseViewport = firstPage.getViewport({ scale: 1 });
            const scale = Math.max(targetW / baseViewport.width, targetH / baseViewport.height);
            const scaledViewport = firstPage.getViewport({ scale });

            const offscreen = document.createElement('canvas');
            offscreen.width = Math.ceil(scaledViewport.width);
            offscreen.height = Math.ceil(scaledViewport.height);
            const offCtx = offscreen.getContext('2d');
            if (!offCtx) throw new Error('Offscreen 2D context unavailable');

            await firstPage.render({
              canvasContext: offCtx,
              viewport: scaledViewport
            }).promise;

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, targetW, targetH);
            const dx = Math.round((targetW - offscreen.width) / 2);
            const dy = Math.round((targetH - offscreen.height) / 2);
            ctx.drawImage(offscreen, dx, dy);

            document.body.setAttribute('data-render-status', 'done');
          } catch (err) {
            const message = err && err.message ? err.message : String(err);
            document.body.setAttribute('data-render-status', 'error');
            document.body.setAttribute('data-render-error', message);
          }
        </script>
      </body>
    </html>
  `

  await page.setContent(html, { waitUntil: 'networkidle' })
  await page.waitForFunction(
    () => {
      const status = document.body.getAttribute('data-render-status')
      return status === 'done' || status === 'error'
    },
    { timeout: 30000 }
  )

  const status = await page.evaluate(() => document.body.getAttribute('data-render-status'))
  if (status !== 'done') {
    const renderError = await page.evaluate(() => document.body.getAttribute('data-render-error'))
    throw new Error(`pdf.js render failed: ${renderError || 'unknown error'}`)
  }

  return (await page.screenshot({
    type: 'png',
    fullPage: false,
    clip: {
      x: 0,
      y: 0,
      width: VIEWPORT_WIDTH,
      height: VIEWPORT_HEIGHT,
    },
    scale: 'device',
  })) as Buffer
}

export async function convertPdfUrlToPng(pdfUrl: string) {
  const startedAt = Date.now()
  const browser = await launchBrowser()
  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  })

  try {
    try {
      const page = await context.newPage()
      await page.goto(pdfUrl, { waitUntil: 'networkidle' })
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(500)

      const pngBuffer = (await page.screenshot({
        type: 'png',
        fullPage: false,
        clip: {
          x: 0,
          y: 0,
          width: VIEWPORT_WIDTH,
          height: VIEWPORT_HEIGHT,
        },
        scale: 'device',
      })) as Buffer

      const dimensions = getPngDimensions(pngBuffer)
      if (dimensions.width !== TARGET_WIDTH || dimensions.height !== TARGET_HEIGHT) {
        throw new Error(
          `Converted PNG has invalid dimensions ${dimensions.width}x${dimensions.height}. Expected ${TARGET_WIDTH}x${TARGET_HEIGHT}`
        )
      }

      return {
        pngBuffer,
        dimensions,
        elapsedMs: Date.now() - startedAt,
      }
    } catch (playwrightError: any) {
      console.warn(
        '⚠️ [PDF->PNG] Direct PDF navigation failed; using pdf.js fallback:',
        playwrightError?.message
      )
      const pdfResponse = await fetch(pdfUrl)
      if (!pdfResponse.ok) {
        throw new Error(`Failed to download PDF for fallback conversion: ${pdfResponse.status}`)
      }
      const pdfArrayBuffer = await pdfResponse.arrayBuffer()
      const pdfBuffer = Buffer.from(pdfArrayBuffer)
      const pngBuffer = await renderPdfBufferWithPdfJs(context, pdfBuffer)

      const dimensions = getPngDimensions(pngBuffer)
      if (dimensions.width !== TARGET_WIDTH || dimensions.height !== TARGET_HEIGHT) {
        throw new Error(
          `Fallback PNG has invalid dimensions ${dimensions.width}x${dimensions.height}. Expected ${TARGET_WIDTH}x${TARGET_HEIGHT}`
        )
      }

      return {
        pngBuffer,
        dimensions,
        elapsedMs: Date.now() - startedAt,
      }
    }
  } finally {
    await context.close()
    await browser.close()
  }
}

export async function createThumbnailFromPngBuffer(pngBuffer: Buffer) {
  const startedAt = Date.now()
  const browser = await launchBrowser()
  const context = await browser.newContext({
    viewport: { width: 400, height: 600 },
    deviceScaleFactor: 1,
  })

  try {
    const page = await context.newPage()
    const base64 = pngBuffer.toString('base64')
    const html = `
      <!doctype html>
      <html>
      <head><meta charset="utf-8" /></head>
      <body style="margin:0;display:flex;align-items:center;justify-content:center;background:#fff;">
        <img src="data:image/png;base64,${base64}" style="width:100%;height:100%;object-fit:cover;" />
      </body>
      </html>
    `

    await page.setContent(html, { waitUntil: 'networkidle' })
    const thumbBuffer = (await page.screenshot({
      type: 'jpeg',
      quality: 85,
      fullPage: false,
      clip: { x: 0, y: 0, width: 400, height: 600 },
    })) as Buffer

    return {
      thumbBuffer,
      elapsedMs: Date.now() - startedAt,
    }
  } finally {
    await context.close()
    await browser.close()
  }
}
