'use client'

import { useAuth } from '@/lib/auth/context'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Template } from '@/lib/firebase/types'
import InvitationHero from '@/components/dashboard/InvitationHero'
import QuickActions from '@/components/dashboard/QuickActions'
import ActivityTimeline from '@/components/dashboard/ActivityTimeline'
import Favorites from '@/components/dashboard/Favorites'
import {
  buildUserActivityFeed,
  pickFocusInvite,
  type DashboardInviteRow,
  type UserActivityItem,
} from '@/lib/dashboard/user-dashboard'

function getInviteTime(row: DashboardInviteRow) {
  const raw = row?.updatedAt || row?.createdAt
  if (!raw) return 0
  if (typeof (raw as { toDate?: () => Date })?.toDate === 'function') {
    return (raw as { toDate: () => Date }).toDate().getTime()
  }
  const parsed = new Date(String(raw)).getTime()
  return Number.isFinite(parsed) ? parsed : 0
}

export default function DashboardPage() {
  const { user, signOut } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activityLoading, setActivityLoading] = useState(true)
  const [name, setName] = useState('')
  const [favoriteTemplates, setFavoriteTemplates] = useState<Template[]>([])
  const [invites, setInvites] = useState<DashboardInviteRow[]>([])
  const [activityItems, setActivityItems] = useState<UserActivityItem[]>([])

  const focusInvite = useMemo(() => pickFocusInvite(invites), [invites])

  const guestsHref = useMemo(() => {
    if (!focusInvite?.id || String(focusInvite.id).startsWith('draft_')) return undefined
    return `/guests?invId=${encodeURIComponent(focusInvite.id)}`
  }, [focusInvite?.id])

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid))
        const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {}
        setName(
          String(userData?.name || user.displayName || user.email?.split('@')[0] || 'ضيفنا')
        )
        const likedTemplateIds: string[] = Array.isArray(userData?.likedTemplateIds)
          ? (userData.likedTemplateIds as string[])
          : []

        const token = await user.getIdToken()
        const draftsResponsePromise = fetch('/api/user/invite-drafts', {
          headers: { Authorization: `Bearer ${token}` },
        })

        const [ownerSnap, legacyUserSnap, draftsResponse] = await Promise.all([
          getDocs(query(collection(db, 'invites'), where('ownerId', '==', user.uid))),
          getDocs(query(collection(db, 'invites'), where('userId', '==', user.uid))),
          draftsResponsePromise,
        ])

        const inviteMap = new Map<string, DashboardInviteRow>()
        for (const d of ownerSnap.docs) {
          inviteMap.set(d.id, { id: d.id, ...(d.data() as object), source: 'invite' })
        }
        for (const d of legacyUserSnap.docs) {
          if (!inviteMap.has(d.id)) {
            inviteMap.set(d.id, { id: d.id, ...(d.data() as object), source: 'invite' })
          }
        }

        const draftsData = await draftsResponse.json().catch(() => ({}))
        const drafts =
          draftsResponse.ok && Array.isArray(draftsData?.drafts) ? draftsData.drafts : []
        for (const draft of drafts) {
          const templateId = String(draft?.templateId || '').trim()
          if (!templateId) continue
          const draftId = `draft_${templateId}`
          if (inviteMap.has(draftId)) continue
          const form = (draft?.formData || {}) as Record<string, unknown>
          inviteMap.set(draftId, {
            id: draftId,
            source: 'draft',
            designId: templateId,
            selectedOccasion: String(draft?.selectedOccasion || ''),
            finalUrl: String(draft?.finalUrl || ''),
            previewUrl: String(draft?.previewUrl || ''),
            title:
              `دعوة ${String(form?.groomNameAr || '')} ${String(form?.brideNameAr || '')}`.trim() ||
              'دعوة محفوظة',
            groomName: String(form?.groomNameAr || ''),
            brideName: String(form?.brideNameAr || ''),
            date: String(form?.date || form?.engagementDate || ''),
            time: String(form?.time || ''),
            status: 'draft',
            paymentStatus: 'unpaid',
            updatedAt: draft?.updatedAt || new Date(),
          })
        }

        const rows = Array.from(inviteMap.values()).sort((a, b) => getInviteTime(b) - getInviteTime(a))
        setInvites(rows)

        if (likedTemplateIds.length > 0) {
          const templatesSnap = await getDocs(
            query(collection(db, 'templates'), where('status', '==', 'published'))
          )
          const templates = templatesSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as object),
            createdAt: d.data().createdAt?.toDate() || new Date(),
            updatedAt: d.data().updatedAt?.toDate() || new Date(),
          })) as Template[]
          setFavoriteTemplates(templates.filter((template) => likedTemplateIds.includes(template.id)))
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

  useEffect(() => {
    if (!user || loading) return
    const focus = pickFocusInvite(invites)
    if (!focus?.id || String(focus.id).startsWith('draft_')) {
      setActivityItems(buildUserActivityFeed(focus, []))
      setActivityLoading(false)
      return
    }

    const loadActivity = async () => {
      setActivityLoading(true)
      try {
        const token = await user.getIdToken()
        const response = await fetch(
          `/api/user/invitations/${encodeURIComponent(focus.id)}/guests`,
          { headers: { Authorization: `Bearer ${token}` } }
        )
        const data = await response.json().catch(() => ({}))
        const guests = response.ok && Array.isArray(data?.guests) ? data.guests : []
        setActivityItems(buildUserActivityFeed(focus, guests))
      } catch (error) {
        console.error('Failed loading activity feed:', error)
        setActivityItems(buildUserActivityFeed(focus, []))
      } finally {
        setActivityLoading(false)
      }
    }
    loadActivity()
  }, [user, loading, invites])

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#FDFCFF] via-violet-50/20 to-white">
      <nav className="sticky top-0 z-20 border-b border-primarySoft/80 bg-white/75 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-primary md:text-xl">لوحة معلوماتي</h1>
              {!loading && name ? (
                <p className="text-xs text-muted">مرحبًا، {name}</p>
              ) : null}
            </div>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-muted transition-colors hover:bg-gray-50 hover:text-primary"
            >
              <LogOut size={18} />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </nav>

      <main className="container mx-auto max-w-6xl space-y-6 px-4 py-6 md:space-y-8 md:py-8">
        <InvitationHero invite={focusInvite} loading={loading} name={name} />

        <QuickActions guestsHref={guestsHref} />

        <ActivityTimeline items={activityItems} loading={loading || activityLoading} />

        <Favorites templates={favoriteTemplates} />
      </main>
    </div>
  )
}
