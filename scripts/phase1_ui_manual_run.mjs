import fs from 'node:fs'
import path from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import playwright from 'playwright-core'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env.local')
const BASE_URL = 'http://localhost:3000'
const SCREEN_DIR = path.join(ROOT, 'docs', 'artifacts', 'phase1-ui')

function parseEnvFile(content) {
  const env = {}
  const lines = content.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i]
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()
    const dq = value.startsWith('"')
    const sq = value.startsWith("'")
    if (dq || sq) {
      const quote = dq ? '"' : "'"
      while (!value.endsWith(quote) && i < lines.length - 1) {
        i += 1
        value += `\n${lines[i]}`
      }
      if (value.startsWith(quote) && value.endsWith(quote)) value = value.slice(1, -1)
    }
    env[key] = value.replace(/\\n/g, '\n')
  }
  return env
}

function setEnv() {
  if (!fs.existsSync(ENV_PATH)) throw new Error('.env.local not found')
  const env = parseEnvFile(fs.readFileSync(ENV_PATH, 'utf8'))
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v
  }
}

function initAdmin() {
  const service = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!service || !projectId) throw new Error('Missing Firebase admin env')
  let serviceObj
  try {
    serviceObj = JSON.parse(service)
  } catch {
    const fixed = service.replace(/"private_key"\s*:\s*"([\s\S]*?)"/m, (_, keyValue) => {
      const escaped = keyValue.replace(/\r?\n/g, '\\n')
      return `"private_key":"${escaped}"`
    })
    serviceObj = JSON.parse(fixed)
  }
  if (!getApps().length) {
    initializeApp({ credential: cert(serviceObj), projectId })
  }
  return getFirestore()
}

async function firebaseAuthSignIn(email, password, apiKey) {
  const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`
  const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`
  const post = async (url, payload) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }

  let signIn = await post(signInUrl, { email, password, returnSecureToken: true })
  if (!signIn.ok) {
    const signUp = await post(signUpUrl, { email, password, returnSecureToken: true })
    if (!signUp.ok) throw new Error(`Auth failed: ${JSON.stringify(signUp.data)}`)
    signIn = await post(signInUrl, { email, password, returnSecureToken: true })
    if (!signIn.ok) throw new Error(`Sign in failed: ${JSON.stringify(signIn.data)}`)
  }
  return {
    uid: String(signIn.data.localId || ''),
    idToken: String(signIn.data.idToken || ''),
  }
}

async function ensureServer() {
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`${BASE_URL}/`)
      if (res.ok) return
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('Server is not ready on localhost:3000')
}

async function createInReviewInvite(db, ownerId) {
  const inviteId = db.collection('invites').doc().id
  await db.collection('invites').doc(inviteId).set({
    ownerId,
    title: `Manual UI Test ${Date.now()}`,
    groomName: 'سعود',
    brideName: 'هاجر',
    selectedOccasion: 'wedding',
    status: 'paid',
    paymentStatus: 'paid',
    inviteLockedAfterPayment: true,
    workflowStatus: 'in_workshop_review',
    reviewStatus: 'pending',
    orderNumber: `BSH-UI-${Math.floor(Math.random() * 1e6)}`,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    previewUrl: FieldValue.delete(),
    finalUrl: FieldValue.delete(),
    inviteImageUrl: FieldValue.delete(),
    adminPreviewUrl: FieldValue.delete(),
  }, { merge: true })

  await db.collection('invitation_internal').doc(inviteId).set({
    adminPreviewUrl: 'https://example.com/internal-admin-preview.png',
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  return inviteId
}

async function run() {
  setEnv()
  await ensureServer()
  fs.mkdirSync(SCREEN_DIR, { recursive: true })

  const db = initAdmin()
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ''
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY missing')
  const email = `phase1.ui.manual.${Date.now()}@example.com`
  const password = 'Phase1-Test-12345!'
  const auth = await firebaseAuthSignIn(email, password, apiKey)

  await db.collection('users').doc(auth.uid).set({
    name: 'Phase1 UI Manual User',
    email,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true })

  const inviteId = await createInReviewInvite(db, auth.uid)

  const browser = await playwright.chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    inviteId,
    userEmail: email,
    steps: [],
    verdicts: {
      guestsBlockedOnUI: false,
      previewBlockedOnUI: false,
    },
  }

  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' })
    await page.fill('#email', email)
    await page.fill('#password', password)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/dashboard/, { timeout: 120000 })
    const s1 = path.join(SCREEN_DIR, '01-login-success.png')
    await page.screenshot({ path: s1, fullPage: true })
    report.steps.push({ step: 'login', result: 'ok', screenshot: s1, url: page.url() })

    await page.evaluate(({ inviteId }) => {
      const templateId = 'test-template'
      window.sessionStorage.setItem(
        'bushara_checkout_draft',
        JSON.stringify({
          templateId,
          packageGuests: '50',
          packagePrice: '299',
          selectedOccasion: 'wedding',
          formData: {},
        })
      )
      window.sessionStorage.setItem(
        'bushara_payment_status',
        JSON.stringify({ templateId, inviteId })
      )
      window.sessionStorage.setItem('bushara_current_invite_id', inviteId)
      window.sessionStorage.setItem(`bushara_active_invite_id:${templateId}`, inviteId)
    }, { inviteId })

    await page.goto(`${BASE_URL}/guests?templateId=test-template&invId=${inviteId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    await page.waitForTimeout(4500)
    const s2 = path.join(SCREEN_DIR, '02-guests-blocked-redirect.png')
    await page.screenshot({ path: s2, fullPage: true })
    const guestsUrl = page.url()
    const guestsBlocked = guestsUrl.includes(`/dashboard/invites/${inviteId}/workshop-status`)
    report.verdicts.guestsBlockedOnUI = guestsBlocked
    report.steps.push({
      step: 'guests-block-check',
      result: guestsBlocked ? 'ok' : 'failed',
      screenshot: s2,
      url: guestsUrl,
    })

    await page.goto(`${BASE_URL}/dashboard/invites/${inviteId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 120000,
    })
    await page.waitForTimeout(1500)
    const body = await page.textContent('body')
    const previewBlocked = (body || '').includes('لن تظهر المعاينة')
    const s3 = path.join(SCREEN_DIR, '03-preview-block-message.png')
    await page.screenshot({ path: s3, fullPage: true })
    report.verdicts.previewBlockedOnUI = previewBlocked
    report.steps.push({
      step: 'preview-block-check',
      result: previewBlocked ? 'ok' : 'failed',
      screenshot: s3,
      url: page.url(),
    })
  } finally {
    await browser.close()
  }

  const out = path.join(ROOT, 'docs', 'PHASE1_UI_MANUAL_TEST_RUN.json')
  fs.writeFileSync(out, JSON.stringify(report, null, 2))
  console.log(`Manual UI run completed: ${out}`)
}

run().catch((error) => {
  console.error('Manual UI run failed:', error)
  process.exit(1)
})

