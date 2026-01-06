'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Invite } from '@/lib/firebase/types'

export default function InviteDetailPage() {
  const params = useParams()
  const inviteId = params.inviteId as string
  const [invite, setInvite] = useState<Invite | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchInvite = async () => {
      try {
        const inviteDoc = await getDoc(doc(db, 'invites', inviteId))
        if (inviteDoc.exists()) {
          setInvite({ id: inviteDoc.id, ...inviteDoc.data() } as Invite)
        }
      } catch (error) {
        console.error('Error fetching invite:', error)
      } finally {
        setLoading(false)
      }
    }

    if (inviteId) {
      fetchInvite()
    }
  }, [inviteId])

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (!invite) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted mb-4">الدعوة غير موجودة</p>
          <Link
            href="/dashboard/invites"
            className="text-primary hover:text-accent"
          >
            العودة للقائمة
          </Link>
        </div>
      </div>
    )
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
            <h1 className="text-2xl font-bold text-primary">{invite.title}</h1>
          </div>
        </div>
      </nav>

      <main className="container mx-auto px-4 py-12">
        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <h2 className="text-2xl font-bold mb-6">تفاصيل الدعوة</h2>
          <div className="space-y-4">
            <div>
              <span className="text-muted">العريس:</span>
              <span className="mr-2 font-semibold">{invite.groomName}</span>
            </div>
            <div>
              <span className="text-muted">العروس:</span>
              <span className="mr-2 font-semibold">{invite.brideName}</span>
            </div>
            <div>
              <span className="text-muted">التاريخ:</span>
              <span className="mr-2 font-semibold">{invite.date}</span>
            </div>
            <div>
              <span className="text-muted">الوقت:</span>
              <span className="mr-2 font-semibold">{invite.time}</span>
            </div>
            <div>
              <span className="text-muted">المكان:</span>
              <span className="mr-2 font-semibold">{invite.locationName}</span>
            </div>
            <div>
              <span className="text-muted">الحالة:</span>
              <span className="mr-2 font-semibold">{invite.status}</span>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t">
            <p className="text-muted mb-4">قريباً: إدارة الضيوف وإضافة QR codes</p>
          </div>
        </div>
      </main>
    </div>
  )
}

