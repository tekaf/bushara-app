export interface User {
  id: string
  name: string
  email: string
  likedTemplateIds?: string[]
  createdAt: Date
}

export interface Invite {
  id: string
  ownerId: string
  title: string
  groomName: string
  brideName: string
  date: string // ISO date
  time: string
  locationName: string
  locationMapUrl?: string
  designId: string
  packageId: string
  status: 'draft' | 'active' | 'archived' | 'paid'
  paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'failed' | 'refunded'
  workflowStatus?: string
  reviewStatus?: string
  inviteLockedAfterPayment?: boolean
  orderNumber?: string
  // Phase 2 schema (BE-01) - additive fields only
  scheduledSendAt?: Date | null
  timezone?: string
  sendStatusSummary?: {
    total: number
    pending: number
    sent: number
    failed: number
  }
  lastSendAt?: Date | null
  createdAt: Date
  updatedAt?: Date
}

export interface Guest {
  id: string
  name: string
  phone: string
  allowedCount: number
  qrToken: string
  serialNumber: number
  status: 'pending' | 'sent' | 'accepted' | 'declined' | 'invited' | 'checked_in'
  // Phase 2 schema (BE-01) - additive fields only
  sendStatus?: 'pending' | 'scheduled' | 'send_pending' | 'sent' | 'failed'
  sendAttemptCount?: number
  lastSendAt?: Date | null
  lastSendError?: string
  checkInCount: number
  lastCheckInAt?: Date
}

export interface Payment {
  id: string
  userId: string
  inviteId?: string
  packageId: string
  amount: number
  currency: string
  provider: 'stripe'
  providerSessionId: string
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  createdAt: Date
}

export interface CheckInLog {
  id: string
  inviteId: string
  guestId: string
  staffUserId: string
  scannedAt: Date
  result: 'allowed' | 'rejected'
  reason?: string
}

export interface Template {
  id: string
  name: string
  type: 'A' | 'B' | 'C'
  status: 'draft' | 'published'
  presetOverride?: any
  assets: {
    backgroundUrl: string
    backgroundPdfUrl?: string
    thumbUrl?: string
  }
  layoutB?: {
    groom: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
    bride: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
    date: { xPx: number; yPx: number; fontSize: number; xPct?: number; yPct?: number }
  }
  createdAt: Date
  updatedAt: Date
}

export interface PreviousExample {
  id: string
  title: string
  status: 'draft' | 'published'
  sourceType: 'pdf' | 'image'
  assets: {
    sourceUrl: string
    previewUrl: string
    thumbUrl?: string
  }
  createdAt: Date
  updatedAt: Date
}

export interface Font {
  id: string
  family: string
  weight: number
  style: 'normal' | 'italic'
  fileUrl: string
  format: 'ttf' | 'otf' | 'woff' | 'woff2'
  createdAt: Date
}

export interface Render {
  id: string
  templateId: string
  variant: string
  fields: Record<string, string>
  status: 'pending' | 'processing' | 'completed' | 'failed'
  outputUrl?: string
  error?: string
  createdAt: Date
}

// Phase 2 schema (BE-01) - additive collection models
export interface SendJob {
  id: string
  inviteId: string
  scheduledAt: Date
  status:
    | 'scheduled'
    | 'dispatching'
    | 'processing'
    | 'completed'
    | 'partially_completed'
    | 'failed'
    | 'cancelled'
  attempt: number
  lockOwner?: string | null
  lockedAt?: Date | null
  lockExpiresAt?: Date | null
  processedAt?: Date | null
  createdAt: Date
  updatedAt?: Date
}

export interface SendLog {
  id: string
  inviteId: string
  guestId: string
  jobId?: string
  status: 'accepted' | 'failed' | 'skipped'
  providerMessageId?: string
  providerResponse?: Record<string, any>
  errorCode?: string
  errorMessage?: string
  idempotencyKey?: string
  createdAt: Date
}
