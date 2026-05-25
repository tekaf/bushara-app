import './chromium-env'

import { existsSync, rmSync } from 'fs'
import path from 'path'
import chromium from '@sparticuz/chromium-min'
import puppeteer, { type Browser } from 'puppeteer-core'

/** Full Chromium pack with shared libs (libnss3, etc.) for Vercel/Lambda. */
const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_REMOTE_PACK_URL ||
  'https://github.com/Sparticuz/chromium/releases/download/v131.0.0/chromium-v131.0.0-pack.tar'

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
  return existsSync('/tmp/al2023/lib/libnss3.so') || existsSync('/tmp/al2/lib/libnss3.so')
}

/** Wipe cached binaries so sparticuz re-extracts libs (fixes libnss3 on warm lambdas). */
function resetServerlessChromiumCache() {
  const targets = ['/tmp/chromium', '/tmp/al2023', '/tmp/al2', '/tmp/fonts', '/tmp/chromium-pack']
  for (const target of targets) {
    try {
      rmSync(target, { recursive: true, force: true })
    } catch {
      // ignore
    }
  }
}

function prepareServerlessChromiumEnv() {
  if (!isServerlessRuntime()) return
  resetServerlessChromiumCache()
  appendLdLibraryPath('/tmp/al2023/lib')
  appendLdLibraryPath('/tmp/al2/lib')
  process.env.FONTCONFIG_PATH ??= '/tmp/fonts'
}

async function resolveChromiumExecutablePath(): Promise<string> {
  if (isServerlessRuntime()) {
    return chromium.executablePath(CHROMIUM_PACK_URL)
  }
  return chromium.executablePath()
}

export async function launchServerlessBrowser(): Promise<Browser> {
  if (!isServerlessRuntime() && cachedBrowser?.connected) {
    return cachedBrowser
  }

  prepareServerlessChromiumEnv()

  try {
    const executablePath = await resolveChromiumExecutablePath()
    appendLdLibraryPath('/tmp/al2023/lib')
    appendLdLibraryPath('/tmp/al2/lib')
    appendLdLibraryPath(path.dirname(executablePath))

    if (isServerlessRuntime() && !chromiumSharedLibsReady()) {
      throw new Error(
        'Chromium shared libraries missing after extract. Set AWS_LAMBDA_JS_RUNTIME=nodejs20.x and redeploy.'
      )
    }

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
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
      throw new Error(`Failed to launch serverless Chromium (puppeteer): ${message}`)
    }

    cachedBrowser = await puppeteer.launch({ headless: true })
    return cachedBrowser
  }
}

export async function closeServerlessBrowser(browser: Browser | null | undefined) {
  if (!browser) return
  try {
    await browser.close()
  } catch {
    // ignore
  }
  if (isServerlessRuntime() || cachedBrowser === browser) {
    cachedBrowser = null
  }
}
