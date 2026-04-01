'use client'

import { useEffect, useState } from 'react'

export default function HomePreviousInviteSample() {
  const [imageUrl, setImageUrl] = useState('')
  const [fallbackLogoUrl, setFallbackLogoUrl] = useState('/intro/logo-white.png')

  useEffect(() => {
    const loadHomeAssets = async () => {
      try {
        const response = await fetch('/api/public/home-assets', { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) return
        setImageUrl(String(data?.previousInviteImageUrl || ''))
        const logoUrl = String(data?.brandLogoUrl || '').trim()
        if (logoUrl) setFallbackLogoUrl(logoUrl)
      } catch (error) {
        console.error('Failed to load previous invite sample:', error)
      }
    }
    loadHomeAssets()
  }, [])

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm text-muted">نموذج دعوة سابقة</div>
      <div className="aspect-[9/16] overflow-hidden rounded-xl bg-bg">
        {imageUrl ? (
          <img src={imageUrl} alt="Previous invite sample" className="h-full w-full object-contain" />
        ) : (
          <img src={fallbackLogoUrl} alt="Previous invite sample" className="h-full w-full object-contain" />
        )}
      </div>
    </div>
  )
}

