'use client'

import Link from 'next/link'
import { Heart, LayoutTemplate, Package, Ticket, Users, Wand2 } from 'lucide-react'

const actions = [
  { title: 'صمم دعوة جديدة', desc: 'ابدأ تصميم الدعوة خلال دقائق', href: '/occasions', icon: Wand2 },
  { title: 'اختر باقة', desc: 'الباقات حسب عدد الضيوف', href: '/packages', icon: Package },
  { title: 'باقاتي', desc: 'الدعوات المدفوعة والباقات المفعلة لديك', href: '/dashboard/invites', icon: Ticket },
  { title: 'المدعوين', desc: 'إدارة الضيوف والردود', href: '/dashboard/guests', icon: Users },
  { title: 'التصاميم المفضلة', desc: 'القوالب التي أعجبتك', href: '/templates', icon: Heart },
  { title: 'دعواتي السابقة', desc: 'آخر الدعوات التي أنشأتها', href: '/dashboard/invites', icon: LayoutTemplate },
]

export default function QuickActions() {
  return (
    <section>
      <h2 className="text-2xl font-bold mb-4">خدمات سريعة</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {actions.map((action) => (
          <Link
            key={action.title}
            href={action.href}
            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-1 hover:shadow-md"
          >
            <action.icon className="w-6 h-6 text-primary mb-3" />
            <h3 className="mb-1 font-bold text-textDark">{action.title}</h3>
            <p className="text-sm font-medium leading-6 text-muted">{action.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}
