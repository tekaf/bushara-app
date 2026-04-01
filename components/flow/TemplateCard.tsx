'use client'

import Link from 'next/link'
import { Heart, Image as ImageIcon } from 'lucide-react'
import type { Template } from '@/lib/firebase/types'

export default function TemplateCard({
  template,
  href,
  liked,
  onToggleLike,
}: {
  template: Template
  href: string
  liked: boolean
  onToggleLike: (templateId: string) => void
}) {
  return (
    <div className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all hover:-translate-y-1 border border-gray-100">
      <Link href={href} className="block">
        <div className="h-[360px] md:h-[420px] bg-gray-50 relative overflow-hidden p-3">
          {template.assets.backgroundUrl || template.assets.thumbUrl ? (
            <img
              src={template.assets.backgroundUrl || template.assets.thumbUrl || ''}
              alt={template.name}
              className="w-full h-full object-contain group-hover:scale-[1.01] transition-transform duration-300"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted">
              <ImageIcon size={48} />
            </div>
          )}
          <div className="absolute top-2 left-2 bg-primary text-white px-3 py-1 rounded-full text-xs font-semibold">
            النوع {template.type}
          </div>
        </div>
      </Link>
      <div className="p-4 border-t border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2">
            <h3 className="text-base font-bold leading-tight text-center truncate">{template.name}</h3>
          </div>
          <button
            type="button"
            onClick={() => onToggleLike(template.id)}
            className={`p-2 rounded-lg border transition-colors ${
              liked ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
            }`}
            title={liked ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
          >
            <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
          </button>
        </div>
      </div>
    </div>
  )
}
