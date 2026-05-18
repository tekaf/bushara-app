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
        const firstWithPreview = rows.find((item) => item.assets?.previewUrl || item.assets?.thumbUrl)
        if (firstWithPreview) {
          setImageUrl(firstWithPreview.assets.previewUrl || firstWithPreview.assets.thumbUrl)
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
    <div className="rounded-[24px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-4 shadow-[0_14px_32px_rgba(31,36,51,0.06)] backdrop-blur-2xl">
      <div className="mb-2 text-sm text-[#7B8194]">{title}</div>
      <div className="aspect-[9/16] overflow-hidden rounded-xl bg-[#EFF2FF]">
        {loading ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-[#7B8194]">
            جاري التحميل...
          </div>
        ) : imageUrl ? (
          <img src={imageUrl} alt="Previous invite sample" className="h-full w-full object-cover [image-rendering:auto]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-[#7B8194]">
            لا توجد أمثلة سابقة حالياً.
          </div>
        )}
      </div>
    </div>
  )
}

