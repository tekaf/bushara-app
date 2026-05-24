'use client'

import { useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'

export default function LegacyPositionEditorRedirectPage() {
  const params = useParams()
  const router = useRouter()
  const inviteId = String(params?.inviteId || '')

  useEffect(() => {
    if (!inviteId) return
    router.replace(`/admin/invitations/review/${encodeURIComponent(inviteId)}`)
  }, [inviteId, router])

  return <div className="p-8 text-center text-muted">جاري التحويل إلى ورشة التأكد...</div>
}
