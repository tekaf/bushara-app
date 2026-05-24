import { loadEnvConfig } from '@next/env'
import { getAdminFirestore } from '../lib/firebase/admin'
import { runHistoricalOrderFoundationBackfill } from '../lib/orders/historical-backfill'

async function main() {
  loadEnvConfig(process.cwd())
  const adminDb = getAdminFirestore()
  if (!adminDb) {
    throw new Error('Admin SDK not configured')
  }
  const report = await runHistoricalOrderFoundationBackfill(adminDb)
  console.log(JSON.stringify(report, null, 2))
}

main().catch((error) => {
  console.error('[BACKFILL][ORDER_FOUNDATION] script failed', error)
  process.exit(1)
})
