import fs from 'node:fs'
import path from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import playwright from 'playwright-core'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env.local')
const BASE_URL = 'http://localhost:3000'
const ARTIFACTS_DIR = path.join(ROOT, 'docs', 'artifacts', 'phase2-ui-manual')

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

async function ensureServerUp() {
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`${BASE_URL}/`)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 1000))
  }
  throw new Error('Server is not reachable on localhost:3000')
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

async function firebaseAuthSign(email, password, apiKey) {
  const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`
  const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`
  const doReq = async (url, payload) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json().catch(() => ({}))
    return { ok: res.ok, data }
  }
  let auth = await doReq(signInUrl, { email, password, returnSecureToken: true })
  if (!auth.ok) {
    const up = await doReq(signUpUrl, { email, password, returnSecureToken: true })
    if (!up.ok) throw new Error(`Auth failed for ${email}: ${JSON.stringify(up.data)}`)
    auth = await doReq(signInUrl, { email, password, returnSecureToken: true })
    if (!auth.ok) throw new Error(`Sign in failed for ${email}: ${JSON.stringify(auth.data)}`)
  }
  return {
    uid: String(auth.data.localId || ''),
    idToken: String(auth.data.idToken || ''),
    email,
  }
}

async function seedUiInvite(db, ownerId) {
  const inviteRef = db.collection('invites').doc()
  await inviteRef.set({
    ownerId,
    title: `Phase2 UI Manual ${Date.now()}`,
    groomName: 'سعود',
    brideName: 'هاجر',
    date: '2027-03-15',
    time: '8:00 م',
    locationName: 'قاعة الاختبار',
    designId: 'test-template',
    packageId: '50',
    packageGuests: 50,
    guestLimit: 50,
    packagePrice: 299,
    status: 'paid',
    paymentStatus: 'paid',
    inviteLockedAfterPayment: true,
    workflowStatus: 'partially_sent',
    reviewStatus: 'approved',
    timezone: 'Asia/Riyadh',
    sendStatusSummary: { total: 4, pending: 0, sent: 3, failed: 1 },
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const guests = [
    { phoneE164: '+966500000001', phoneLocal: '0500000001', name: 'Sent 1', sendStatus: 'sent', sendAttemptCount: 1 },
    { phoneE164: '+966500000002', phoneLocal: '0500000002', name: 'Failed 1', sendStatus: 'failed', sendAttemptCount: 3, lastSendError: 'Recipient is invalid (mock permanent).' },
    { phoneE164: '+966500000003', phoneLocal: '0500000003', name: 'Sent 2', sendStatus: 'sent', sendAttemptCount: 3 },
    { phoneE164: '+966500000004', phoneLocal: '0500000004', name: 'Sent 3', sendStatus: 'sent', sendAttemptCount: 3 },
  ]
  const batch = db.batch()
  guests.forEach((g) => {
    const ref = inviteRef.collection('guests').doc()
    batch.set(ref, {
      ...g,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  })
  await batch.commit()
  return inviteRef.id
}

async function run() {
  setEnv()
  await ensureServerUp()
  fs.mkdirSync(ARTIFACTS_DIR, { recursive: true })

  const db = initAdmin()
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY || ''
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY missing')
  const email = `phase2.ui.manual.${Date.now()}@example.com`
  const password = 'Phase2-Ui-Manual-12345!'
  const auth = await firebaseAuthSign(email, password, apiKey)

  await db.collection('users').doc(auth.uid).set(
    {
      name: 'Phase2 UI Manual User',
      email,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  const inviteId = await seedUiInvite(db, auth.uid)
  const report = {
    generatedAt: new Date().toISOString(),
    inviteId,
    userEmail: email,
    steps: [],
    verdicts: {
      ac10MonitoringUi: false,
      ac11RetryUi: false,
    },
  }

  const browser = await playwright.chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: true,
  })
  try {
    const page = await browser.newPage()

    let loginDone = false
    let lastLoginError = ''
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
      await page.fill('#email', email)
      await page.fill('#password', password)
      await page.click('button[type="submit"]')
      try {
        await page.waitForURL(/\/dashboard/, { timeout: 60000 })
        loginDone = true
        break
      } catch (error) {
        lastLoginError = String(error?.message || error)
      }
    }
    if (!loginDone) {
      throw new Error(`Login automation failed after retries: ${lastLoginError}`)
    }

    const s1 = path.join(ARTIFACTS_DIR, '01-auth-bootstrap-success.png')
    await page.screenshot({ path: s1, fullPage: true })
    report.steps.push({ step: 'login', result: 'ok', screenshot: s1, url: page.url() })

    await page.goto(`${BASE_URL}/dashboard/invites/${inviteId}`, { waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () => document.body.innerText.includes('مراقبة الإرسال (Phase 2)'),
      { timeout: 60000 }
    )
    await page.waitForFunction(
      () => {
        const t = document.body.innerText
        return t.includes('Total') && t.includes('Sent') && t.includes('Failed')
      },
      { timeout: 60000 }
    )
    const body = (await page.textContent('body')) || ''
    const hasMonitoringPanel =
      body.includes('مراقبة الإرسال (Phase 2)') &&
      body.includes('Total') &&
      body.includes('Sent') &&
      body.includes('Failed') &&
      body.includes('In Progress') &&
      body.includes('Pending')
    report.verdicts.ac10MonitoringUi = hasMonitoringPanel
    const s2 = path.join(ARTIFACTS_DIR, '02-monitoring-panel.png')
    await page.screenshot({ path: s2, fullPage: true })
    report.steps.push({
      step: 'ac10-monitoring-ui',
      result: hasMonitoringPanel ? 'ok' : 'failed',
      screenshot: s2,
      url: page.url(),
    })

    const retryButton = page.getByRole('button', { name: 'إعادة إرسال الفاشلين' })
    await page.waitForFunction(
      () => document.body.innerText.includes('إعادة إرسال الفاشلين'),
      { timeout: 60000 }
    )
    const retryVisible = await retryButton.isVisible().catch(() => false)
    if (retryVisible) {
      page.once('dialog', async (dialog) => dialog.accept())
      await retryButton.click()
      await page.waitForFunction(
        () =>
          document.body.innerText.includes('تمت إعادة جدولة الفاشلين بنجاح') ||
          document.body.innerText.includes('لا يمكن إعادة إرسال الفاشلين'),
        { timeout: 60000 }
      )
    }
    const bodyAfter = (await page.textContent('body')) || ''
    const retrySuccess = bodyAfter.includes('تمت إعادة جدولة الفاشلين بنجاح')
    const retryResultShown = retrySuccess || bodyAfter.includes('لا يمكن إعادة إرسال الفاشلين')
    report.verdicts.ac11RetryUi = retryVisible && retryResultShown

    const s3 = path.join(ARTIFACTS_DIR, '03-retry-action-result.png')
    await page.screenshot({ path: s3, fullPage: true })
    report.steps.push({
      step: 'ac11-retry-ui',
      result: report.verdicts.ac11RetryUi ? 'ok' : 'failed',
      screenshot: s3,
      url: page.url(),
      details: { retryVisible, retrySuccess, retryResultShown },
    })
  } finally {
    await browser.close()
  }

  const outPath = path.join(ROOT, 'docs', 'PHASE2_UI_MANUAL_TEST_RUN.json')
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`Phase 2 UI manual test completed: ${outPath}`)
}

run().catch((error) => {
  console.error('Phase 2 UI manual test failed:', error)
  process.exit(1)
})

