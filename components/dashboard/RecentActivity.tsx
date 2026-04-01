'use client'

type ActivityItem = {
  title: string
  description: string
}

export default function RecentActivity({ items }: { items: ActivityItem[] }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-2xl font-bold mb-4">آخر النشاطات</h2>
      <div className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted">لا توجد نشاطات بعد.</p>
        ) : (
          items.map((item, idx) => (
            <div key={`${item.title}-${idx}`} className="rounded-xl border border-gray-100 bg-gray-50 p-3">
              <p className="font-semibold">{item.title}</p>
              <p className="text-sm text-muted">{item.description}</p>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
