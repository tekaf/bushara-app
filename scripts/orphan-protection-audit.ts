import { loadEnvConfig } from '@next/env'
import { getAdminFirestore } from '../lib/firebase/admin'
import { validateSendJobRelation } from '../lib/orders/orphan-protection'

async function main() {
  loadEnvConfig(process.cwd())
  const adminDb = getAdminFirestore()
  if (!adminDb) throw new Error('Admin SDK not configured')

  const jobsSnap = await adminDb.collection('send_jobs').get()
  let detectedOrphanJobs = 0
  let blockedSafely = 0
  const details: Array<{ jobId: string; inviteId: string; code: string; reason: string }> = []

  for (const doc of jobsSnap.docs) {
    const status = String((doc.data() as any)?.status || '')
    if (!['scheduled', 'dispatching', 'processing', 'orphan_blocked'].includes(status)) continue
    const result = await validateSendJobRelation(adminDb, doc.id, {
      operation: 'phase16_audit',
      blockOnFailure: true,
      checkGuestRelations: true,
    })
    if (!result.ok) {
      detectedOrphanJobs += 1
      blockedSafely += 1
      details.push({
        jobId: result.jobId,
        inviteId: result.inviteId || '',
        code: result.code,
        reason: result.reason,
      })
    }
  }

  console.log(
    JSON.stringify(
      {
        tag: '[ORPHAN_PROTECTION]',
        detectedOrphanJobs,
        blockedSafely,
        details,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error('[ORPHAN_PROTECTION] audit failed', error)
  process.exit(1)
})
