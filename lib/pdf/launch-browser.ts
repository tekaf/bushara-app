import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import chromium from '@sparticuz/chromium'
import { chromium as playwrightChromium, type Browser } from 'playwright-core'

let cachedBrowser: Browser | null = null

function isServerlessRuntime() {
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.AWS_EXECUTION_ENV)
}

function appendLdLibraryPath(baseLibPath: string) {
  if (!existsSync(baseLibPath)) return
  const current = process.env.LD_LIBRARY_PATH
  if (!current) {
    process.env.LD_LIBRARY_PATH = baseLibPath
    return
  }
  if (current.split(':').includes(baseLibPath)) return
  process.env.LD_LIBRARY_PATH = `${baseLibPath}:${current}`
}

function chromiumSharedLibsReady() {
  return (
    existsSync('/tmp/al2023/lib/libnss3.so') ||
    existsSync('/tmp/al2/lib/libnss3.so') ||
    existsSync(path.join(path.dirname('/tmp/chromium'), 'libnss3.so'))
  )
}

/** Vercel is not always detected at @sparticuz/chromium import time — configure libs before launch. */
function prepareServerlessChromiumEnv() {
  if (!isServerlessRuntime()) return

  process.env.AWS_LAMBDA_JS_RUNTIME ??= process.version.startsWith('v22') ? 'nodejs22.x' : 'nodejs20.x'
  process.env.FONTCONFIG_PATH ??= '/tmp/fonts'

  appendLdLibraryPath('/tmp/al2023/lib')
  appendLdLibraryPath('/tmp/al2/lib')

  const graphicsModeControl = (chromium as { setGraphicsMode?: boolean | ((enabled: boolean) => void) }).setGraphicsMode
  if (typeof graphicsModeControl === 'function') {
    graphicsModeControl(false)
  }

  // Stale /tmp/chromium from a prior run without shared libs breaks subsequent launches.
  if (existsSync('/tmp/chromium') && !chromiumSharedLibsReady()) {
    try {
      rmSync('/tmp/chromium', { force: true })
    } catch {
      // ignore cleanup errors
    }
  }
}

export async function launchServerlessBrowser(): Promise<Browser> {
  if (!isServerlessRuntime() && cachedBrowser?.isConnected()) {
    return cachedBrowser
  }

  prepareServerlessChromiumEnv()

  try {
    const executablePath = await chromium.executablePath()
    appendLdLibraryPath('/tmp/al2023/lib')
    appendLdLibraryPath('/tmp/al2/lib')
    appendLdLibraryPath(path.dirname(executablePath))

    if (isServerlessRuntime() && !chromiumSharedLibsReady()) {
      throw new Error(
        'Chromium shared libraries were not extracted. Set AWS_LAMBDA_JS_RUNTIME=nodejs20.x on Vercel and redeploy.'
      )
    }

    const browser = await playwrightChromium.launch({
      args: chromium.args,
      executablePath,
      headless: true,
    })

    if (!isServerlessRuntime()) {
      cachedBrowser = browser
    }
    return browser
  } catch (chromiumError: unknown) {
    const message = chromiumError instanceof Error ? chromiumError.message : String(chromiumError)
    if (isServerlessRuntime()) {
      throw new Error(`Failed to launch serverless Chromium: ${message}`)
    }

    cachedBrowser = await playwrightChromium.launch({ headless: true })
    return cachedBrowser
  }
}

export async function closeServerlessBrowser(browser: Browser | null | undefined) {
  if (!browser) return
  try {
    await browser.close()
  } catch {
    // ignore close errors on frozen serverless instances
  }
  if (isServerlessRuntime() || cachedBrowser === browser) {
    cachedBrowser = null
  }
}
