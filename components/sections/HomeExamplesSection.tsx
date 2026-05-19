'use client'

import { useEffect, useState } from 'react'
import ExamplesStudioMarquee, { type ExecutedInvitationSample } from '@/components/sections/ExamplesStudioMarquee'

type ApiPreviousExample = {
  id?: string
  title?: string
  name?: string
  imageUrl?: string
  previewUrl?: string
  thumbnailUrl?: string
  coverUrl?: string
  assets?: {
    previewUrl?: string
    thumbnailUrl?: string
    thumbUrl?: string
    backgroundUrl?: string
  }
}

function normalizeAssetUrl(value?: string): string {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value
  }
  return `/${value}`
}

export default function HomeExamplesSection() {
  const [loading, setLoading] = useState(true)
  const [executedInvitationSamples, setExecutedInvitationSamples] = useState<ExecutedInvitationSample[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/public/previous-examples', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))

        if (!response.ok) {
          setExecutedInvitationSamples([])
          return
        }

        const items = (data?.items ?? []) as ApiPreviousExample[]
        const normalized = items
          .map((item) => ({
            id: String(item?.id || ''),
            title: String(item?.title || item?.name || 'نموذج دعوة'),
            imageUrl: normalizeAssetUrl(
              item?.imageUrl ||
                item?.previewUrl ||
                item?.thumbnailUrl ||
                item?.coverUrl ||
                item?.assets?.previewUrl ||
                item?.assets?.thumbnailUrl ||
                item?.assets?.thumbUrl ||
                item?.assets?.backgroundUrl
            ),
          }))
          .filter((item) => Boolean(item.id) && Boolean(item.imageUrl))

        setExecutedInvitationSamples(normalized)
      } catch (error) {
        console.error('Failed loading home previous examples:', error)
        setExecutedInvitationSamples([])
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => controller.abort()
  }, [])

  return (
    <section className="relative overflow-hidden bg-[#F8FAFF] px-4 py-16">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(124,108,255,0.1),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(180,190,255,0.14),transparent_34%)]" />
      <div className="container relative mx-auto">
        <h2 className="mb-4 text-3xl font-bold text-[#1F2433]">نماذج من أعمالنا</h2>
        <p className="mb-6 text-[#7B8194]">تصفح مجموعة مختارة من الدعوات المنفذة.</p>
        {loading ? (
          <div className="rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-5 text-center text-sm text-[#7B8194] shadow-[0_14px_34px_rgba(31,36,51,0.05)] backdrop-blur-2xl">
            جاري تحميل النماذج...
          </div>
        ) : (
          <ExamplesStudioMarquee samples={executedInvitationSamples} />
        )}
      </div>
    </section>
  )
}
