'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Template } from '@/lib/firebase/types'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import { Image as ImageIcon } from 'lucide-react'

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        // Fetch all templates and filter/sort on client side (avoids needing index)
        const q = query(
          collection(db, 'templates'),
          where('status', '==', 'published')
        )
        const snapshot = await getDocs(q)
        const templatesData = (snapshot.docs
          .map((doc) => ({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
          })) as Template[])
          // Sort by createdAt descending on client side
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        setTemplates(templatesData)
      } catch (error) {
        console.error('Error fetching templates:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchTemplates()
  }, [])

  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">اختر تصميمك</h1>
            <p className="text-xl text-muted">
              اختر من مجموعتنا المتنوعة من تصاميم الدعوات
            </p>
          </div>

          {loading ? (
            <div className="text-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted">جاري التحميل...</p>
            </div>
          ) : templates.length === 0 ? (
            <div className="text-center py-20">
              <ImageIcon className="mx-auto text-muted mb-4" size={64} />
              <p className="text-muted text-xl">لا توجد تصاميم متاحة حالياً</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {templates.map((template) => (
                <Link
                  key={template.id}
                  href={`/templates/${template.id}`}
                  className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-shadow"
                >
                  <div className="aspect-[9/16] bg-bg relative overflow-hidden">
                    {template.assets.thumbUrl ? (
                      <img
                        src={template.assets.thumbUrl}
                        alt={template.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted">
                        <ImageIcon size={48} />
                      </div>
                    )}
                    <div className="absolute top-2 left-2 bg-primary text-white px-3 py-1 rounded-full text-sm font-semibold">
                      Type {template.type}
                    </div>
                  </div>
                  <div className="p-6">
                    <h3 className="text-xl font-bold mb-2">{template.name}</h3>
                    <p className="text-muted text-sm">
                      {template.type === 'A'
                        ? 'تصميم بسيط وأنيق'
                        : template.type === 'B'
                        ? 'زخرفة علوية'
                        : 'زخرفة سفلية'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}

