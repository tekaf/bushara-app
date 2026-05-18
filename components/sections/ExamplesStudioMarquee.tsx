'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { PreviousExample } from '@/lib/firebase/types'

export default function ExamplesStudioMarquee() {
  const [items, setItems] = useState<PreviousExample[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const trackRef = useRef<HTMLDivElement | null>(null)
  const dragStateRef = useRef<{ startX: number; startScrollLeft: number; dragging: boolean }>({
    startX: 0,
    startScrollLeft: 0,
    dragging: false,
  })

  useEffect(() => {
    const controller = new AbortController()
    const timeoutId = window.setTimeout(() => controller.abort(), 9000)

    const load = async () => {
      try {
        const response = await fetch('/api/public/previous-examples', { signal: controller.signal })
        const data = await response.json()
        if (!response.ok) {
          setFailed(true)
          return
        }
        const rows = (data?.items || []) as PreviousExample[]
        setItems(rows)
      } catch (error) {
        setFailed(true)
        console.error('Failed loading examples studio:', error)
      } finally {
        window.clearTimeout(timeoutId)
        setLoading(false)
      }
    }
    load()

    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
    }
  }, [])

  const minDisplayItems = 9
  const displayItems = useMemo(() => {
    if (!items.length) return []
    if (items.length >= minDisplayItems) {
      return items.map((item, idx) => ({ ...item, carouselKey: `${item.id}-${idx}` }))
    }
    return Array.from({ length: minDisplayItems }).map((_, idx) => {
      const source = items[idx % items.length]
      return {
        ...source,
        carouselKey: `${source.id}-${idx}`,
      }
    })
  }, [items])

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
      <div className="grid grid-cols-2 gap-3 rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-4 shadow-[0_14px_34px_rgba(31,36,51,0.05)] backdrop-blur-2xl md:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, idx) => (
          <div key={idx} className="animate-pulse overflow-hidden rounded-xl border border-white/80 bg-[#F4F6FF]">
            <div className="aspect-[9/16] w-full bg-[#E8ECFA]" />
            <div className="p-2">
              <div className="mb-2 h-3 w-3/4 rounded bg-[#E0E5FA]" />
              <div className="h-3 w-1/2 rounded bg-[#EFF2FF]" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-4 text-sm text-[#7B8194] backdrop-blur-2xl">
        {failed ? 'تعذر تحميل الأمثلة حاليًا. حاول التحديث بعد قليل.' : 'لا توجد أمثلة سابقة حالياً.'}
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
                {item.assets?.previewUrl || item.assets?.thumbUrl ? (
                  <img
                    src={item.assets?.previewUrl || item.assets?.thumbUrl}
                    alt={item.title}
                    className="h-full w-full object-cover [image-rendering:auto]"
                    loading="lazy"
                    decoding="async"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs text-[#7B8194]">بدون معاينة</div>
                )}
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
