'use client'

import { useEffect, useState } from 'react'
import type { PreviousExample } from '@/lib/firebase/types'

type SampleCard = {
  id: string
  title: string
  imageUrl: string
}

function normalizeAssetUrl(value?: string): string {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value
  }
  return `/${value}`
}

export default function ExamplesStudioMarquee() {
  const [executedInvitationSamples, setExecutedInvitationSamples] = useState<SampleCard[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchExecutedInvitationSamples = async () => {
      try {
        const response = await fetch('/api/public/previous-examples', { cache: 'no-store' })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          console.error('Failed loading executed invitation samples:', data)
          setExecutedInvitationSamples([])
          return
        }
        const rawItems = (data?.items || []) as PreviousExample[]

        const normalizeSample = (item: any): SampleCard => {
          const imageUrl = normalizeAssetUrl(
            item.imageUrl ||
              item.previewUrl ||
              item.thumbnailUrl ||
              item.coverUrl ||
              item.assets?.previewUrl ||
              item.assets?.thumbnailUrl ||
              item.assets?.thumbUrl ||
              item.assets?.backgroundUrl ||
              item.previewUrl ||
              item.thumbnailUrl
          )
          return {
            id: String(item.id || ''),
            title: String(item.title || item.name || 'نموذج دعوة'),
            imageUrl,
          }
        }

        const normalizedItems = rawItems.map(normalizeSample).filter((item) => Boolean(item.imageUrl))

        setExecutedInvitationSamples(normalizedItems)
      } catch (error) {
        setExecutedInvitationSamples([])
        console.error('Failed loading examples studio:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchExecutedInvitationSamples()
  }, [])

  useEffect(() => {
    console.log('EXAMPLES_INPUT', executedInvitationSamples)
  }, [executedInvitationSamples])

  if (loading) {
    return (
      <div className="rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-5 text-center text-sm text-[#7B8194] shadow-[0_14px_34px_rgba(31,36,51,0.05)] backdrop-blur-2xl">
        جاري تحميل النماذج...
      </div>
    )
  }

  if (!loading && executedInvitationSamples.length === 0) {
    return (
      <div className="rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-5 text-center text-sm text-[#7B8194] shadow-[0_14px_34px_rgba(31,36,51,0.05)] backdrop-blur-2xl">
        لا توجد نماذج منشورة حاليًا
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-[rgba(150,160,190,0.18)] bg-white/72 p-4 shadow-[0_24px_80px_rgba(31,36,51,0.08)] backdrop-blur-2xl md:p-5">
      <div className="flex flex-wrap gap-4">
        {executedInvitationSamples.map((sample) => (
          <img
            key={sample.id}
            src={sample.imageUrl}
            alt={sample.title || 'sample'}
            style={{
              width: 220,
              height: 420,
              objectFit: 'cover',
              borderRadius: 24,
            }}
          />
        ))}
      </div>
    </div>
  )
}
