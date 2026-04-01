'use client'

type Stats = {
  invitesCount: number
  guestsCount: number
  acceptedCount: number
  declinedCount: number
  pendingCount: number
  lastInviteAt?: string
}

export default function StatsCards({ loading, stats }: { loading: boolean; stats: Stats }) {
  const cards = [
    { label: 'عدد الدعوات', value: stats.invitesCount },
    { label: 'عدد المعزومين', value: stats.guestsCount },
    { label: 'قبلوا ✅', value: stats.acceptedCount },
    { label: 'رفضوا ❌', value: stats.declinedCount },
    { label: 'بانتظار الرد ⏳', value: stats.pendingCount },
    { label: 'آخر دعوة', value: stats.lastInviteAt || '-' },
  ]

  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">إحصائيات سريعة</h2>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm min-h-[92px]">
            <p className="text-sm text-muted mb-2">{card.label}</p>
            {loading ? (
              <div className="h-6 w-24 animate-pulse rounded bg-gray-100" />
            ) : (
              <p className="text-xl font-bold">{card.value}</p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
