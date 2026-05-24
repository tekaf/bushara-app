import Link from 'next/link'
import { Bot, Sparkles } from 'lucide-react'

export default function AdminAiAssistantPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-admin-lg border border-admin-border bg-gradient-to-l from-admin-surface to-primarySoft/40 p-8 shadow-admin">
        <div className="mb-4 inline-flex rounded-admin bg-primarySoft p-3">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-xl font-bold text-textDark">AI Assistant (Placeholder)</h2>
        <p className="mt-2 text-sm text-muted">
          مستقبلًا: تحليل انخفاض التحويل، اقتراح أفضل التصاميم، اكتشاف مشاكل النظام، وتحليل سلوك المستخدمين.
        </p>
      </section>
      <Link
        href="/admin/agent"
        className="inline-flex items-center gap-2 rounded-admin border border-admin-border bg-admin-surface px-4 py-3 text-sm font-medium text-textDark shadow-admin transition hover:border-primary/30"
      >
        <Bot className="h-4 w-4 text-primary" />
        فتح العامل الذكي الحالي (24/7)
      </Link>
    </div>
  )
}
