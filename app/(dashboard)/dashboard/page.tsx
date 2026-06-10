'use client'

import { useAuth } from '@/lib/auth/context'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Template } from '@/lib/firebase/types'
import DashboardNav from '@/components/dashboard/DashboardNav'
import InvitationHero, { type InvitationHeroStats } from '@/components/dashboard/InvitationHero'
import ActivityTimeline from '@/components/dashboard/ActivityTimeline'
import Favorites from '@/components/dashboard/Favorites'
import QuickActions from '@/components/dashboard/QuickActions'
import InviteCatalogCard from '@/components/dashboard/InviteCatalogCard'
import {
  buildUserActivityFeed,
  isPaidInvite,
  pickFocusInvite,
  type DashboardInviteRow,
  type UserActivityItem,
} from '@/lib/dashboard/user-dashboard'
import {
  resolveDashboardInviteAction,
  resolveDashboardInviteHref,
} from '@/lib/dashboard/invite-links'

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
  const [likedTemplateIds, setLikedTemplateIds] = useState<string[]>([])
  const [invites, setInvites] = useState<DashboardInviteRow[]>([])
  const [activityItems, setActivityItems] = useState<UserActivityItem[]>([])
  const [heroStats, setHeroStats] = useState<InvitationHeroStats | null>(null)

  const focusInvite = useMemo(() => pickFocusInvite(invites), [invites])
  const guestsHref =
    focusInvite?.id && !String(focusInvite.id).startsWith('draft_')
      ? `/guests?invId=${encodeURIComponent(focusInvite.id)}`
      : undefined

  const handleSignOut = async () => {
    await signOut()
    router.push('/')
  }

  const handleToggleFavorite = (templateId: string, liked: boolean) => {
    setLikedTemplateIds((prev) => (liked ? [...prev, templateId] : prev.filter((id) => id !== templateId)))
    setFavoriteTemplates((prev) => (liked ? prev : prev.filter((template) => template.id !== templateId)))
  }

  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const userSnap = await getDoc(doc(db, 'users', user.uid))
        const userData = userSnap.exists() ? (userSnap.data() as Record<string, unknown>) : {}
        setName(String(userData?.name || user.displayName || user.email?.split('@')[0] || 'ضيفنا'))
        const likedIds: string[] = Array.isArray(userData?.likedTemplateIds)
          ? (userData.likedTemplateIds as string[])
          : []
        setLikedTemplateIds(likedIds)

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
            groomName: String(form?.groomNameAr || ''),
            brideName: String(form?.brideNameAr || ''),
            date: String(form?.date || form?.engagementDate || ''),
            time: String(form?.time || ''),
            status: 'draft',
            paymentStatus: 'unpaid',
            updatedAt: draft?.updatedAt || new Date(),
          })
        }

        setInvites(Array.from(inviteMap.values()).sort((a, b) => getInviteTime(b) - getInviteTime(a)))

        if (likedIds.length > 0) {
          const templatesSnap = await getDocs(
            query(collection(db, 'templates'), where('status', '==', 'published'))
          )
          const templates = templatesSnap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as object),
            createdAt: d.data().createdAt?.toDate() || new Date(),
            updatedAt: d.data().updatedAt?.toDate() || new Date(),
          })) as Template[]
          setFavoriteTemplates(templates.filter((t) => likedIds.includes(t.id)))
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
    if (!focus?.id || String(focus.id).startsWith('draft_') || !isPaidInvite(focus)) {
      setHeroStats(null)
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
        const statsPayload = data?.stats || {}
        setHeroStats({
          accepted: Number(statsPayload.accepted || 0),
          declined: Number(statsPayload.declined || 0),
          pending: Number(statsPayload.pending || 0),
          sent: Number(statsPayload.sent || 0),
        })
        setActivityItems(buildUserActivityFeed(focus, guests))
      } catch (error) {
        console.error('Failed loading activity feed:', error)
        setHeroStats(null)
        setActivityItems(buildUserActivityFeed(focus, []))
      } finally {
        setActivityLoading(false)
      }
    }
    loadActivity()
  }, [user, loading, invites])

  return (
    <div className="min-h-screen bg-[#FAFAFC]">
      <DashboardNav subtitle={!loading && name ? `مرحبًا، ${name}` : undefined} onSignOut={handleSignOut} />

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-6">
        <QuickActions guestsHref={guestsHref} />

        {focusInvite ? (
          <InvitationHero invite={focusInvite} loading={loading} name={name} stats={heroStats} />
        ) : !loading ? (
          <section className="rounded-[28px] border border-[#EBEBF3] bg-white px-6 py-8 text-center shadow-sm">
            <p className="mb-2 text-lg font-bold text-textDark">مرحبًا {name || 'بك'}</p>
            <p className="mb-6 text-sm text-muted">ابدأ باقتك الأولى أو أكمل مسودة موجودة من الأسفل.</p>
            <Link
              href="/packages"
              className="inline-flex rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white hover:bg-accent"
            >
              ابدأ تصميم دعوتك
            </Link>
          </section>
        ) : null}

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-textDark">باقاتي ودعواتي</h2>
              <p className="text-xs text-muted">كل مسوداتك ودعواتك السابقة بحالة واضحة</p>
            </div>
            <Link href="/dashboard/invites" className="text-xs font-semibold text-primary hover:text-accent">
              عرض الكل
            </Link>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="aspect-[9/14] animate-pulse rounded-2xl bg-[#EFEFF5]" />
              ))}
            </div>
          ) : invites.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#E0E0EA] bg-white px-6 py-10 text-center text-sm text-muted">
              لا توجد دعوات بعد.{' '}
              <Link href="/packages" className="font-semibold text-primary hover:text-accent">
                اختر باقة
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {invites.slice(0, 8).map((invite) => (
                <InviteCatalogCard
                  key={invite.id}
                  invite={invite}
                  href={resolveDashboardInviteHref(invite)}
                  actionLabel={resolveDashboardInviteAction(invite)}
                />
              ))}
            </div>
          )}
        </section>

        {focusInvite && isPaidInvite(focusInvite) ? (
          <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
            <ActivityTimeline items={activityItems} loading={activityLoading} />
            <Favorites
              templates={favoriteTemplates}
              likedTemplateIds={likedTemplateIds}
              userId={user?.uid}
              onToggleLike={handleToggleFavorite}
            />
          </div>
        ) : (
          <Favorites
            templates={favoriteTemplates}
            likedTemplateIds={likedTemplateIds}
            userId={user?.uid}
            onToggleLike={handleToggleFavorite}
          />
        )}
      </div>
    </div>
  )
}
