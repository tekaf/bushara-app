import Link from 'next/link'

const LINKS = [
  { href: '/admin/presets/A', label: 'النموذج A' },
  { href: '/admin/presets/B', label: 'النموذج B' },
  { href: '/admin/presets/C', label: 'النموذج C' },
  { href: '/admin/previous-examples', label: 'الدعوات السابقة' },
  { href: '/admin/agent', label: 'العامل الذكي' },
]

export default function AdminSettingsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-6 shadow-admin">
        <h2 className="text-lg font-bold">الإعدادات</h2>
        <p className="mt-1 text-sm text-muted">اختصارات للإعدادات التشغيلية الحالية.</p>
        <div className="mt-4 grid gap-2">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-admin border border-admin-borderLight bg-admin-surfaceSoft px-4 py-3 text-sm transition hover:border-primary/20"
            >
              {link.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
