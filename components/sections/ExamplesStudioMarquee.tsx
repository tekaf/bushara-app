'use client'

import { useEffect, useMemo, useState } from 'react'
import type { PreviousExample } from '@/lib/firebase/types'

export default function ExamplesStudioMarquee() {
  const [items, setItems] = useState<PreviousExample[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

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

  const displayItems = useMemo(() => {
    if (!items.length) return []
    const minCount = 12
    const base: PreviousExample[] = []
    let idx = 0
    while (base.length < minCount) {
      base.push(items[idx % items.length])
      idx += 1
    }
    return [...base, ...base]
  }, [items])

  if (loading) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-muted">
        جاري تحميل الأعمال السابقة...
      </div>
    )
  }

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-sm text-muted">
        {failed ? 'تعذر تحميل الأمثلة حاليًا. حاول التحديث بعد قليل.' : 'لا توجد أمثلة سابقة حالياً.'}
      </div>
    )
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-4">
      <div className="marquee-track flex w-max items-stretch gap-4">
        {displayItems.map((item, idx) => (
          <div
            key={`${item.id}-${idx}`}
            className="w-[210px] shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            <div className="aspect-[9/16] bg-bg">
              {item.assets?.thumbUrl || item.assets?.previewUrl ? (
                <img
                  src={item.assets?.thumbUrl || item.assets?.previewUrl}
                  alt={item.title}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-muted">
                  بدون معاينة
                </div>
              )}
            </div>
            <div className="p-2 text-xs text-[#2a3b5f]">
              <div className="truncate font-semibold">{item.title}</div>
              <div className="text-muted">دعوة من أعمالنا السابقة</div>
            </div>
          </div>
        ))}
      </div>

      <style jsx>{`
        .marquee-track {
          animation: marqueeSlide 42s linear infinite;
          will-change: transform;
        }
        @keyframes marqueeSlide {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  )
}
