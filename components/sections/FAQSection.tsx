'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

type FAQItem = {
  question: string
  answer: string
}

const faqItems: FAQItem[] = [
  {
    question: 'كيف أصمم دعوتي؟ ومتى تكون جاهزة؟ وهل أنتم المسؤولين عن الإرسال؟',
    answer:
      'تقدر تبدأ باختيار الباقة وعدد الضيوف المناسب لك، وبعدها تحدد نوع المناسبة وتدخل تفاصيل الدعوة بكل سهولة. بعد الدفع، فريق بشارة يتولى تجهيز الدعوة بأسرع وقت ممكن. نعم، نحن المسؤولين عن إرسال الدعوات، لكن عليك إضافة أرقام المدعوين واعتمادها وتحديد وقت الإرسال، وبعدها نقوم بإرسالها لك بكل سلاسة.',
  },
  {
    question: 'كم يستغرق تجهيز الدعوة؟',
    answer:
      'يتم تجهيز الدعوة خلال وقت قصير جدًا بفضل فريق العمل المتخصص، وغالبًا تكون جاهزة خلال نفس اليوم أو في أقرب وقت ممكن.',
  },
  {
    question: 'لماذا أختار بشارة مقارنة بغيرها؟',
    answer:
      'لأن بشارة تجمع بين السعر المنافس، جودة التصميم، وسرعة الإنجاز في مكان واحد. تحصل على دعوة أنيقة تُجهز بسرعة وبسعر مناسب، مع خدمة موثوقة توفر عليك الوقت والجهد وتضمن لك تجربة أفضل من الخيارات التقليدية.',
  },
  {
    question: 'ماذا يحدث إذا اعتذر أحد المدعوين؟',
    answer:
      'في حال اعتذار أحد المدعوين، يتم استبدال الدعوة بدعوة شاغرة تلقائيًا، حتى تحافظ على العدد المطلوب وتضمن أفضل حضور ممكن.',
  },
  {
    question: 'كيف يتم إرسال الدعوات؟',
    answer: 'يتم إرسال الدعوات عبر واتساب بشكل مباشر ومنظم، بعد تحديدك لوقت الإرسال واعتماد قائمة المدعوين.',
  },
  {
    question: 'هل أستطيع تحديد وقت إرسال الدعوات؟',
    answer: 'نعم، يمكنك تحديد الوقت والتاريخ المناسب لإرسال الدعوات، وسيتم إرسالها تلقائيًا في الموعد الذي تختاره.',
  },
  {
    question: 'هل الخدمة مناسبة للمناسبات الكبيرة؟',
    answer:
      'نعم، بشارة مناسبة لجميع أنواع المناسبات، سواء كانت صغيرة أو كبيرة، ويمكنك اختيار الباقة المناسبة حسب عدد المدعوين.',
  },
  {
    question: 'هل يمكن توفير باقات بعدد ضيوف أكبر من الموجود في بشارة؟',
    answer: 'نعم اكيد نقدر، وكل الي عليك انك تتواصل معنا ومالك الا طيب الخاطر.',
  },
]

export default function FAQSection() {
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({})

  const toggleItem = (index: number) => {
    setOpenMap((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  return (
    <section id="faq" className="bg-bg px-4 py-16 md:py-20">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-10 text-center md:mb-12">
          <h2 className="text-3xl font-bold text-textDark md:text-5xl">الأسئلة الشائعة</h2>
        </div>

        <div className="space-y-3 md:space-y-4">
          {faqItems.map((item, index) => {
            const isOpen = Boolean(openMap[index])

            return (
              <div
                key={item.question}
                className="rounded-2xl border border-primary/10 bg-white/75 shadow-[0_8px_24px_rgba(88,56,156,0.06)] backdrop-blur-sm transition-colors hover:border-primary/20"
              >
                <button
                  type="button"
                  onClick={() => toggleItem(index)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-4 text-right md:px-6"
                >
                  <span className="text-sm font-semibold leading-7 text-textDark md:text-base">{item.question}</span>
                  <ChevronDown
                    size={20}
                    className={`shrink-0 text-primary transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  }`}
                >
                  <div className="overflow-hidden">
                    <p className="border-t border-primary/10 px-4 pb-4 pt-3 text-sm leading-8 text-muted md:px-6 md:text-base">
                      {item.answer}
                    </p>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
