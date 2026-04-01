'use client'

import Link from 'next/link'
import type { Template } from '@/lib/firebase/types'

export default function Favorites({ templates }: { templates: Template[] }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">التصاميم المفضلة</h2>
        <Link href="/templates" className="text-sm font-semibold text-primary hover:text-accent">
          عرض الكل
        </Link>
      </div>
      {templates.length === 0 ? (
        <p className="text-sm text-muted">لم تضف تصاميم مفضلة بعد.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {templates.slice(0, 6).map((template) => (
            <Link
              key={template.id}
              href={`/templates/${template.id}`}
              className="rounded-xl overflow-hidden border border-gray-200 hover:shadow-sm transition-shadow"
            >
              <div className="aspect-[9/16] bg-bg">
                {template.assets.thumbUrl && (
                  <img src={template.assets.thumbUrl} alt={template.name} className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-2 text-xs font-semibold truncate">{template.name}</div>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
