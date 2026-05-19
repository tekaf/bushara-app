'use client'

import { motion } from 'framer-motion'
import { BadgeDollarSign, Users, Send, CalendarClock, RefreshCcw, Zap } from 'lucide-react'

const features = [
  {
    icon: Users,
    title: 'إدارة المدعوين بسهولة',
    description: 'أضف وعدّل بيانات المدعوين بسهولة.',
  },
  {
    icon: CalendarClock,
    title: 'إرسال مجدول للدعوات',
    description: 'حدد يوم الإرسال، ودع الباقي علينا.',
  },
  {
    icon: Send,
    title: 'إرسال عبر واتساب',
    description: 'نرسل دعواتك عبر واتساب بسهولة.',
  },
  {
    icon: RefreshCcw,
    title: 'دعوات بديلة ذكية',
    description: 'استبدل الدعوات المعتذر عنها بمرونة.',
  },
  {
    icon: Zap,
    title: 'تصميم سريع ومرتب',
    description: 'جهّز دعوتك بخطوات واضحة.',
  },
  {
    icon: BadgeDollarSign,
    title: 'سعر مناسب وجودة عالية',
    description: 'دعوات أنيقة بتكلفة أقل.',
  },
]

export default function Features() {
  return (
    <section className="relative overflow-hidden bg-[#F8FAFF] px-4 py-14 sm:py-20 lg:py-24">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_80%_0%,rgba(124,108,255,0.09),transparent_35%),radial-gradient(circle_at_10%_30%,rgba(180,190,255,0.14),transparent_40%)]" />
      <div className="container mx-auto">
        <motion.div
          initial={false}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="relative mb-10 text-center sm:mb-16"
        >
          <h2 className="mb-4 text-3xl font-bold text-[#1F2433] sm:text-4xl md:text-5xl">
            مميزات منصة بشارة
          </h2>
          <p className="mx-auto max-w-2xl text-base text-[#7B8194] sm:text-lg md:text-xl">
            كل ما تحتاجه لإنشاء دعوة احترافية في مكان واحد
          </p>
        </motion.div>

        <div className="relative grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={false}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="rounded-[28px] border border-[rgba(150,160,190,0.18)] bg-[rgba(255,255,255,0.72)] p-7 shadow-[0_16px_40px_rgba(31,36,51,0.06)] backdrop-blur-2xl transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_42px_rgba(31,36,51,0.08)]"
            >
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-white/80 bg-[#F4F6FF]/90">
                <feature.icon className="text-[#6D5DFB]" size={26} />
              </div>
              <h3 className="mb-2 text-xl font-semibold text-[#1F2433]">{feature.title}</h3>
              <p className="leading-7 text-[#7B8194]">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

