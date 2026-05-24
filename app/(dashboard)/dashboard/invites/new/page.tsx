'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function NewInvitePage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/packages')
  }, [router])

  return <div className="min-h-screen bg-bg" />
}

