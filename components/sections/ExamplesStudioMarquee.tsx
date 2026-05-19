'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  const [activeIndex, setActiveIndex] = useState(0)
  const [brokenSampleIds, setBrokenSampleIds] = useState<Record<string, boolean>>({})
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{ startX: number; startScrollLeft: number; dragging: boolean }>({
    startX: 0,
    startScrollLeft: 0,
    dragging: false,
  })

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

  const visibleSamples = executedInvitationSamples

  const realSamples = useMemo(
    () =>
      visibleSamples.filter((item) => {
        const imageUrl = String(item.imageUrl || '').trim()
        const lowered = imageUrl.toLowerCase()
        return (
          imageUrl.length > 0 &&
          !lowered.includes('placeholder') &&
          !lowered.includes('skeleton') &&
          !lowered.includes('mockup') &&
          !brokenSampleIds[item.id]
        )
      }),
    [visibleSamples, brokenSampleIds]
  )

  const minDisplayItems = 9
  const displayItems = useMemo(() => {
    if (!realSamples.length) return []
    if (realSamples.length >= minDisplayItems) {
      return realSamples.map((item, idx) => ({ ...item, carouselKey: `${item.id}-${idx}` }))
    }
    return Array.from({ length: minDisplayItems }).map((_, idx) => {
      const source = realSamples[idx % realSamples.length]
      return {
        ...source,
        carouselKey: `${source.id}-${idx}`,
      }
    })
  }, [realSamples])

  const updateActiveIndex = () => {
    const track = trackRef.current
    if (!track) return
    const cards = Array.from(track.querySelectorAll<HTMLElement>('[data-example-card="1"]'))
    if (!cards.length) return
    const trackRect = track.getBoundingClientRect()
    const centerX = trackRect.left + trackRect.width / 2
    let bestIdx = 0
    let bestDistance = Number.POSITIVE_INFINITY
    cards.forEach((card, idx) => {
      const rect = card.getBoundingClientRect()
      const cardCenter = rect.left + rect.width / 2
      const distance = Math.abs(centerX - cardCenter)
      if (distance < bestDistance) {
        bestDistance = distance
        bestIdx = idx
      }
    })
    setActiveIndex(bestIdx)
  }

  useEffect(() => {
    if (!displayItems.length) return
    const track = trackRef.current
    if (!track) return
    const raf = window.requestAnimationFrame(() => {
      updateActiveIndex()
      const first = track.querySelector<HTMLElement>('[data-example-card="1"]')
      if (!first) return
      const left = first.offsetLeft - (track.clientWidth - first.clientWidth) / 2
      track.scrollTo({ left: Math.max(0, left), behavior: 'auto' })
      updateActiveIndex()
    })
    return () => window.cancelAnimationFrame(raf)
  }, [displayItems.length])

  if (loading) {
    return (
      <div className="rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-5 text-center text-sm text-[#7B8194] shadow-[0_14px_34px_rgba(31,36,51,0.05)] backdrop-blur-2xl">
        جاري تحميل النماذج...
      </div>
    )
  }

  if (!loading && realSamples.length === 0) {
    return (
      <div className="rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-5 text-center text-sm text-[#7B8194] shadow-[0_14px_34px_rgba(31,36,51,0.05)] backdrop-blur-2xl">
        لا توجد نماذج منشورة حاليًا
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-[30px] border border-[rgba(150,160,190,0.18)] bg-white/72 p-4 shadow-[0_24px_80px_rgba(31,36,51,0.08)] backdrop-blur-2xl md:p-5">
      <div
        ref={trackRef}
        className="flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto px-1 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={updateActiveIndex}
        onWheel={(event) => {
          const track = trackRef.current
          if (!track) return
          if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
            track.scrollBy({ left: event.deltaY, behavior: 'auto' })
          }
        }}
        onPointerDown={(event) => {
          const track = trackRef.current
          if (!track) return
          dragStateRef.current = {
            startX: event.clientX,
            startScrollLeft: track.scrollLeft,
            dragging: true,
          }
        }}
        onPointerMove={(event) => {
          const track = trackRef.current
          const state = dragStateRef.current
          if (!track || !state.dragging) return
          const dx = event.clientX - state.startX
          track.scrollLeft = state.startScrollLeft - dx
        }}
        onPointerUp={() => {
          dragStateRef.current.dragging = false
          updateActiveIndex()
        }}
        onPointerLeave={() => {
          dragStateRef.current.dragging = false
        }}
      >
        {displayItems.map((item, idx) => {
          const distance = Math.abs(idx - activeIndex)
          const isCenter = distance === 0
          const scaleClass = isCenter ? 'scale-100' : distance === 1 ? 'scale-[0.93]' : 'scale-[0.9]'
          const opacityClass = isCenter ? 'opacity-100' : distance === 1 ? 'opacity-65' : 'opacity-50'
          const blurClass = isCenter ? 'blur-0' : distance === 1 ? 'blur-[1.5px]' : 'blur-[2px]'

          return (
            <article
              key={item.carouselKey}
              data-example-card="1"
              className={`group relative w-[220px] shrink-0 snap-center overflow-hidden rounded-2xl border border-[rgba(150,160,190,0.2)] bg-white/85 shadow-[0_12px_28px_rgba(31,36,51,0.08)] transition-all duration-300 md:w-[260px] ${scaleClass} ${opacityClass}`}
            >
              <div className={`aspect-[9/16] bg-[#F1F4FF] transition-all duration-300 ${blurClass}`}>
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  className="h-full w-full object-cover [image-rendering:auto]"
                  loading="lazy"
                  decoding="async"
                  onError={() =>
                    setBrokenSampleIds((prev) => ({
                      ...prev,
                      [item.id]: true,
                    }))
                  }
                />
              </div>
              <div className="p-3 text-sm text-[#1F2433]">
                <div className="truncate font-semibold">{item.title}</div>
                <div className="text-xs text-[#7B8194]">دعوة من أعمالنا السابقة</div>
              </div>
            </article>
          )
        })}
      </div>
    </div>
  )
}
