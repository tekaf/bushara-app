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
    const rawLine = lines[i]
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx < 0) continue
    const key = line.slice(0, idx).trim()
    let value = line.slice(idx + 1).trim()

    // Handle multiline quoted values in .env
    const startsWithDouble = value.startsWith('"')
    const startsWithSingle = value.startsWith("'")
    if (startsWithDouble || startsWithSingle) {
      const quote = startsWithDouble ? '"' : "'"
      while (!value.endsWith(quote) && i < lines.length - 1) {
        i += 1
        value += `\n${lines[i]}`
      }
      if (value.startsWith(quote) && value.endsWith(quote)) {
        value = value.slice(1, -1)
      }
    }
    value = value.replace(/\\n/g, '\n')
    env[key] = value
  }
  return env
}

function setEnvFromLocalFile() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error('.env.local not found')
  }
  const env = parseEnvFile(fs.readFileSync(ENV_PATH, 'utf8'))
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function makeResult(id, name) {
  return { id, name, status: 'FAIL', details: '', reason: '', fix: '' }
}

async function ensureServerUp() {
  for (let i = 0; i < 30; i += 1) {
    try {
      const res = await fetch(`${BASE_URL}/`)
      if (res.ok) return true
    } catch {
      // retry
    }
    await sleep(1000)
  }
  return false
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
    if (!up.ok) {
      throw new Error(`Auth failed for ${email}: ${JSON.stringify(up.data)}`)
    }
    auth = await doReq(signInUrl, { email, password, returnSecureToken: true })
    if (!auth.ok) throw new Error(`Sign-in failed for ${email}: ${JSON.stringify(auth.data)}`)
  }

  return {
    idToken: String(auth.data.idToken || ''),
    uid: String(auth.data.localId || ''),
    email,
  }
}

async function authedFetch(method, url, token, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  return { status: res.status, ok: res.ok, data }
}

function initAdmin() {
  const service = process.env.FIREBASE_SERVICE_ACCOUNT_KEY
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  if (!service) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing')
  if (!projectId) throw new Error('NEXT_PUBLIC_FIREBASE_PROJECT_ID missing')
  let serviceObj
  try {
    serviceObj = JSON.parse(service)
  } catch {
    // Some .env variants store private_key with raw newlines that break JSON.parse.
    const fixed = service.replace(/"private_key"\s*:\s*"([\s\S]*?)"/m, (_, keyValue) => {
      const escaped = keyValue.replace(/\r?\n/g, '\\n')
      return `"private_key":"${escaped}"`
    })
    serviceObj = JSON.parse(fixed)
  }
  if (!getApps().length) {
    initializeApp({
      credential: cert(serviceObj),
      projectId,
    })
  }
  return getFirestore()
}

async function createInvite(db, ownerId, fields = {}) {
  const ref = db.collection('invites').doc()
  const invite = {
    ownerId,
    title: `Phase1 Test Invite ${Date.now()}`,
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
    orderNumber: `BSH-T-${Math.floor(Math.random() * 1000000)}`,
    selectedOccasion: 'wedding',
    status: 'paid',
    paymentStatus: 'paid',
    inviteLockedAfterPayment: true,
    adminPreviewUrl: 'https://example.com/admin-preview.png',
    inviteImageUrl: 'https://example.com/admin-preview.png',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    ...fields,
  }
  await ref.set(invite, { merge: true })
  return ref.id
}

async function run() {
  setEnvFromLocalFile()
  const results = []
  const now = Date.now()
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY missing')

  const serverUp = await ensureServerUp()
  if (!serverUp) throw new Error('Local server is not reachable on http://localhost:3000')

  const db = initAdmin()
  const customerEmail = `phase1.customer.${now}@example.com`
  const adminEmail = 'phase1.admin@bushara.app'
  const password = 'Phase1-Test-12345!'

  const customer = await firebaseAuthSign(customerEmail, password, apiKey)
  const admin = await firebaseAuthSign(adminEmail, password, apiKey)

  await db.collection('users').doc(customer.uid).set(
    {
      name: 'Phase1 Customer',
      email: customer.email,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )
  await db.collection('users').doc(admin.uid).set(
    {
      name: 'Phase1 Admin',
      email: admin.email,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  // AC-01
  {
    const row = makeResult('AC-01', 'New invite enters workshop after payment event')
    const inviteId = await createInvite(db, customer.uid)
    const enter = await authedFetch('POST', `${BASE_URL}/api/workshop/enter`, customer.idToken, { inviteId })
    const inviteSnap = await db.collection('invites').doc(inviteId).get()
    const invite = inviteSnap.data() || {}
    const internalSnap = await db.collection('invitation_internal').doc(inviteId).get()
    const internal = internalSnap.exists ? internalSnap.data() || {} : {}
    if (
      enter.ok &&
      invite.workflowStatus === 'in_workshop_review' &&
      invite.reviewStatus === 'pending' &&
      typeof internal.adminPreviewUrl === 'string' &&
      internal.adminPreviewUrl.length > 0 &&
      !invite.previewUrl &&
      !invite.finalUrl &&
      !invite.inviteImageUrl &&
      !invite.adminPreviewUrl
    ) {
      row.status = 'PASS'
      row.details = `inviteId=${inviteId}, workflowStatus=${invite.workflowStatus}, reviewStatus=${invite.reviewStatus}, internalPreview=present`
    } else {
      row.status = 'FAIL'
      row.details = `enterStatus=${enter.status}, workflowStatus=${invite.workflowStatus}, reviewStatus=${invite.reviewStatus}, internalPreview=${Boolean(internal.adminPreviewUrl)}`
      row.reason = 'Workshop transition failed or required fields missing.'
      row.fix = 'Validate /api/workshop/enter transition and persistence.'
    }
    results.push(row)
    globalThis.__ac01_invite = inviteId
  }

  // UI checks for AC-02/AC-03
  {
    const row = makeResult('AC-02/AC-03-UI', 'UI block checks: guests blocked + preview hidden message')
    const inviteId = globalThis.__ac01_invite
    let browser
    try {
      browser = await playwright.chromium.launch({
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
      })
      const context = await browser.newContext()
      const page = await context.newPage()

      await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' })
      await page.fill('#email', customer.email)
      await page.fill('#password', password)
      await page.click('button[type="submit"]')
      await page.waitForURL(/\/dashboard/, { timeout: 60000 })

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
          JSON.stringify({
            templateId,
            inviteId,
          })
        )
        window.sessionStorage.setItem('bushara_current_invite_id', inviteId)
        window.sessionStorage.setItem(`bushara_active_invite_id:${templateId}`, inviteId)
      }, { inviteId })

      await page.goto(`${BASE_URL}/guests?templateId=test-template&invId=${inviteId}`, {
        waitUntil: 'networkidle',
      })
      await page.waitForTimeout(2500)
      const afterGuestsUrl = page.url()

      await page.goto(`${BASE_URL}/dashboard/invites/${inviteId}`, { waitUntil: 'networkidle' })
      const bodyText = await page.textContent('body')
      const previewBlockedMessage = (bodyText || '').includes('لن تظهر المعاينة')
      const guestsBlockedByUi = afterGuestsUrl.includes(`/dashboard/invites/${inviteId}/workshop-status`)

      if (previewBlockedMessage && guestsBlockedByUi) {
        row.status = 'PASS'
        row.details = `guestsUrl=${afterGuestsUrl}`
      } else {
        row.status = 'FAIL'
        row.details = `guestsBlockedByUi=${guestsBlockedByUi}, previewBlockedMessage=${previewBlockedMessage}, guestsUrl=${afterGuestsUrl}`
        row.reason = 'UI-level block is incomplete for guests or preview messaging.'
        row.fix = 'Ensure guests page redirects to workshop-status before approved and invite detail always shows preview-block message.'
      }
    } catch (error) {
      row.status = 'FAIL'
      row.details = `UI automation error: ${error?.message || String(error)}`
      row.reason = 'Could not complete UI automation path on current environment.'
      row.fix = 'Validate login route/selectors and keep browser executable accessible for automation.'
    } finally {
      if (browser) await browser.close()
    }
    results.push(row)
  }

  // AC-02
  {
    const row = makeResult('AC-02', 'Guests blocked before approved on API level')
    const inviteId = globalThis.__ac01_invite
    const g1 = await authedFetch('GET', `${BASE_URL}/api/user/invitations/${inviteId}/guests`, customer.idToken)
    const g2 = await authedFetch(
      'POST',
      `${BASE_URL}/api/user/invitations/${inviteId}/guests`,
      customer.idToken,
      { guests: [{ phoneLocal: '0500000000', phoneE164: '+966500000000', name: 'A' }] }
    )
    if (g1.status === 409 && g2.status === 409) {
      row.status = 'PASS'
      row.details = `GET=${g1.status}, POST=${g2.status}`
    } else {
      row.status = 'FAIL'
      row.details = `GET=${g1.status}, POST=${g2.status}`
      row.reason = 'Guests API is not fully guarded before approval.'
      row.fix = 'Ensure guests GET/POST/PATCH/DELETE reject non-approved workflow with 409.'
    }
    results.push(row)
  }

  // AC-03
  {
    const row = makeResult('AC-03', 'User preview blocked before approved (all user paths)')
    const inviteId = globalThis.__ac01_invite
    const inviteSnap = await db.collection('invites').doc(inviteId).get()
    const invite = inviteSnap.data() || {}
    const hasUserVisiblePreviewBeforeApprove =
      Boolean(invite.previewUrl) || Boolean(invite.finalUrl) || Boolean(invite.inviteImageUrl)
    if (!hasUserVisiblePreviewBeforeApprove) {
      row.status = 'PASS'
      row.details = 'Preview fields are hidden from invite record before approval.'
    } else {
      row.status = 'FAIL'
      row.details = `previewUrl=${Boolean(invite.previewUrl)}, finalUrl=${Boolean(invite.finalUrl)}, inviteImageUrl=${Boolean(invite.inviteImageUrl)}`
      row.reason = 'User-visible preview URLs still exist on invite before approval.'
      row.fix = 'Keep preview URLs internal-only until approve endpoint promotes them.'
    }
    results.push(row)
  }

  // AC-04 + AC-07 (queue + email payload/deep link)
  {
    const row = makeResult('AC-04/AC-07', 'Admin queue + notification payload with deep link')
    const inviteId = globalThis.__ac01_invite
    const queue = await authedFetch('GET', `${BASE_URL}/api/admin/invitations/review`, admin.idToken)
    const inQueue = Array.isArray(queue.data?.invites) && queue.data.invites.some((x) => x.id === inviteId)

    const notifSnap = await db
      .collection('admin_notifications')
      .where('inviteId', '==', inviteId)
      .limit(1)
      .get()
    const notif = notifSnap.empty ? null : notifSnap.docs[0].data()
    const deepLinkOk =
      typeof notif?.reviewUrl === 'string' && notif.reviewUrl.endsWith(`/admin/invitations/review/${inviteId}`)
    const payloadOk =
      !!notif?.orderNumber && !!notif?.customerName && !!notif?.occasionType && !!notif?.reviewUrl

    if (queue.ok && inQueue && payloadOk && deepLinkOk) {
      row.status = 'PASS'
      row.details = `queueStatus=${queue.status}, emailDelivered=${String(notif?.emailDelivered)}`
      if (!notif?.emailDelivered) {
        row.details += ' (delivery skipped due provider config)'
      }
    } else {
      row.status = 'FAIL'
      row.details = `queueStatus=${queue.status}, inQueue=${inQueue}, payloadOk=${payloadOk}, deepLinkOk=${deepLinkOk}`
      row.reason = 'Admin queue or notification payload/deep-link is incomplete.'
      row.fix = 'Verify queue query and admin_notifications payload generation in workshop enter flow.'
    }
    results.push(row)
  }

  // AC-05
  {
    const row = makeResult('AC-05', 'Admin approve unlocks guests flow')
    const inviteId = globalThis.__ac01_invite
    const approve = await authedFetch(
      'POST',
      `${BASE_URL}/api/admin/invitations/review/${inviteId}/approve`,
      admin.idToken,
      { notes: 'Approved in test run' }
    )
    const g1 = await authedFetch('GET', `${BASE_URL}/api/user/invitations/${inviteId}/guests`, customer.idToken)
    const g2 = await authedFetch(
      'POST',
      `${BASE_URL}/api/user/invitations/${inviteId}/guests`,
      customer.idToken,
      { guests: [{ phoneLocal: '0500000001', phoneE164: '+966500000001', name: 'After Approve' }] }
    )
    if (approve.ok && g1.ok && g2.ok) {
      row.status = 'PASS'
      row.details = `approve=${approve.status}, GET=${g1.status}, POST=${g2.status}`
    } else {
      row.status = 'FAIL'
      row.details = `approve=${approve.status}, GET=${g1.status}, POST=${g2.status}`
      row.reason = 'Guests flow did not unlock after approval.'
      row.fix = 'Ensure approve endpoint writes workflowStatus=approved and guests APIs honor it.'
    }
    results.push(row)
  }

  // AC-06
  {
    const row = makeResult('AC-06', 'Return for correction blocks guests again')
    const inviteId = await createInvite(db, customer.uid, { orderNumber: `BSH-R-${Math.floor(Math.random() * 1e6)}` })
    await authedFetch('POST', `${BASE_URL}/api/workshop/enter`, customer.idToken, { inviteId })
    const ret = await authedFetch(
      'POST',
      `${BASE_URL}/api/admin/invitations/review/${inviteId}/return`,
      admin.idToken,
      { reason: 'Needs corrections' }
    )
    const g = await authedFetch('GET', `${BASE_URL}/api/user/invitations/${inviteId}/guests`, customer.idToken)
    if (ret.ok && g.status === 409) {
      row.status = 'PASS'
      row.details = `return=${ret.status}, guestsGET=${g.status}`
    } else {
      row.status = 'FAIL'
      row.details = `return=${ret.status}, guestsGET=${g.status}`
      row.reason = 'Return-for-correction did not re-block guests access.'
      row.fix = 'Ensure returned status is needs_customer_update and guests API checks it.'
    }
    results.push(row)
  }

  // AC-08
  {
    const row = makeResult('AC-08', 'Legacy invite compatibility')
    const inviteId = await createInvite(db, customer.uid, {
      workflowStatus: FieldValue.delete(),
      reviewStatus: FieldValue.delete(),
      status: 'paid',
      paymentStatus: 'paid',
      inviteLockedAfterPayment: true,
    })
    const g = await authedFetch('GET', `${BASE_URL}/api/user/invitations/${inviteId}/guests`, customer.idToken)
    if (g.ok) {
      row.status = 'PASS'
      row.details = `legacy guests GET=${g.status}`
    } else {
      row.status = 'FAIL'
      row.details = `legacy guests GET=${g.status}`
      row.reason = 'Legacy fallback failed for old paid invites without workflowStatus.'
      row.fix = 'Keep backward-compatible checks for paid legacy invites.'
    }
    results.push(row)
  }

  const outDir = path.join(ROOT, 'docs')
  const outPath = path.join(outDir, 'PHASE1_WORKSHOP_TEST_RUN_REPORT.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        credentials: { customerEmail },
        results,
      },
      null,
      2
    )
  )

  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  console.log(`Phase 1 test run completed. PASS=${pass}, FAIL=${fail}`)
  console.log(`Report: ${outPath}`)
}

run().catch((error) => {
  console.error('Phase 1 test run failed:', error)
  process.exit(1)
})

