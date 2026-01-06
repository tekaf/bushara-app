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

