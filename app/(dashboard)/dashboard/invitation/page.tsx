'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

export default function DashboardInvitationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const inviteId = String(searchParams.get('invId') || '').trim()
    if (inviteId) {
      router.replace(`/dashboard/invites/${encodeURIComponent(inviteId)}`)
      return
    }
    router.replace('/dashboard/invites')
  }, [router, searchParams])

  return <div className="min-h-screen bg-bg" />
}

