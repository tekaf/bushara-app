import chromium from '@sparticuz/chromium'
import { chromium as playwrightChromium, type Browser } from 'playwright-core'

let cachedBrowser: Browser | null = null

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
}

export async function launchServerlessBrowser(): Promise<Browser> {
  if (cachedBrowser?.isConnected()) return cachedBrowser

  if (isServerlessRuntime() && !process.env.AWS_LAMBDA_JS_RUNTIME) {
    process.env.AWS_LAMBDA_JS_RUNTIME = process.version.startsWith('v22') ? 'nodejs22.x' : 'nodejs20.x'
  }

  const graphicsModeControl = (chromium as { setGraphicsMode?: boolean | ((enabled: boolean) => void) }).setGraphicsMode
  if (typeof graphicsModeControl === 'function') {
    graphicsModeControl(false)
  } else if (typeof graphicsModeControl === 'boolean') {
    ;(chromium as { setGraphicsMode: boolean }).setGraphicsMode = false
  }

  try {
    const executablePath = await chromium.executablePath()
    cachedBrowser = await playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    })
    return cachedBrowser
  } catch (chromiumError: unknown) {
    const message = chromiumError instanceof Error ? chromiumError.message : String(chromiumError)
    if (isServerlessRuntime()) {
      throw new Error(`Failed to launch serverless Chromium: ${message}`)
    }

    cachedBrowser = await playwrightChromium.launch({ headless: true })
    return cachedBrowser
  }
}
