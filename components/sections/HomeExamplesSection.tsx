'use client'

import { useEffect, useState } from 'react'
import ExamplesStudioMarquee, { type ExecutedInvitationSample } from '@/components/sections/ExamplesStudioMarquee'

const CONTACT_PREVIEW_FALLBACK = '/home/contact-preview.webp'

function normalizeAssetUrl(value?: string): string {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value
  }
  return `/${value}`
}

export default function HomeExamplesSection() {
  const [contactPreviewImageUrl, setContactPreviewImageUrl] = useState(CONTACT_PREVIEW_FALLBACK)

  useEffect(() => {
    const controller = new AbortController()
    const load = async () => {
      try {
        const response = await fetch('/api/public/home-assets', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const data = await response.json().catch(() => ({}))
        if (response.ok) {
          const nextImage = normalizeAssetUrl(
            String(data?.contactPreviewImageUrl || CONTACT_PREVIEW_FALLBACK)
          )
          setContactPreviewImageUrl(nextImage || CONTACT_PREVIEW_FALLBACK)
        }
      } catch (error) {
        console.error('Failed loading home assets for examples section:', error)
      }
    }
    load()
    return () => controller.abort()
  }, [])

  const workingPreviewImage = contactPreviewImageUrl || CONTACT_PREVIEW_FALLBACK
  const displayedExamples: ExecutedInvitationSample[] = [
    {
      id: 'working-contact-preview',
      title: 'نموذج دعوة سابقة',
      imageUrl: workingPreviewImage,
    },
  ]

  return (
    <section className="relative overflow-hidden bg-[#F8FAFF] px-4 py-8 sm:py-14 lg:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(124,108,255,0.1),transparent_32%),radial-gradient(circle_at_80%_30%,rgba(180,190,255,0.14),transparent_34%)]" />
      <div className="container relative mx-auto">
        <h2 className="mb-4 text-[24px] font-bold leading-[1.25] text-[#1F2433] sm:text-[36px] md:text-[48px]">نماذج من أعمالنا</h2>
        <p className="mb-6 text-[14px] leading-6 text-[#7B8194] sm:text-[18px]">تصفح مجموعة مختارة من الدعوات المنفذة.</p>
        <ExamplesStudioMarquee samples={displayedExamples} />
      </div>
    </section>
  )
}
