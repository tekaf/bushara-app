'use client'

import { motion } from 'framer-motion'
import { QrCode, Users, Send, Shield, Smartphone, Zap } from 'lucide-react'

const features = [
  {
    icon: QrCode,
    title: 'QR فريد لكل ضيف',
    description: 'كل ضيف يحصل على QR code فريد يمكن مسحه عند الدخول',
  },
  {
    icon: Users,
    title: 'إدارة الضيوف بسهولة',
    description: 'أضف وعدّل بيانات ضيوفك بكل سهولة مع إمكانية تحديد عدد المدعوين',
  },
  {
    icon: Send,
    title: 'إرسال عبر واتساب',
    description: 'أرسل دعواتك مباشرة عبر واتساب أو رابط مباشر',
  },
  {
    icon: Shield,
    title: 'آمن ومحمي',
    description: 'بياناتك محمية بأحدث تقنيات الأمان',
  },
  {
    icon: Smartphone,
    title: 'متوافق مع جميع الأجهزة',
    description: 'يعمل على جميع الأجهزة والأنظمة',
  },
  {
    icon: Zap,
    title: 'سهل وسريع',
    description: 'أنشئ دعوتك خلال دقائق بدون تعقيد',
  },
]

export default function Features() {
  return (
    <section className="py-20 px-4 bg-white">
      <div className="container mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            مميزات منصة بشارة
          </h2>
          <p className="text-xl text-muted max-w-2xl mx-auto">
            كل ما تحتاجه لإنشاء دعوة احترافية في مكان واحد
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="bg-bg p-8 rounded-2xl hover:shadow-lg transition-shadow"
            >
              <div className="bg-primarySoft w-16 h-16 rounded-xl flex items-center justify-center mb-6">
                <feature.icon className="text-primary" size={32} />
              </div>
              <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
              <p className="text-muted leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}

