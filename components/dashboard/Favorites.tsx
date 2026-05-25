'use client'

import Link from 'next/link'
import type { Template } from '@/lib/firebase/types'

export default function Favorites({ templates }: { templates: Template[] }) {
  return (
    <section className="rounded-[22px] border border-gray-100/90 bg-white/90 p-4 shadow-sm md:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-textDark">التصاميم المفضلة</h2>
          <p className="text-xs text-muted">لمسات سريعة قبل البدء</p>
        </div>
        <Link href="/templates" className="shrink-0 text-xs font-semibold text-primary hover:text-accent">
          عرض الكل
        </Link>
      </div>

      {templates.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-muted">
          لم تضف تصاميم مفضلة بعد.{' '}
          <Link href="/templates" className="font-semibold text-primary hover:text-accent">
            استكشف التصاميم
          </Link>
        </p>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 scrollbar-thin">
          {templates.map((template) => (
            <Link
              key={template.id}
              href="/templates"
              className="group w-[108px] shrink-0 overflow-hidden rounded-xl border border-gray-200/90 bg-white transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-md"
            >
              <div className="aspect-[9/14] overflow-hidden bg-bg">
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
              <p className="truncate px-2 py-1.5 text-[11px] font-semibold text-textDark">{template.name}</p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
