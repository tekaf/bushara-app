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
  return { ok: res.ok, status: res.status, data }
}

async function cronFetch(method, url, secret, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
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
      title: `Phase2 Test Invite ${Date.now()}`,
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
      orderNumber: `BSH-P2-${Math.floor(Math.random() * 1e6)}`,
      selectedOccasion: 'wedding',
      status: 'paid',
      paymentStatus: 'paid',
      inviteLockedAfterPayment: true,
      workflowStatus: 'approved',
      reviewStatus: 'approved',
      timezone: 'Asia/Riyadh',
      sendStatusSummary: { total: 0, pending: 0, sent: 0, failed: 0 },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...fields,
    },
    { merge: true }
  )
  return ref.id
}

async function seedGuests(db, inviteId, guests) {
  const inviteRef = db.collection('invites').doc(inviteId)
  const batch = db.batch()
  for (const guest of guests) {
    const ref = inviteRef.collection('guests').doc()
    batch.set(ref, {
      name: guest.name,
      phoneE164: guest.phoneE164,
      phoneLocal: guest.phoneLocal,
      status: 'pending',
      sendStatus: guest.sendStatus || 'pending',
      sendAttemptCount: guest.sendAttemptCount || 0,
      lastSendAt: null,
      lastSendError: '',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }
  await batch.commit()
}

function futureIso(minutes = 10) {
  return new Date(Date.now() + minutes * 60 * 1000).toISOString()
}

async function run() {
  setEnv()
  const results = []
  const now = Date.now()
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY
  const cronSecret = process.env.CRON_SECRET || ''
  if (!apiKey) throw new Error('NEXT_PUBLIC_FIREBASE_API_KEY missing')
  if (!cronSecret) throw new Error('CRON_SECRET missing')
  const serverUp = await ensureServerUp()
  if (!serverUp) throw new Error('Server is not reachable on http://localhost:3000')

  const db = initAdmin()
  const customerEmail = `phase2.customer.${now}@example.com`
  const password = 'Phase2-Test-12345!'
  const customer = await firebaseAuthSign(customerEmail, password, apiKey)
  await db.collection('users').doc(customer.uid).set(
    {
      name: 'Phase2 Customer',
      email: customer.email,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  )

  // P2-AC-01 schedule success
  {
    const row = makeResult('P2-AC-01', 'Schedule send success')
    const inviteId = await createInvite(db, customer.uid, { workflowStatus: 'approved' })
    await seedGuests(db, inviteId, [
      { name: 'Guest A', phoneE164: '+966500000001', phoneLocal: '0500000001' },
    ])
    const res = await authedFetch(
      'POST',
      `${BASE_URL}/api/user/invitations/${inviteId}/schedule-send`,
      customer.idToken,
      { scheduledSendAt: futureIso(15), timezone: 'Asia/Riyadh' }
    )
    const invite = (await db.collection('invites').doc(inviteId).get()).data() || {}
    const jobs = await db.collection('send_jobs').where('inviteId', '==', inviteId).where('status', '==', 'scheduled').get()
    if (res.ok && invite.workflowStatus === 'scheduled' && !jobs.empty) {
      row.status = 'PASS'
      row.details = `jobId=${res.data?.jobId}, workflowStatus=${invite.workflowStatus}`
    } else {
      row.details = `status=${res.status}, workflow=${invite.workflowStatus}, jobs=${jobs.size}`
      row.reason = 'Schedule API did not create scheduled job or update workflow.'
      row.fix = 'Check API-01 validation and transaction writes.'
    }
    results.push(row)
    globalThis.__ac01_invite = inviteId
  }

  // P2-AC-02 schedule rejects invalid conditions
  {
    const row = makeResult('P2-AC-02', 'Schedule send rejects invalid preconditions')
    const checks = []
    const invitePast = await createInvite(db, customer.uid, { workflowStatus: 'approved' })
    await seedGuests(db, invitePast, [{ name: 'Past', phoneE164: '+966500000010', phoneLocal: '0500000010' }])
    checks.push((await authedFetch('POST', `${BASE_URL}/api/user/invitations/${invitePast}/schedule-send`, customer.idToken, {
      scheduledSendAt: new Date(Date.now() - 60_000).toISOString(),
      timezone: 'Asia/Riyadh',
    })).status === 409)

    const inviteNotPaid = await createInvite(db, customer.uid, { paymentStatus: 'pending', status: 'draft', workflowStatus: 'approved' })
    await seedGuests(db, inviteNotPaid, [{ name: 'NotPaid', phoneE164: '+966500000011', phoneLocal: '0500000011' }])
    checks.push((await authedFetch('POST', `${BASE_URL}/api/user/invitations/${inviteNotPaid}/schedule-send`, customer.idToken, {
      scheduledSendAt: futureIso(10), timezone: 'Asia/Riyadh',
    })).status === 409)

    const inviteWorkflow = await createInvite(db, customer.uid, { workflowStatus: 'in_workshop_review' })
    await seedGuests(db, inviteWorkflow, [{ name: 'WrongFlow', phoneE164: '+966500000012', phoneLocal: '0500000012' }])
    checks.push((await authedFetch('POST', `${BASE_URL}/api/user/invitations/${inviteWorkflow}/schedule-send`, customer.idToken, {
      scheduledSendAt: futureIso(10), timezone: 'Asia/Riyadh',
    })).status === 409)

    const inviteNoGuests = await createInvite(db, customer.uid, { workflowStatus: 'approved' })
    checks.push((await authedFetch('POST', `${BASE_URL}/api/user/invitations/${inviteNoGuests}/schedule-send`, customer.idToken, {
      scheduledSendAt: futureIso(10), timezone: 'Asia/Riyadh',
    })).status === 409)

    if (checks.every(Boolean)) {
      row.status = 'PASS'
      row.details = 'All invalid precondition checks returned rejection.'
    } else {
      row.details = `checks=${JSON.stringify(checks)}`
      row.reason = 'At least one invalid condition was accepted unexpectedly.'
      row.fix = 'Tighten API-01 guards.'
    }
    results.push(row)
  }

  // P2-AC-03 cancel schedule
  {
    const row = makeResult('P2-AC-03', 'Cancel schedule success before sending')
    const inviteId = await createInvite(db, customer.uid, { workflowStatus: 'approved' })
    await seedGuests(db, inviteId, [{ name: 'Cancel Me', phoneE164: '+966500000020', phoneLocal: '0500000020' }])
    await authedFetch('POST', `${BASE_URL}/api/user/invitations/${inviteId}/schedule-send`, customer.idToken, {
      scheduledSendAt: futureIso(12), timezone: 'Asia/Riyadh',
    })
    const cancelRes = await authedFetch('POST', `${BASE_URL}/api/user/invitations/${inviteId}/cancel-schedule`, customer.idToken, {})
    const invite = (await db.collection('invites').doc(inviteId).get()).data() || {}
    const cancelledJobs = await db.collection('send_jobs').where('inviteId', '==', inviteId).where('status', '==', 'cancelled').get()
    if (cancelRes.ok && invite.workflowStatus === 'ready_for_scheduling' && !cancelledJobs.empty) {
      row.status = 'PASS'
      row.details = `cancelledJobs=${cancelledJobs.size}`
    } else {
      row.details = `status=${cancelRes.status}, workflow=${invite.workflowStatus}, cancelledJobs=${cancelledJobs.size}`
      row.reason = 'Cancel flow did not revert workflow or cancel jobs.'
      row.fix = 'Review API-02 transaction consistency.'
    }
    results.push(row)
  }

  // P2-AC-04 reschedule send
  {
    const row = makeResult('P2-AC-04', 'Reschedule success before sending')
    const inviteId = await createInvite(db, customer.uid, { workflowStatus: 'approved' })
    await seedGuests(db, inviteId, [{ name: 'Reschedule', phoneE164: '+966500000030', phoneLocal: '0500000030' }])
    const first = await authedFetch('POST', `${BASE_URL}/api/user/invitations/${inviteId}/schedule-send`, customer.idToken, {
      scheduledSendAt: futureIso(12), timezone: 'Asia/Riyadh',
    })
    const second = await authedFetch('POST', `${BASE_URL}/api/user/invitations/${inviteId}/reschedule-send`, customer.idToken, {
      scheduledSendAt: futureIso(25), timezone: 'Asia/Riyadh',
    })
    const oldJobId = String(first.data?.jobId || '').trim()
    const newJobId = String(second.data?.newJobId || '').trim()
    const oldCancelled = oldJobId ? await db.collection('send_jobs').doc(oldJobId).get() : null
    const newJob = newJobId ? await db.collection('send_jobs').doc(newJobId).get() : null
    if (
      second.ok &&
      oldCancelled?.exists &&
      oldCancelled.data()?.status === 'cancelled' &&
      newJob?.exists &&
      newJob.data()?.status === 'scheduled'
    ) {
      row.status = 'PASS'
      row.details = `old=${oldJobId}, new=${newJobId}`
    } else {
      row.details = `rescheduleStatus=${second.status}, oldStatus=${oldCancelled?.data()?.status}, newStatus=${newJob?.data()?.status}`
      row.reason = 'Reschedule did not safely replace active job.'
      row.fix = 'Review API-03 replacement logic.'
    }
    results.push(row)
  }

  // P2-AC-05/06/07 process job + provider mapping + auto retry
  {
    const row = makeResult('P2-AC-05/06/07', 'Process job + provider mapping + auto retry behavior')
    const inviteId = await createInvite(db, customer.uid, {
      workflowStatus: 'scheduled',
      scheduledSendAt: new Date(Date.now() - 1_000),
    })
    await seedGuests(db, inviteId, [
      { name: 'Success', phoneE164: '+966500000001', phoneLocal: '0500000001', sendStatus: 'scheduled' },
      { name: 'Permanent', phoneE164: '+966500000002', phoneLocal: '0500000002', sendStatus: 'scheduled' },
      { name: 'Transient', phoneE164: '+966500000003', phoneLocal: '0500000003', sendStatus: 'scheduled' },
      { name: 'Throttled', phoneE164: '+966500000004', phoneLocal: '0500000004', sendStatus: 'scheduled' },
    ])
    const jobRef = db.collection('send_jobs').doc()
    await jobRef.set({
      inviteId,
      scheduledAt: new Date(Date.now() - 1_000),
      status: 'scheduled',
      attempt: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    const dispatch = await cronFetch('POST', `${BASE_URL}/api/internal/send/dispatch`, cronSecret, { maxJobs: 20 })
    const pickedJobId = Array.isArray(dispatch.data?.pickedJobIds) ? dispatch.data.pickedJobIds[0] : null
    const dispatchRunId = String(dispatch.data?.dispatchRunId || '').trim()
    const processRes = await cronFetch(
      'POST',
      `${BASE_URL}/api/internal/send/process-job/${pickedJobId || jobRef.id}`,
      cronSecret,
      { lockOwner: dispatchRunId || undefined }
    )

    const guests = await db.collection('invites').doc(inviteId).collection('guests').get()
    const byPhone = new Map(guests.docs.map((d) => [String(d.data()?.phoneE164 || ''), d.data()]))
    const g1 = byPhone.get('+966500000001')
    const g2 = byPhone.get('+966500000002')
    const g3 = byPhone.get('+966500000003')
    const g4 = byPhone.get('+966500000004')
    const logs = await db.collection('send_logs').where('inviteId', '==', inviteId).get()
    const g2FailedLogs = logs.docs.filter((d) => d.data()?.guestId && d.data()?.errorCode === 'INVALID_RECIPIENT')
    const g3RetryLogs = logs.docs.filter((d) => d.data()?.retryKind === 'transient')
    const g4RetryLogs = logs.docs.filter((d) => d.data()?.retryKind === 'throttled')

    const pass =
      processRes.ok &&
      g1?.sendStatus === 'sent' &&
      g2?.sendStatus === 'failed' &&
      g3?.sendStatus === 'sent' &&
      g4?.sendStatus === 'sent' &&
      Number(g2?.sendAttemptCount || 0) === 1 &&
      Number(g3?.sendAttemptCount || 0) === 3 &&
      Number(g4?.sendAttemptCount || 0) === 3 &&
      g2FailedLogs.length >= 1 &&
      g3RetryLogs.length >= 1 &&
      g4RetryLogs.length >= 1

    if (pass) {
      row.status = 'PASS'
      row.details = `process=${processRes.status}, g2Attempt=${g2?.sendAttemptCount}, g3Attempt=${g3?.sendAttemptCount}, g4Attempt=${g4?.sendAttemptCount}`
      globalThis.__retry_invite = inviteId
    } else {
      row.details = `process=${processRes.status}, statuses=[${g1?.sendStatus},${g2?.sendStatus},${g3?.sendStatus},${g4?.sendStatus}]`
      row.reason = 'Provider mapping or retry behavior mismatch.'
      row.fix = 'Verify mock provider mode and WK-03 retry conditions.'
    }
    results.push(row)
  }

  // P2-AC-08 manual retry failed
  {
    const row = makeResult('P2-AC-08', 'Manual retry failed via API-04')
    const inviteId = globalThis.__retry_invite
    if (!inviteId) {
      row.status = 'FAIL'
      row.details = 'Dependency missing: P2-AC-05/06/07 did not produce retry invite.'
      row.reason = 'Cannot execute manual retry without prior failed guest case.'
      row.fix = 'Fix processing/provider scenario first, then rerun.'
      globalThis.__status_invite = null
    } else {
      const retryRes = await authedFetch(
        'POST',
        `${BASE_URL}/api/user/invitations/${inviteId}/retry-failed`,
        customer.idToken,
        { timezone: 'Asia/Riyadh' }
      )
      const retryJobId = String(retryRes.data?.jobId || '').trim()
      const newJob = retryJobId ? await db.collection('send_jobs').doc(retryJobId).get() : null
      if (
        retryRes.ok &&
        Number(retryRes.data?.retryGuestsCount || 0) >= 1 &&
        newJob?.exists &&
        newJob.data()?.status === 'scheduled'
      ) {
        row.status = 'PASS'
        row.details = `retryGuests=${retryRes.data?.retryGuestsCount}, jobId=${retryJobId}`
        globalThis.__status_invite = inviteId
      } else {
        row.details = `status=${retryRes.status}, retryGuests=${retryRes.data?.retryGuestsCount}, jobStatus=${newJob?.data()?.status}`
        row.reason = 'Manual retry failed did not schedule failed guests.'
        row.fix = 'Review API-04 eligibility and job creation.'
      }
    }
    results.push(row)
  }

  // P2-AC-09 send-status API
  {
    const row = makeResult('P2-AC-09', 'Send-status API consistency')
    const inviteId = globalThis.__status_invite
    if (!inviteId) {
      row.status = 'FAIL'
      row.details = 'Dependency missing: no invite available from P2-AC-08.'
      row.reason = 'Cannot validate send-status without retry test invite.'
      row.fix = 'Fix P2-AC-08 first, then rerun.'
      globalThis.__ui_invite = null
    } else {
      const statusRes = await authedFetch('GET', `${BASE_URL}/api/user/invitations/${inviteId}/send-status`, customer.idToken)
      const s = statusRes.data?.summary || {}
      const hasFields =
        typeof s.totalGuests === 'number' &&
        typeof s.sentGuests === 'number' &&
        typeof s.failedGuests === 'number' &&
        typeof s.inProgressGuests === 'number' &&
        typeof s.pendingGuests === 'number'
      if (statusRes.ok && hasFields) {
        row.status = 'PASS'
        row.details = `total=${s.totalGuests}, sent=${s.sentGuests}, failed=${s.failedGuests}, activeJobs=${s.activeJobsCount}`
        globalThis.__ui_invite = inviteId
      } else {
        row.details = `status=${statusRes.status}, summary=${JSON.stringify(s)}`
        row.reason = 'send-status payload is incomplete.'
        row.fix = 'Review API-05 response shape and summary computation.'
      }
    }
    results.push(row)
  }

  // P2-AC-10/11 UI monitoring + retry UI behavior
  {
    const row = makeResult('P2-AC-10/11', 'Monitoring UI + Retry UI action')
    const inviteId = globalThis.__ui_invite
    if (!inviteId) {
      row.status = 'FAIL'
      row.details = 'Dependency missing: no invite available from P2-AC-09.'
      row.reason = 'Cannot execute UI monitoring/retry checks without base invite.'
      row.fix = 'Fix API send-status scenario first, then rerun.'
    } else {
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
        await page.goto(`${BASE_URL}/dashboard/invites/${inviteId}`, { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1500)

        const bodyText = (await page.textContent('body')) || ''
        const hasMonitoringPanel = bodyText.includes('مراقبة الإرسال (Phase 2)')
        const hasSummaryLabels =
          bodyText.includes('Total') &&
          bodyText.includes('Sent') &&
          bodyText.includes('Failed') &&
          bodyText.includes('In Progress') &&
          bodyText.includes('Pending')
        const retryButton = page.getByRole('button', { name: 'إعادة إرسال الفاشلين' })
        const retryVisible = await retryButton.isVisible().catch(() => false)
        if (retryVisible) {
          page.once('dialog', async (dialog) => dialog.accept())
          await retryButton.click()
          await page.waitForTimeout(2000)
        }
        const bodyAfter = (await page.textContent('body')) || ''
        const retryResultShown =
          bodyAfter.includes('تمت إعادة جدولة الفاشلين بنجاح') || bodyAfter.includes('لا يمكن إعادة إرسال الفاشلين')

        const artifactsDir = path.join(ROOT, 'docs', 'artifacts', 'phase2-ui')
        fs.mkdirSync(artifactsDir, { recursive: true })
        const screenshotPath = path.join(artifactsDir, `phase2-ui-monitor-${Date.now()}.png`)
        await page.screenshot({ path: screenshotPath, fullPage: true })

        if (hasMonitoringPanel && hasSummaryLabels && retryVisible && retryResultShown) {
          row.status = 'PASS'
          row.details = `retryVisible=${retryVisible}, screenshot=${screenshotPath}`
        } else {
          row.details = `panel=${hasMonitoringPanel}, summary=${hasSummaryLabels}, retryVisible=${retryVisible}, retryResult=${retryResultShown}`
          row.reason = 'Monitoring UI or retry UI behavior is incomplete.'
          row.fix = 'Review UI-03/UI-04 rendering/conditions and API-05/API-04 wiring.'
        }
      } catch (error) {
        row.details = `UI automation error: ${error?.message || String(error)}`
        row.reason = 'Could not complete Phase 2 UI automation flow.'
        row.fix = 'Verify login automation and dashboard selectors in current environment.'
      } finally {
        if (browser) await browser.close()
      }
    }
    results.push(row)
  }

  // P2-AC-12 stalled recovery
  {
    const row = makeResult('P2-AC-12', 'Stalled recovery / restart recovery')
    const inviteId = await createInvite(db, customer.uid, { workflowStatus: 'scheduled' })
    await seedGuests(db, inviteId, [{ name: 'Stalled', phoneE164: '+966500000040', phoneLocal: '0500000040', sendStatus: 'send_pending' }])
    const stalledRef = db.collection('send_jobs').doc()
    await stalledRef.set({
      inviteId,
      status: 'processing',
      scheduledAt: new Date(Date.now() - 300_000),
      lockOwner: 'dead-worker',
      lockExpiresAt: new Date(Date.now() - 60_000),
      lockedAt: new Date(Date.now() - 120_000),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    const activeRef = db.collection('send_jobs').doc()
    await activeRef.set({
      inviteId,
      status: 'processing',
      scheduledAt: new Date(Date.now() - 300_000),
      lockOwner: 'active-worker',
      lockExpiresAt: new Date(Date.now() + 300_000),
      lockedAt: new Date(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    const dispatch = await cronFetch('POST', `${BASE_URL}/api/internal/send/dispatch`, cronSecret, { maxJobs: 1 })
    const stalledAfter = await stalledRef.get()
    const activeAfter = await activeRef.get()
    const guestsAfter = await db.collection('invites').doc(inviteId).collection('guests').get()
    const recoveredGuest = guestsAfter.docs[0]?.data() || {}
    const recoveryOk =
      dispatch.ok &&
      Number(dispatch.data?.recovery?.recovered || 0) >= 1 &&
      ['scheduled', 'dispatching'].includes(String(stalledAfter.data()?.status || '')) &&
      activeAfter.data()?.status === 'processing' &&
      recoveredGuest.sendStatus === 'failed'
    if (recoveryOk) {
      row.status = 'PASS'
      row.details = `recovered=${dispatch.data?.recovery?.recovered}, stalledStatus=${stalledAfter.data()?.status}`
    } else {
      row.details = `dispatch=${dispatch.status}, recovery=${JSON.stringify(dispatch.data?.recovery || {})}, stalled=${stalledAfter.data()?.status}, active=${activeAfter.data()?.status}, guest=${recoveredGuest.sendStatus}`
      row.reason = 'Stalled recovery did not reclaim expected jobs safely.'
      row.fix = 'Review WK-04 lock expiry and recovery transaction conditions.'
    }
    results.push(row)
  }

  // P2-AC-13 race basics (duplicate dispatch pickup)
  {
    const row = makeResult('P2-AC-13', 'Race basics: duplicate dispatch pickup prevented')
    const inviteId = await createInvite(db, customer.uid, { workflowStatus: 'scheduled' })
    const dueJob = db.collection('send_jobs').doc()
    await dueJob.set({
      inviteId,
      status: 'scheduled',
      scheduledAt: new Date(Date.now() - 60_000),
      attempt: 0,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })
    const [d1, d2] = await Promise.all([
      cronFetch('POST', `${BASE_URL}/api/internal/send/dispatch`, cronSecret, { maxJobs: 1 }),
      cronFetch('POST', `${BASE_URL}/api/internal/send/dispatch`, cronSecret, { maxJobs: 1 }),
    ])
    const picked1 = Array.isArray(d1.data?.pickedJobIds) ? d1.data.pickedJobIds : []
    const picked2 = Array.isArray(d2.data?.pickedJobIds) ? d2.data.pickedJobIds : []
    const allPicked = [...picked1, ...picked2]
    const unique = new Set(allPicked)
    if (allPicked.length >= 1 && unique.size === 1) {
      row.status = 'PASS'
      row.details = `pickedTotal=${allPicked.length}, unique=${unique.size}, job=${[...unique][0]}`
    } else {
      row.details = `dispatch1=${JSON.stringify(picked1)}, dispatch2=${JSON.stringify(picked2)}`
      row.reason = 'Duplicate pickup protection failed under concurrent dispatch.'
      row.fix = 'Verify lock acquisition and status update order in WK-01.'
    }
    results.push(row)
  }

  const outPath = path.join(ROOT, 'docs', 'PHASE2_TEST_RUN_REPORT.json')
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        baseUrl: BASE_URL,
        providerMode: process.env.WHATSAPP_PROVIDER || 'unknown',
        credentials: { customerEmail },
        results,
      },
      null,
      2
    )
  )
  const pass = results.filter((r) => r.status === 'PASS').length
  const fail = results.filter((r) => r.status === 'FAIL').length
  console.log(`Phase 2 test run completed. PASS=${pass}, FAIL=${fail}`)
  console.log(`Report: ${outPath}`)
}

run().catch((error) => {
  console.error('Phase 2 test run failed:', error)
  process.exit(1)
})

