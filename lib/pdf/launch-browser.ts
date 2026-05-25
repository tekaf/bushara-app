import './chromium-env'

import { existsSync, rmSync } from 'fs'
import path from 'path'
import chromium from '@sparticuz/chromium'
import puppeteer, { type Browser } from 'puppeteer-core'

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

function clearStaleChromiumArtifacts() {
  if (!existsSync('/tmp/chromium')) return
  if (chromiumSharedLibsReady()) return
  try {
    rmSync('/tmp/chromium', { force: true })
    rmSync('/tmp/al2023', { recursive: true, force: true })
    rmSync('/tmp/al2', { recursive: true, force: true })
  } catch {
    // ignore cleanup errors
  }
}

function prepareServerlessChromiumEnv() {
  if (!isServerlessRuntime()) return
  clearStaleChromiumArtifacts()
  appendLdLibraryPath('/tmp/al2023/lib')
  appendLdLibraryPath('/tmp/al2/lib')
  process.env.FONTCONFIG_PATH ??= '/tmp/fonts'
}

export async function launchServerlessBrowser(): Promise<Browser> {
  if (!isServerlessRuntime() && cachedBrowser?.connected) {
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
        'Chromium libs missing on serverless. Add AWS_LAMBDA_JS_RUNTIME=nodejs20.x in Vercel env and redeploy.'
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
      throw new Error(`Failed to launch serverless Chromium: ${message}`)
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
    // ignore close errors on frozen serverless instances
  }
  if (isServerlessRuntime() || cachedBrowser === browser) {
    cachedBrowser = null
  }
}
