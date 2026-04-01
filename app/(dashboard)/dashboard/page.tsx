'use client'

import { useAuth } from '@/lib/auth/context'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Template } from '@/lib/firebase/types'
import WelcomeHero from '@/components/dashboard/WelcomeHero'
import QuickActions from '@/components/dashboard/QuickActions'
import RecentActivity from '@/components/dashboard/RecentActivity'
import Favorites from '@/components/dashboard/Favorites'

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [favoriteTemplates, setFavoriteTemplates] = useState<Template[]>([])
  const [stats, setStats] = useState({
    invitesCount: 0,
    lastInviteAt: '',
  })

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid))
        const userData = userSnap.exists() ? (userSnap.data() as any) : {}
        setName(userData?.name || user.displayName || user.email?.split('@')[0] || 'ضيفنا')
        const likedTemplateIds: string[] = Array.isArray(userData?.likedTemplateIds) ? userData.likedTemplateIds : []

        const invitesSnap = await getDocs(query(collection(db, 'invites'), where('ownerId', '==', user.uid)))
        const invites = invitesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
        const latestInvite = invites
          .map((invite) => invite?.updatedAt?.toDate?.() || invite?.createdAt?.toDate?.() || null)
          .filter(Boolean)
          .sort((a: any, b: any) => b.getTime() - a.getTime())[0]

        setStats({
          invitesCount: invites.length,
          lastInviteAt: latestInvite ? latestInvite.toLocaleDateString('ar-SA') : '',
        })

        if (likedTemplateIds.length > 0) {
          const templatesSnap = await getDocs(query(collection(db, 'templates'), where('status', '==', 'published')))
          const templates = templatesSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as any),
            createdAt: d.data().createdAt?.toDate() || new Date(),
            updatedAt: d.data().updatedAt?.toDate() || new Date(),
          })) as Template[]
          const liked = templates.filter((template) => likedTemplateIds.includes(template.id))
          setFavoriteTemplates(liked)
        } else {
          setFavoriteTemplates([])
        }
      } catch (error) {
        console.error('Failed loading dashboard data:', error)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user])

  const activityItems = useMemo(() => {
    return [
      {
        title: 'آخر دعوة تم إنشاؤها',
        description: stats.lastInviteAt ? `آخر تعديل: ${stats.lastInviteAt}` : 'لم يتم إنشاء دعوات بعد',
      },
      {
        title: 'آخر باقة تم شراؤها',
        description: 'سيظهر تلقائياً عند تفعيل الدفع الكامل.',
      },
      {
        title: 'آخر ضيف رد',
        description: 'إحصائيات الردود تظهر داخل كل دعوة لتجنب خلط البيانات بين الدعوات.',
      },
      {
        title: 'آخر تعديل على دعوة',
        description: stats.lastInviteAt ? `تم التعديل في ${stats.lastInviteAt}` : 'لا توجد تعديلات حتى الآن.',
      },
    ]
  }, [stats.lastInviteAt])

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-violet-50/30 to-white">
      <nav className="bg-white/80 backdrop-blur border-b border-primarySoft sticky top-0 z-20">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-primary">لوحة معلوماتي</h1>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 text-muted hover:text-primary transition-colors rounded-lg px-3 py-2 hover:bg-gray-50"
            >
              <LogOut size={20} />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-8 space-y-8">
        <WelcomeHero name={name} />
        <QuickActions />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <RecentActivity items={activityItems} />
          <Favorites templates={favoriteTemplates} />
        </div>
      </main>
    </div>
  )
}

