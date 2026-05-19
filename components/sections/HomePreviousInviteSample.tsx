'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'

const CONTACT_PREVIEW_IMAGE = '/home/contact-preview.webp'

function normalizeAssetUrl(value?: string): string {
  if (!value) return ''
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/')) {
    return value
  }
  return `/${value}`
}

export default function HomePreviousInviteSample() {
  const [imageUrl, setImageUrl] = useState(CONTACT_PREVIEW_IMAGE)
  const [title, setTitle] = useState('نموذج دعوة سابقة')
  const [imageFailed, setImageFailed] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const loadHomeAssets = async () => {
      try {
        const response = await fetch('/api/public/home-assets', { signal: controller.signal })
        const data = await response.json().catch(() => ({}))
        if (response.ok) {
          const nextImage = normalizeAssetUrl(String(data?.contactPreviewImageUrl || CONTACT_PREVIEW_IMAGE))
          setImageUrl(nextImage || CONTACT_PREVIEW_IMAGE)
          setImageFailed(false)
          return
        }
        setImageUrl(CONTACT_PREVIEW_IMAGE)
      } catch {
        setImageUrl(CONTACT_PREVIEW_IMAGE)
      }
    }
    loadHomeAssets()

    return () => {
      controller.abort()
    }
  }, [])

  return (
    <div className="rounded-[24px] border border-[rgba(150,160,190,0.18)] bg-white/75 p-4 shadow-[0_14px_32px_rgba(31,36,51,0.06)] backdrop-blur-2xl">
      <div className="mb-2 text-sm text-[#7B8194]">{title}</div>
      <div className="aspect-[9/16] overflow-hidden rounded-xl bg-[#EFF2FF]">
        {imageUrl && !imageFailed ? (
          <Image
            src={imageUrl}
            alt="نموذج دعوة سابقة"
            width={360}
            height={640}
            className="h-full w-full rounded-[24px] object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : null}
        {imageFailed ? (
          <div className="flex h-full w-full items-center justify-center text-sm text-[#7B8194]">
            لا توجد نماذج منشورة حاليًا
          </div>
        ) : null}
      </div>
    </div>
  )
}

