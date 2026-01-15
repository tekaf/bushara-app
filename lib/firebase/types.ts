export interface User {
  id: string
  name: string
  email: string
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
  status: 'draft' | 'active' | 'archived'
  createdAt: Date
}

export interface Guest {
  id: string
  name: string
  phone: string
  allowedCount: number
  qrToken: string
  serialNumber: number
  status: 'invited' | 'checked_in' | 'declined'
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
  assets: {
    backgroundUrl: string
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

