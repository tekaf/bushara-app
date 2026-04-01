'use client'


export type OccasionOption = {
  id?: string
  label: string
  value: string
  emoji: string
  hint: string
}

export default function OccasionSelector({
  options,
  selectedOccasion,
  packageGuests,
  packagePrice,
}: {
  options: OccasionOption[]
  selectedOccasion: string
  packageGuests?: string
  packagePrice?: string
}) {
  const buildTemplatesUrl = (occasion: string) => {
    const params = new URLSearchParams()
    params.set('occasion', occasion)
    if (packageGuests) params.set('packageGuests', packageGuests)
    if (packagePrice) params.set('packagePrice', packagePrice)
    return `/templates?${params.toString()}`
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {options.map((option) => (
        <button
          type="button"
          key={option.id || `${option.value}-${option.label}`}
          onClick={() => {
            const nextUrl = buildTemplatesUrl(option.value)
            window.location.assign(nextUrl)
          }}
          className={`group rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${
            selectedOccasion === option.value
              ? 'border-primary bg-primarySoft'
              : 'border-gray-200 bg-white hover:border-primary/50'
          }`}
        >
          <div className="text-3xl mb-3">{option.emoji}</div>
          <h3 className="text-lg font-bold mb-1">{option.label}</h3>
          <p className="text-sm text-muted">{option.hint}</p>
        </button>
      ))}
    </div>
  )
}
