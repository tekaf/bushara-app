'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Sparkles } from 'lucide-react'
import { collection, getDocs, query, where } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuth } from '@/lib/auth/context'
import InviteCatalogCard from '@/components/dashboard/InviteCatalogCard'
import {
  getPackageLimit,
  isPaidInvite,
  pickFocusInvite,
  type DashboardInviteRow,
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
  return new Date(String(raw)).getTime() || 0
}

export default function InvitesPage() {
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [invites, setInvites] = useState<DashboardInviteRow[]>([])
  const [guestUsage, setGuestUsage] = useState<{ used: number; total: number }>({ used: 0, total: 0 })

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setLoading(false)
      return
    }
    const loadInvites = async () => {
      try {
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
        for (const d of ownerSnap.docs) inviteMap.set(d.id, { id: d.id, ...(d.data() as object), source: 'invite' })
        for (const d of legacyUserSnap.docs) {
          if (!inviteMap.has(d.id)) inviteMap.set(d.id, { id: d.id, ...(d.data() as object), source: 'invite' })
        }

        const draftsData = await draftsResponse.json().catch(() => ({}))
        const drafts = draftsResponse.ok && Array.isArray(draftsData?.drafts) ? draftsData.drafts : []
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
            packageGuests: String(draft?.packageGuests || ''),
            finalUrl: String(draft?.finalUrl || ''),
            previewUrl: String(draft?.previewUrl || ''),
            groomName: String(form?.groomNameAr || ''),
            brideName: String(form?.brideNameAr || ''),
            status: 'draft',
            paymentStatus: 'unpaid',
            updatedAt: new Date(),
          })
        }

        const rows = Array.from(inviteMap.values()).sort((a, b) => getInviteTime(b) - getInviteTime(a))
        setInvites(rows)

        const primary = pickFocusInvite(rows)
        if (primary?.id && !String(primary.id).startsWith('draft_') && isPaidInvite(primary)) {
          const guestsRes = await fetch(
            `/api/user/invitations/${encodeURIComponent(primary.id)}/guests`,
            { headers: { Authorization: `Bearer ${token}` } }
          )
          const guestsData = await guestsRes.json().catch(() => ({}))
          if (guestsRes.ok) {
            setGuestUsage({
              used: Number(guestsData?.quota?.used || guestsData?.stats?.total || 0),
              total: Number(guestsData?.quota?.total || getPackageLimit(primary) || 0),
            })
          }
        }
      } catch (error) {
        console.error('Failed loading invites:', error)
      } finally {
        setLoading(false)
      }
    }
    loadInvites()
  }, [authLoading, user])

  const primaryInvite = useMemo(() => pickFocusInvite(invites), [invites])
  const packageLimit = primaryInvite ? getPackageLimit(primaryInvite) : 0
  const used = guestUsage.used
  const total = guestUsage.total || packageLimit
  const remaining = Math.max(0, total - used)
  const usagePct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0

  return (
    <div className="min-h-screen bg-[#FAFAFC]">
      <nav className="border-b border-[#ECECF2] bg-white/90 backdrop-blur-xl">
        <div className="container mx-auto flex items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-muted transition hover:text-primary">
              <ArrowLeft size={20} />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-textDark">باقاتي</h1>
              <p className="text-xs text-muted">كل دعواتك ومسوداتك في مكان واحد</p>
            </div>
          </div>
          <Link
            href="/packages"
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-accent"
          >
            <Sparkles size={16} />
            دعوة جديدة
          </Link>
        </div>
      </nav>

      <main className="container mx-auto max-w-6xl space-y-8 px-4 py-8">
        {primaryInvite && isPaidInvite(primaryInvite) && total > 0 ? (
          <section className="rounded-[28px] border border-[#EBEBF3] bg-white p-6 shadow-sm">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-semibold text-textDark">استخدام المدعوين — الباقة الحالية</span>
              <span className="text-muted">
                {used} / {total}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-[#F0F0F6]">
              <div
                className="h-full rounded-full bg-gradient-to-l from-primary to-accent transition-all"
                style={{ width: `${usagePct}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">المتبقي: {remaining} مقعد</p>
          </section>
        ) : null}

        {loading ? (
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="aspect-[9/14] animate-pulse rounded-2xl bg-[#EFEFF5]" />
            ))}
          </div>
        ) : invites.length === 0 ? (
          <section className="rounded-[32px] border border-dashed border-[#E0E0EA] bg-white px-8 py-14 text-center">
            <p className="mb-2 text-lg font-bold text-textDark">لا توجد دعوات بعد</p>
            <p className="mb-6 text-sm text-muted">ابدأ بتصميم دعوتك الأولى وستظهر هنا بحالة واضحة.</p>
            <Link href="/packages" className="inline-flex rounded-2xl bg-primary px-6 py-3 text-sm font-semibold text-white">
              اختر باقة
            </Link>
          </section>
        ) : (
          <section>
            <h2 className="mb-4 text-sm font-semibold text-muted">دعواتك ومسوداتك ({invites.length})</h2>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
              {invites.map((invite) => (
                <InviteCatalogCard
                  key={invite.id}
                  invite={invite}
                  href={resolveDashboardInviteHref(invite)}
                  actionLabel={resolveDashboardInviteAction(invite)}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  )
}
