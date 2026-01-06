'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import { collection, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'

export default function NewInvitePage() {
  const router = useRouter()
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    groomName: '',
    brideName: '',
    date: '',
    time: '',
    locationName: '',
    locationMapUrl: '',
    designId: 'default',
    packageId: '50',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) return

    setLoading(true)
    try {
      const inviteRef = await addDoc(collection(db, 'invites'), {
        ownerId: user.uid,
        ...formData,
        status: 'draft',
        createdAt: new Date(),
      })

      router.push(`/dashboard/invites/${inviteRef.id}`)
    } catch (error) {
      console.error('Error creating invite:', error)
      alert('حدث خطأ أثناء إنشاء الدعوة')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg">
      <nav className="bg-white border-b border-primarySoft">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/invites"
              className="text-muted hover:text-primary transition-colors"
            >
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-bold text-primary">إنشاء دعوة جديدة</h1>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12 max-w-2xl">
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-sm space-y-6">
          <div>
            <label htmlFor="title" className="block mb-2 font-semibold">
              عنوان الدعوة
            </label>
            <input
              id="title"
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="مثال: زواج سعود وهاجر"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="groomName" className="block mb-2 font-semibold">
                اسم العريس
              </label>
              <input
                id="groomName"
                type="text"
                value={formData.groomName}
                onChange={(e) => setFormData({ ...formData, groomName: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="brideName" className="block mb-2 font-semibold">
                اسم العروس
              </label>
              <input
                id="brideName"
                type="text"
                value={formData.brideName}
                onChange={(e) => setFormData({ ...formData, brideName: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label htmlFor="date" className="block mb-2 font-semibold">
                التاريخ
              </label>
              <input
                id="date"
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="time" className="block mb-2 font-semibold">
                الوقت
              </label>
              <input
                id="time"
                type="time"
                value={formData.time}
                onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label htmlFor="locationName" className="block mb-2 font-semibold">
              اسم المكان
            </label>
            <input
              id="locationName"
              type="text"
              value={formData.locationName}
              onChange={(e) => setFormData({ ...formData, locationName: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>

          <div>
            <label htmlFor="locationMapUrl" className="block mb-2 font-semibold">
              رابط الخريطة (اختياري)
            </label>
            <input
              id="locationMapUrl"
              type="url"
              value={formData.locationMapUrl}
              onChange={(e) => setFormData({ ...formData, locationMapUrl: e.target.value })}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              placeholder="https://maps.google.com/..."
            />
          </div>

          <div className="flex gap-4">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'جاري الإنشاء...' : 'إنشاء الدعوة'}
            </button>
            <Link
              href="/dashboard/invites"
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
            >
              إلغاء
            </Link>
          </div>
        </form>
      </main>
    </div>
  )
}

