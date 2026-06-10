'use client'

import Link from 'next/link'
import { Heart } from 'lucide-react'
import { templateDetailBrowseUrl, templatesBrowseUrl } from '@/lib/flow/template-routes'
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore'
import type { Template } from '@/lib/firebase/types'
import { db } from '@/lib/firebase/config'

type FavoritesProps = {
  templates: Template[]
  likedTemplateIds?: string[]
  userId?: string
  onToggleLike?: (templateId: string, liked: boolean) => void
}

export default function Favorites({
  templates,
  likedTemplateIds = [],
  userId,
  onToggleLike,
}: FavoritesProps) {
  const handleToggleLike = async (templateId: string) => {
    if (!userId) return
    const alreadyLiked = likedTemplateIds.includes(templateId)
    try {
      await updateDoc(doc(db, 'users', userId), {
        likedTemplateIds: alreadyLiked ? arrayRemove(templateId) : arrayUnion(templateId),
      })
      onToggleLike?.(templateId, !alreadyLiked)
    } catch (error) {
      console.error('Failed toggling favorite:', error)
    }
  }

  return (
    <section className="rounded-[22px] border border-gray-100/90 bg-white/90 p-4 shadow-sm md:p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-textDark">التصاميم المفضلة</h2>
          <p className="text-xs text-muted">اضغط القلب لإزالة التصميم من المفضلة</p>
        </div>
        <Link
          href={templatesBrowseUrl({ favoritesOnly: true })}
          className="shrink-0 text-xs font-semibold text-primary hover:text-accent"
        >
          استكشف المزيد
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-muted">
          لم تضف تصاميم مفضلة بعد.{' '}
          <Link href={templatesBrowseUrl()} className="font-semibold text-primary hover:text-accent">
            استكشف التصاميم
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {templates.map((template) => {
            const liked = likedTemplateIds.includes(template.id)
            return (
              <div
                key={template.id}
                className="group overflow-hidden rounded-2xl border border-gray-200/90 bg-white transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
              >
                <Link href={templateDetailBrowseUrl(template.id)} className="block">
                  <div className="relative aspect-[9/14] overflow-hidden bg-bg">
                    {template.assets.thumbUrl ? (
                      <img
                        src={template.assets.thumbUrl}
                        alt={template.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[10px] text-muted">بدون معاينة</div>
                    )}
                  </div>
                  <p className="truncate px-2 py-2 text-[11px] font-semibold text-textDark">{template.name}</p>
                </Link>
                <div className="flex justify-center border-t border-gray-100 px-2 py-2">
                  <button
                    type="button"
                    onClick={() => handleToggleLike(template.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition ${
                      liked
                        ? 'bg-red-50 text-red-600 hover:bg-red-100'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                    }`}
                    aria-label={liked ? 'إزالة من المفضلة' : 'إضافة للمفضلة'}
                  >
                    <Heart size={14} className={liked ? 'fill-current' : ''} />
                    {liked ? 'مفضّل' : 'مفضلة'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
