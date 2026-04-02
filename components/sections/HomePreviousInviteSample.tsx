'use client'

import { useEffect, useState } from 'react'
import type { PreviousExample } from '@/lib/firebase/types'

export default function HomePreviousInviteSample() {
  const [imageUrl, setImageUrl] = useState('')
  const [title, setTitle] = useState('نموذج دعوة سابقة')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 9000)

    const loadExample = async () => {
      try {
        const response = await fetch('/api/public/previous-examples', { signal: controller.signal })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) return
        const rows = (data?.items || []) as PreviousExample[]
        const firstWithPreview = rows.find((item) => item.assets?.thumbUrl || item.assets?.previewUrl)
        if (firstWithPreview) {
          setImageUrl(firstWithPreview.assets.thumbUrl || firstWithPreview.assets.previewUrl)
          setTitle(firstWithPreview.title || 'نموذج دعوة سابقة')
        }
      } catch (error) {
        console.error('Failed to load previous invite sample:', error)
      } finally {
        window.clearTimeout(timeoutId)
        setLoading(false)
      }
    }
    loadExample()

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [])

  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm text-muted">{title}</div>
      <div className="aspect-[9/16] overflow-hidden rounded-xl bg-bg">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">
            جاري التحميل...
          </div>
        ) : imageUrl ? (
          <img src={imageUrl} alt="Previous invite sample" className="h-full w-full object-contain" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">
            لا توجد أمثلة سابقة حالياً.
          </div>
        )}
      </div>
    </div>
  )
}

