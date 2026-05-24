import { loadEnvConfig } from '@next/env'
import { getAdminFirestore } from '../lib/firebase/admin'

async function main() {
  loadEnvConfig(process.cwd())
  const adminDb = getAdminFirestore()
  if (!adminDb) throw new Error('Admin SDK not configured')

  const [dispatchesSnap, wavesSnap, kernelManualEventsSnap] = await Promise.all([
    adminDb.collection('risk_case_dispatches').get(),
    adminDb.collection('risk_case_waves').get(),
    adminDb.collection('dispatch_kernel_events').where('source', '==', 'manual_dispatch').limit(5000).get(),
  ])

  let guestsPrepared = 0
  let missingRsvpTokens = 0
  let invalidPhones = 0
  let duplicatesDetected = 0
  let blockedOrphan = 0

  for (const doc of dispatchesSnap.docs) {
    const row = doc.data() as any
    guestsPrepared += Number(row?.totalGuests || 0)
    missingRsvpTokens += Number(row?.missingRsvpTokens || 0)
    invalidPhones += Number(row?.invalidPhones || 0)
    duplicatesDetected += Number(row?.duplicatesDetected || 0)
  }

  for (const doc of kernelManualEventsSnap.docs) {
    const row = doc.data() as any
    if (String(row?.decision || '') === 'orphan_blocked') blockedOrphan += 1
  }

  console.log(
    JSON.stringify(
      {
        tag: '[RISK_CASE]',
        recordsCreated: dispatchesSnap.size,
        guestsPrepared,
        missingRsvpTokens,
        invalidPhones,
        totalWaves: wavesSnap.size,
        blocking: {
          blocked_missing_rsvp_token: missingRsvpTokens,
          blocked_invalid_phone: invalidPhones,
          blocked_duplicate: duplicatesDetected,
          blocked_orphan: blockedOrphan,
        },
        duplicatesDetected,
        orphanPreventionHits: blockedOrphan,
      },
      null,
      2
    )
  )
}

main().catch((error) => {
  console.error('[RISK_CASE] audit failed', error)
  process.exit(1)
})
