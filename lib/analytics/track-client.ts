'use client'

import type { AnalyticsEventName } from '@/lib/analytics/types'

type TrackOptions = {
  userId?: string | null
  invitationId?: string | null
  templateId?: string | null
  packageId?: string | null
  source?: string | null
  metadata?: Record<string, unknown>
  sessionId?: string | null
}

export async function trackEvent(event: AnalyticsEventName, options: TrackOptions = {}) {
  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, ...options }),
      keepalive: true,
    })
  } catch {
    // Analytics must never break UX.
  }
}

export function trackPageView(path: string, source = 'web') {
  return trackEvent('page_view', { source, metadata: { path } })
}
