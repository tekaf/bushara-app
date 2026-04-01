import fs from 'node:fs'
import path from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import playwright from 'playwright-core'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env.local')
const BASE_URL = 'http://localhost:3000'

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function ensureServerUp() {
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`${BASE_URL}/`)
      if (res.ok) return true
    } catch {}
    await sleep(1000)
  }
  return false
}

function makeResult(id, name) {
  return { id, name, status: 'FAIL', details: '', reason: '', fix: '' }
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
  return { idToken: String(auth.data.idToken || ''), uid: String(auth.data.localId || ''), email }
}

async function authedFetch(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

async function cronFetch(method, url, secret, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, data }
}

async function createInvite(db, ownerId, fields = {}) {
  const ref = db.collection('invites').doc()
  await ref.set(
    {
      ownerId,
      title: `Phase2 Closure Invite ${Date.now()}`,
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
      orderNumber: `BSH-P2C-${Math.floor(Math.random() * 1e6)}`,
      selectedOccasion: 'wedding',
      status: 'paid',
      paymentStatus: 'paid',
      inviteLockedAfterPayment: true,
      workflowStatus: 'scheduled',
      reviewStatus: 'approved',
      timezone: 'Asia/Riyadh',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...fields,
    },
    { merge: true }
  )
  return ref.id
}

async function seedGuests(db, inviteId) {
  const inviteRef = db.collection('invites').doc(inviteId)
  const guests = [
    { name: 'Success', phoneE164: '+966500000001', phoneLocal: '0500000001' },
    { name: 'Permanent', phoneE164: '+966500000002', phoneLocal: '0500000002' },
    { name: 'Transient', phoneE164: '+966500000003', phoneLocal: '0500000003' },
    { name: 'Throttled', phoneE164: '+966500000004', phoneLocal: '0500000004' },
  ]
  const batch = db.batch()
  for (const g of guests) {
    const ref = inviteRef.collection('guests').doc()
    batch.set(ref, {
      ...g,
      status: 'pending',
      sendStatus: 'scheduled',
      sendAttemptCount: 0,
      lastSendError: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
  await batch.commit()
}

async function run() {
  setEnv()
  const results = []
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const cronSecret = process.env.CRON_SECRET
  if (!apiKey || !cronSecret) throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY or CRON_SECRET')
  if (!(await ensureServerUp())) throw new Error('Server not reachable on localhost:3000')

  const db = initAdmin()
  const now = Date.now()
  const email = `phase2.closure.${now}@example.com`
  const password = 'Phase2-Closure-12345!'
  const customer = await firebaseAuthSign(email, password, apiKey)
  await db.collection('users').doc(customer.uid).set(
    {
      name: 'Phase2 Closure Customer',
      email: customer.email,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  let inviteId = ''

  // P2-AC-05/06/07
  {
    const row = makeResult('P2-AC-05/06/07', 'Process job + provider mapping + auto retry behavior')
    inviteId = await createInvite(db, customer.uid, { scheduledSendAt: new Date(Date.now() - 1000) })
    await seedGuests(db, inviteId)
    const processOwner = `closure-process-${Date.now()}`
    const jobRef = db.collection('send_jobs').doc()
    await jobRef.set({
      inviteId,
      scheduledAt: new Date(Date.now() - 1000),
      status: 'dispatching',
      attempt: 0,
      lockOwner: processOwner,
      lockExpiresAt: new Date(Date.now() + 5 * 60 * 1000),
      lockedAt: new Date(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    const processRun = await cronFetch('POST', `${BASE_URL}/api/internal/send/process-job/${jobRef.id}`, cronSecret, {
      lockOwner: processOwner,
    })

    const guestsSnap = await db.collection('invites').doc(inviteId).collection('guests').get()
    const rows = guestsSnap.docs.map((d) => d.data())
    const byPhone = new Map(rows.map((r) => [String(r.phoneE164 || ''), r]))
    const logsSnap = await db.collection('send_logs').where('inviteId', '==', inviteId).get()
    const plainLogs = logsSnap.docs.length > 0
    const g1 = byPhone.get('+966500000001')
    const g2 = byPhone.get('+966500000002')
    const g3 = byPhone.get('+966500000003')
    const g4 = byPhone.get('+966500000004')
    const g2Attempt = Number(g2?.sendAttemptCount || 0)
    const g3Attempt = Number(g3?.sendAttemptCount || 0)
    const g4Attempt = Number(g4?.sendAttemptCount || 0)
    const ok =
      processRun.ok &&
      g1?.sendStatus === 'sent' &&
      g2?.sendStatus === 'failed' &&
      g3?.sendStatus === 'sent' &&
      g4?.sendStatus === 'sent' &&
      g2Attempt >= 1 &&
      g3Attempt >= 2 &&
      g4Attempt >= 2 &&
      plainLogs
    if (ok) {
      row.status = 'PASS'
      row.details = `process=${processRun.status}, logs=${logsSnap.size}, g2Attempt=${g2Attempt}, g3Attempt=${g3Attempt}, g4Attempt=${g4Attempt}`
    } else {
      row.details = `process=${processRun.status}, statuses=${[g1?.sendStatus, g2?.sendStatus, g3?.sendStatus, g4?.sendStatus].join(',')}, attempts=${[g2Attempt, g3Attempt, g4Attempt].join('/')}`
      row.reason = 'Process/retry behavior still not stable.'
      row.fix = 'Recheck WK-03 and send_logs serialization path.'
    }
    results.push(row)
  }

  // P2-AC-08
  {
    const row = makeResult('P2-AC-08', 'Manual retry failed via API-04')
    const retry = await authedFetch('POST', `${BASE_URL}/api/user/invitations/${inviteId}/retry-failed`, customer.idToken, {
      timezone: 'Asia/Riyadh',
      allowOverLimitManual: true,
    })
    const jobId = String(retry.data?.jobId || '')
    const jobSnap = jobId ? await db.collection('send_jobs').doc(jobId).get() : null
    if (retry.ok && Number(retry.data?.retryGuestsCount || 0) >= 1 && jobSnap?.data()?.status === 'scheduled') {
      row.status = 'PASS'
      row.details = `retryGuests=${retry.data?.retryGuestsCount}, job=${jobId}`
    } else {
      row.details = `status=${retry.status}, retryGuests=${retry.data?.retryGuestsCount}, jobStatus=${jobSnap?.data()?.status}`
      row.reason = 'Manual retry still failing.'
      row.fix = 'Review API-04 after process-job closure.'
    }
    results.push(row)
  }

  // P2-AC-09
  {
    const row = makeResult('P2-AC-09', 'Send-status API consistency')
    const status = await authedFetch('GET', `${BASE_URL}/api/user/invitations/${inviteId}/send-status`, customer.idToken)
    const s = status.data?.summary || {}
    const hasShape =
      typeof s.totalGuests === 'number' &&
      typeof s.sentGuests === 'number' &&
      typeof s.failedGuests === 'number' &&
      typeof s.inProgressGuests === 'number' &&
      typeof s.pendingGuests === 'number'
    if (status.ok && hasShape) {
      row.status = 'PASS'
      row.details = `total=${s.totalGuests}, sent=${s.sentGuests}, failed=${s.failedGuests}, active=${s.activeJobsCount}`
    } else {
      row.details = `status=${status.status}, summary=${JSON.stringify(s)}`
      row.reason = 'Send-status response shape is invalid.'
      row.fix = 'Review API-05 payload.'
    }
    results.push(row)
  }

  // P2-AC-10/11
  {
    const row = makeResult('P2-AC-10/11', 'Monitoring UI + Retry UI action')
    let browser
    try {
      browser = await playwright.chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
      })
      const page = await browser.newPage()
      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
      await page.fill('#email', customer.email)
      await page.fill('#password', password)
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 60000 })
      await page.goto(`${BASE_URL}/dashboard/invites/${inviteId}`, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(2000)
      const body = (await page.textContent('body')) || ''
      const hasPanel = body.includes('مراقبة الإرسال (Phase 2)')
      const retryVisible = await page.getByRole('button', { name: 'إعادة إرسال الفاشلين' }).isVisible().catch(() => false)
      if (retryVisible) {
        page.once('dialog', async (d) => d.accept())
        await page.getByRole('button', { name: 'إعادة إرسال الفاشلين' }).click()
        await page.waitForTimeout(2000)
      }
      const bodyAfter = (await page.textContent('body')) || ''
      const hasResult = bodyAfter.includes('تمت إعادة جدولة الفاشلين بنجاح') || bodyAfter.includes('لا يمكن إعادة إرسال الفاشلين')
      if (hasPanel && retryVisible && hasResult) {
        row.status = 'PASS'
        row.details = `panel=${hasPanel}, retryVisible=${retryVisible}, result=${hasResult}`
      } else {
        row.details = `panel=${hasPanel}, retryVisible=${retryVisible}, result=${hasResult}`
        row.reason = 'Monitoring/retry UI still not reflecting expected behavior.'
        row.fix = 'Recheck UI-03/UI-04 wiring with API-05/API-04.'
      }
    } catch (error) {
      row.details = `UI automation error: ${error?.message || String(error)}`
      row.reason = 'Could not complete UI closure check.'
      row.fix = 'Verify login automation/selectors.'
    } finally {
      if (browser) await browser.close()
    }
    results.push(row)
  }

  const outPath = path.join(ROOT, 'docs', 'PHASE2_FAILURE_CLOSURE_TEST_RUN_REPORT.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        providerMode: process.env.WHATSAPP_PROVIDER || 'unknown',
        credentials: { customerEmail: customer.email },
        results,
      },
      null,
      2
    )
  )
  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  console.log(`Phase 2 failure closure run completed. PASS=${pass}, FAIL=${fail}`)
  console.log(`Report: ${outPath}`)
}

run().catch((error) => {
  console.error('Phase 2 failure closure run failed:', error)
  process.exit(1)
})

