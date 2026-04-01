import fs from 'node:fs'
import path from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env.local')
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'

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

async function signInAsUid(uid, apiKey) {
  const customToken = await getAuth().createCustomToken(uid)
  const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`
  const res = await fetch(signInUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: customToken,
      returnSecureToken: true,
    }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok || !data?.idToken) {
    throw new Error(`Custom-token sign-in failed: ${JSON.stringify(data)}`)
  }
  return String(data.idToken)
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

function normalizeOccasionLabel(value) {
  const key = String(value || '').trim().toLowerCase()
  if (key === 'wedding') return 'زواج أو ملكه'
  if (key === 'engagement') return 'خطبة'
  if (key === 'special') return 'مناسبة خاصة'
  return String(value || '').trim() || '-'
}

function buildTemplateVars(invite) {
  const groomName = String(invite?.groomName || '').trim()
  const brideName = String(invite?.brideName || '').trim()
  const hostDisplayName =
    String(
      invite?.hostDisplayName ||
        invite?.inviterDisplayName ||
        invite?.customerDisplayName ||
        invite?.customerName ||
        ''
    ).trim() ||
    (groomName && brideName ? `${groomName} و ${brideName}` : groomName || brideName || 'أصحاب الدعوة')
  const occasionType = normalizeOccasionLabel(
    String(invite?.selectedOccasion || invite?.occasionType || invite?.title || '').trim()
  )
  const eventDate = String(invite?.fullDateLine || invite?.dateText || invite?.date || '').trim() || '-'
  const additionalDetail = (groomName && brideName ? `${groomName} على ${brideName}` : '').trim() || '-'
  return { hostDisplayName, occasionType, eventDate, additionalDetail }
}

async function main() {
  setEnv()
  const up = await ensureServerUp()
  if (!up) throw new Error(`Server is not reachable at ${BASE_URL}`)

  const cronSecret = String(process.env.CRON_SECRET || '')
  const apiKey = String(process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '')
  if (!cronSecret) throw new Error('Missing CRON_SECRET')
  if (!apiKey) throw new Error('Missing NEXT_PUBLIC_FIREBASE_API_KEY')

  const db = initAdmin()

  const approvedInvitesSnap = await db
    .collection('invites')
    .where('workflowStatus', 'in', ['approved', 'ready_for_scheduling', 'scheduled'])
    .limit(100)
    .get()

  const targetInviteId = String(process.env.TARGET_INVITE_ID || '').trim()
  const targetGuestId = String(process.env.TARGET_GUEST_ID || '').trim()

  let selected = null

  if (targetInviteId) {
    const inviteDoc = await db.collection('invites').doc(targetInviteId).get()
    if (inviteDoc.exists) {
      const invite = inviteDoc.data()
      const ownerId = String(invite?.ownerId || '').trim()
      const mediaUrl = String(invite?.previewUrl || invite?.inviteImageUrl || invite?.finalUrl || '').trim()
      let guestDoc = null
      if (targetGuestId) {
        const g = await inviteDoc.ref.collection('guests').doc(targetGuestId).get()
        if (g.exists) guestDoc = g
      } else {
        const guestsSnap = await inviteDoc.ref.collection('guests').limit(200).get()
        guestDoc = guestsSnap.docs.find((g) => {
          const row = g.data()
          const phoneE164 = String(row?.phoneE164 || row?.phone || '').trim()
          const rsvpToken = String(row?.rsvpToken || '').trim()
          const sendStatus = String(row?.sendStatus || 'pending').trim()
          return Boolean(phoneE164 && rsvpToken && sendStatus !== 'sent')
        })
      }

      if (ownerId && mediaUrl && guestDoc) {
        const guest = guestDoc.data()
        const phoneE164 = String(guest?.phoneE164 || guest?.phone || '').trim()
        const rsvpToken = String(guest?.rsvpToken || '').trim()
        const sendStatus = String(guest?.sendStatus || 'pending').trim()
        if (phoneE164 && rsvpToken && sendStatus !== 'sent') {
          selected = {
            inviteId: inviteDoc.id,
            invite,
            ownerId,
            mediaUrl,
            guestId: guestDoc.id,
            guest,
          }
        }
      }
    }
  }

  if (!selected) {
    for (const inviteDoc of approvedInvitesSnap.docs) {
    const invite = inviteDoc.data()
    const ownerId = String(invite?.ownerId || '').trim()
    const mediaUrl = String(invite?.previewUrl || invite?.inviteImageUrl || invite?.finalUrl || '').trim()
    if (!ownerId || !mediaUrl) continue
    const guestsSnap = await inviteDoc.ref.collection('guests').limit(200).get()
    const guestDoc = guestsSnap.docs.find((g) => {
      const row = g.data()
      const phoneE164 = String(row?.phoneE164 || row?.phone || '').trim()
      const rsvpToken = String(row?.rsvpToken || '').trim()
      const sendStatus = String(row?.sendStatus || 'pending').trim()
      return Boolean(phoneE164 && rsvpToken && sendStatus !== 'sent')
    })
    if (!guestDoc) continue
      selected = {
        inviteId: inviteDoc.id,
        invite,
        ownerId,
        mediaUrl,
        guestId: guestDoc.id,
        guest: guestDoc.data(),
      }
      break
    }
  }

  if (!selected) {
    throw new Error(
      'No suitable invitation found (needs approved/ready/scheduled + image + guest with phoneE164 and rsvpToken + not already sent).'
    )
  }

  const idToken = await signInAsUid(selected.ownerId, apiKey)
  const scheduledAtMs = Date.now() + 20 * 1000
  const scheduledAt = new Date(scheduledAtMs).toISOString()

  const scheduleEndpoint =
    String(selected.invite?.workflowStatus || '').trim() === 'scheduled'
      ? `${BASE_URL}/api/user/invitations/${selected.inviteId}/reschedule-send`
      : `${BASE_URL}/api/user/invitations/${selected.inviteId}/schedule-send`

  const scheduleRes = await authedFetch(
    'POST',
    scheduleEndpoint,
    idToken,
    {
      scheduledSendAt: scheduledAt,
      timezone: 'Asia/Riyadh',
    }
  )
  if (!scheduleRes.ok) {
    throw new Error(`Schedule failed (${scheduleRes.status}): ${JSON.stringify(scheduleRes.data)}`)
  }
  const jobId = String(scheduleRes.data?.jobId || scheduleRes.data?.newJobId || '').trim()
  if (!jobId) throw new Error('Schedule succeeded but no jobId returned')

  const waitMs = Math.max(0, scheduledAtMs - Date.now() + 3000)
  if (waitMs > 0) await sleep(waitMs)

  const dispatchRes = await cronFetch('POST', `${BASE_URL}/api/internal/send/dispatch`, cronSecret, {
    maxJobs: 20,
  })
  if (!dispatchRes.ok) {
    throw new Error(`Dispatch failed (${dispatchRes.status}): ${JSON.stringify(dispatchRes.data)}`)
  }

  const processRes = await cronFetch(
    'POST',
    `${BASE_URL}/api/internal/send/process-job/${jobId}`,
    cronSecret,
    {
      lockOwner: String(dispatchRes.data?.dispatchRunId || ''),
      batchSize: 50,
      maxConcurrency: 5,
      messageDelayMs: 250,
      batchDelayMs: 0,
    }
  )

  const guestSnapAfter = await db
    .collection('invites')
    .doc(selected.inviteId)
    .collection('guests')
    .doc(selected.guestId)
    .get()

  const sendLogSnap = await db
    .collection('send_logs')
    .where('inviteId', '==', selected.inviteId)
    .limit(500)
    .get()

  const sendLogCandidates = sendLogSnap.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((row) => String(row.guestId || '') === selected.guestId)
    .sort((a, b) => {
      const aTs = a?.createdAt?.toDate?.()?.getTime?.() || 0
      const bTs = b?.createdAt?.toDate?.()?.getTime?.() || 0
      return bTs - aTs
    })
  const sendLog = sendLogCandidates[0] || null
  const guestAfter = guestSnapAfter.exists ? guestSnapAfter.data() : null
  const invite = selected.invite
  const guest = selected.guest
  const templateVars = buildTemplateVars(invite)
  const metaRequestPayload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: String(guest?.phoneE164 || guest?.phone || '').trim(),
    type: 'template',
    template: {
      name: 'bashara_invitation_v1',
      language: { code: String(process.env.WHATSAPP_TEMPLATE_LANGUAGE_CODE || 'ar').trim() || 'ar' },
      components: [
        {
          type: 'header',
          parameters: [{ type: 'image', image: { link: selected.mediaUrl } }],
        },
        {
          type: 'body',
          parameters: [
            { type: 'text', text: templateVars.hostDisplayName },
            { type: 'text', text: templateVars.occasionType },
            { type: 'text', text: templateVars.eventDate },
            { type: 'text', text: templateVars.additionalDetail },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{ type: 'text', text: String(guest?.rsvpToken || '').trim() }],
        },
      ],
    },
  }

  const out = {
    selected: {
      inviteId: selected.inviteId,
      ownerId: selected.ownerId,
      guestId: selected.guestId,
      guestPhone: String(guest?.phoneE164 || guest?.phone || '').trim(),
      hasRsvpToken: Boolean(String(guest?.rsvpToken || '').trim()),
      mediaUrl: selected.mediaUrl,
    },
    api: {
      schedule: scheduleRes,
      dispatch: dispatchRes,
      processJob: processRes,
    },
    meta: {
      requestPayload: metaRequestPayload,
      responseFromSendLog: sendLog?.providerResponse || null,
      providerMessageId: sendLog?.providerMessageId || null,
      sendLogStatus: sendLog?.status || null,
      sendLogErrorCode: sendLog?.errorCode || null,
      sendLogErrorMessage: sendLog?.errorMessage || null,
    },
    firestore: {
      sendLog,
      guestAfter: guestAfter
        ? {
            sendStatus: guestAfter.sendStatus || null,
            sendAttemptCount: guestAfter.sendAttemptCount ?? null,
            lastSendError: guestAfter.lastSendError || null,
            lastSendAt: guestAfter.lastSendAt || null,
          }
        : null,
    },
  }

  console.log(JSON.stringify(out, null, 2))
}

main().catch((error) => {
  console.error('[E2E_WHATSAPP_TEMPLATE_TEST] FAILED')
  console.error(error?.stack || error?.message || String(error))
  process.exit(1)
})

