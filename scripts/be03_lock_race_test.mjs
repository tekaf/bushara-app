import fs from 'node:fs'
import path from 'node:path'
import { initializeApp, cert, getApps } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

const ROOT = process.cwd()
const ENV_PATH = path.join(ROOT, '.env.local')

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

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) throw new Error('.env.local not found')
  const env = parseEnvFile(fs.readFileSync(ENV_PATH, 'utf8'))
  for (const [k, v] of Object.entries(env)) {
    if (!process.env[k]) process.env[k] = v
  }
}

function initAdminDb() {
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

async function run() {
  loadEnv()
  const db = initAdminDb()
  const now = Date.now()
  const jobId = `be03-race-job-${now}`

  await db.collection('send_jobs').doc(jobId).set({
    inviteId: `be03-invite-${now}`,
    status: 'scheduled',
    attempt: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const contenders = Array.from({ length: 10 }, (_, i) => `worker-${i + 1}`)

  async function acquireSendJobLock(jobIdLocal, lockOwner, lockTtlMs = 60_000) {
    const jobRef = db.collection('send_jobs').doc(jobIdLocal)
    const now = new Date()
    const lockExpiresAt = new Date(now.getTime() + lockTtlMs)

    return db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef)
      if (!snap.exists) return { acquired: false, reason: 'job_not_found' }
      const row = snap.data() || {}
      const currentOwner = String(row.lockOwner || '')
      const expiresAtDate = row.lockExpiresAt?.toDate?.() || null
      const lockActive = Boolean(currentOwner) && expiresAtDate instanceof Date && expiresAtDate.getTime() > now.getTime()
      if (lockActive && currentOwner !== lockOwner) return { acquired: false, reason: 'already_locked' }

      tx.set(
        jobRef,
        {
          lockOwner,
          lockedAt: now,
          lockExpiresAt,
          updatedAt: now,
        },
        { merge: true }
      )
      return { acquired: true, lockExpiresAt }
    })
  }

  async function releaseSendJobLock(jobIdLocal, lockOwner) {
    const jobRef = db.collection('send_jobs').doc(jobIdLocal)
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(jobRef)
      if (!snap.exists) return { released: false, reason: 'job_not_found' }
      const row = snap.data() || {}
      if (String(row.lockOwner || '') !== lockOwner) return { released: false, reason: 'not_lock_owner' }
      tx.set(
        jobRef,
        {
          lockOwner: FieldValue.delete(),
          lockedAt: FieldValue.delete(),
          lockExpiresAt: FieldValue.delete(),
          updatedAt: new Date(),
        },
        { merge: true }
      )
      return { released: true }
    })
  }

  async function claimSendIdempotency(key, inviteId, guestId, jobIdLocal) {
    const docId = key.replace(/[^a-zA-Z0-9:_-]/g, '_').slice(0, 500)
    const ref = db.collection('send_idempotency').doc(docId)
    try {
      await ref.create({
        key,
        inviteId,
        guestId,
        jobId: jobIdLocal,
        createdAt: new Date(),
      })
      return { claimed: true }
    } catch (error) {
      const text = String(error?.code || '') + String(error?.message || '')
      if (text.includes('already') || text.includes('exists')) return { claimed: false, reason: 'duplicate' }
      throw error
    }
  }

  const lockResults = await Promise.all(
    contenders.map((owner) => acquireSendJobLock(jobId, owner, 60_000))
  )
  const acquiredCount = lockResults.filter((r) => r.acquired).length

  const idemKey = `invite:be03:guest:race:job:${jobId}:attempt:1`
  const idemResults = await Promise.all(
    Array.from({ length: 10 }, () => claimSendIdempotency(idemKey, `be03-invite-${now}`, 'guest-race', jobId))
  )
  const claimedCount = idemResults.filter((r) => r.claimed).length

  const winningWorkerIndex = lockResults.findIndex((r) => r.acquired)
  if (winningWorkerIndex >= 0) {
    await releaseSendJobLock(jobId, contenders[winningWorkerIndex])
  }

  const report = {
    generatedAt: new Date().toISOString(),
    jobId,
    acquiredCount,
    claimedCount,
    lockResults,
    idempotencyResults: idemResults,
    pass: acquiredCount === 1 && claimedCount === 1,
  }

  const outPath = path.join(ROOT, 'docs', 'BE03_LOCK_RACE_TEST_REPORT.json')
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(`BE-03 race test completed: ${outPath}`)
  console.log(`pass=${report.pass}, acquiredCount=${acquiredCount}, claimedCount=${claimedCount}`)
}

run().catch((error) => {
  console.error('BE-03 race test failed:', error)
  process.exit(1)
})

