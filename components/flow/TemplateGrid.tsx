'use client'

import type { Template } from '@/lib/firebase/types'
import { templateDetailBrowseUrl } from '@/lib/flow/template-routes'
import TemplateCard from './TemplateCard'

export default function TemplateGrid({
  templates,
  selectedOccasion,
  packageGuests,
  packagePrice,
  likedTemplateIds,
  onToggleLike,
  browseMode = false,
}: {
  templates: Template[]
  selectedOccasion: string
  packageGuests: string
  packagePrice: string
  likedTemplateIds: string[]
  onToggleLike: (templateId: string) => void
  browseMode?: boolean
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {templates.map((template) => {
        const href = browseMode
          ? templateDetailBrowseUrl(template.id)
          : `/templates/${template.id}?occasion=${selectedOccasion}${
              packageGuests ? `&packageGuests=${packageGuests}` : ''
            }${packagePrice ? `&packagePrice=${packagePrice}` : ''}`

        return (
          <TemplateCard
            key={template.id}
            template={template}
            liked={likedTemplateIds.includes(template.id)}
            onToggleLike={onToggleLike}
            href={href}
          />
        )
      })}
    </div>
  )
}
