import { FieldValue } from 'firebase-admin/firestore'
import type { Firestore } from 'firebase-admin/firestore'
import { ANALYTICS_EVENT_NAMES, type AnalyticsEventName, type AnalyticsEventPayload } from '@/lib/analytics/types'

const EVENT_SET = new Set<string>(ANALYTICS_EVENT_NAMES)

export function isValidAnalyticsEventName(value: string): value is AnalyticsEventName {
  return EVENT_SET.has(value)
}

export async function trackAnalyticsEvent(
  adminDb: Firestore,
  payload: AnalyticsEventPayload
): Promise<string | null> {
  if (!isValidAnalyticsEventName(payload.event)) return null

  const doc = {
    event: payload.event,
    userId: payload.userId ?? null,
    invitationId: payload.invitationId ?? null,
    templateId: payload.templateId ?? null,
    packageId: payload.packageId ?? null,
    source: payload.source ?? null,
    sessionId: payload.sessionId ?? null,
    metadata: payload.metadata ?? {},
    timestamp: payload.timestamp ? new Date(payload.timestamp) : FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
  }

  const ref = await adminDb.collection('analytics_events').add(doc)
  return ref.id
}
