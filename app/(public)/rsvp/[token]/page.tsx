'use client'

import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'
import { Check, ChevronDown, ExternalLink, Heart, ZoomIn } from 'lucide-react'

type RsvpPayload = {
  canRespond?: boolean
  marketingTemplates?: Array<{ id: string; name: string; imageUrl: string }>
  invite?: {
    title?: string
    groomName?: string
    brideName?: string
    date?: string
    time?: string
    locationName?: string
    locationMapUrl?: string
    imageUrl?: string
  }
  guest?: {
    name?: string
    status?: string
    rsvpStatus?: string
    respondedAt?: string | null
  }
}

export default function RsvpPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const token = String(params.token || '')
  const inviteId = searchParams.get('inv') || searchParams.get('inviteId') || ''

  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [data, setData] = useState<RsvpPayload | null>(null)
  const [error, setError] = useState('')
  const [successStatus, setSuccessStatus] = useState<'accepted' | 'declined' | null>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [fullscreenOpen, setFullscreenOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const endpoint = `/api/public/rsvp/${encodeURIComponent(token)}${
          inviteId ? `?inv=${encodeURIComponent(inviteId)}` : ''
        }`
        const response = await fetch(endpoint)
        const payload = await response.json()
        if (!response.ok) throw new Error(payload?.error || 'تعذر تحميل الدعوة')
        setData(payload)
        if (payload?.guest?.rsvpStatus === 'accepted' || payload?.guest?.rsvpStatus === 'declined') {
          setSuccessStatus(payload.guest.rsvpStatus)
        }
      } catch (e: any) {
        setError(e?.message || 'تعذر تحميل الدعوة')
      } finally {
        setLoading(false)
      }
    }
    if (token) load()
  }, [inviteId, token])

  const submitRsvp = async (responseType: 'accepted' | 'declined') => {
    if (!data?.canRespond || sending || successStatus) return
    try {
      setSending(true)
      setError('')
      const endpoint = `/api/public/rsvp/${encodeURIComponent(token)}${
        inviteId ? `?inv=${encodeURIComponent(inviteId)}` : ''
      }`
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: responseType }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload?.error || 'تعذر إرسال الرد')

      const nextStatus = (payload?.response || payload?.currentStatus || responseType) as 'accepted' | 'declined'
      setSuccessStatus(nextStatus)
      setData((prev) => ({
        ...prev,
        canRespond: false,
        guest: {
          ...(prev?.guest || {}),
          status: nextStatus,
          rsvpStatus: nextStatus,
          respondedAt: payload?.respondedAt || new Date().toISOString(),
        },
      }))
    } catch (e: any) {
      setError(e?.message || 'تعذر إرسال الرد')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <Navbar />
      <main className="pt-28 pb-20 px-4 min-h-screen bg-[radial-gradient(circle_at_20%_12%,#ece8ff_0%,#f7f8ff_42%,#f6f7fb_100%)]">
        <div
          className="pointer-events-none fixed inset-0 opacity-60"
          style={{
            backgroundImage:
              'radial-gradient(circle at 15% 8%, rgba(214, 190, 156, 0.16), transparent 23%), radial-gradient(circle at 83% 14%, rgba(202, 172, 214, 0.16), transparent 24%), radial-gradient(circle at 18% 88%, rgba(214, 190, 156, 0.13), transparent 20%), radial-gradient(circle at 82% 86%, rgba(202, 172, 214, 0.13), transparent 20%)',
          }}
        />
        <div className="container mx-auto max-w-5xl relative">
          {loading ? (
            <div className="rounded-3xl bg-white/80 border border-white p-10 text-center shadow-xl backdrop-blur">
              <p className="text-muted">جاري تجهيز الدعوة...</p>
            </div>
          ) : error ? (
            <div className="rounded-3xl bg-white/90 border border-white p-8 shadow-xl backdrop-blur text-center">
              <h1 className="text-3xl font-bold mb-3">الرابط غير صالح</h1>
              <p className="text-muted mb-6">{error}</p>
              <Link
                href="/"
                className="inline-flex items-center rounded-xl bg-primary px-6 py-3 text-white font-semibold hover:bg-accent transition-colors"
              >
                زيارة بشاره
              </Link>
            </div>
          ) : (
            <div className="space-y-6 md:space-y-7">
              <div className="text-center">
                <h1 className="text-3xl md:text-4xl font-bold mb-1">تأكيد الحضور</h1>
                <p className="text-muted">يا هلا {data?.guest?.name || 'ومرحبا'}</p>
              </div>

              <motion.section
                initial={{ opacity: 0, scale: 0.97, y: 18 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.45, ease: 'easeOut' }}
                className="relative mx-auto w-[92vw] max-w-2xl"
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
                  className="pointer-events-none absolute -top-8 left-2 right-2 h-24 rounded-full blur-2xl opacity-40"
                  style={{
                    background:
                      'radial-gradient(circle at 20% 60%, rgba(220,179,145,0.55), transparent 45%), radial-gradient(circle at 78% 40%, rgba(190,165,227,0.5), transparent 46%)',
                    maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1), rgba(0,0,0,0))',
                    WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1), rgba(0,0,0,0))',
                  }}
                />
                <motion.div
                  animate={{ y: [0, 4, 0] }}
                  transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                  className="pointer-events-none absolute -bottom-10 left-2 right-2 h-28 rounded-full blur-2xl opacity-40"
                  style={{
                    background:
                      'radial-gradient(circle at 16% 50%, rgba(220,179,145,0.52), transparent 44%), radial-gradient(circle at 84% 55%, rgba(190,165,227,0.52), transparent 45%)',
                    maskImage: 'linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))',
                    WebkitMaskImage: 'linear-gradient(to top, rgba(0,0,0,1), rgba(0,0,0,0))',
                  }}
                />

                <motion.div whileHover={{ scale: 1.02 }} className="relative rounded-[28px] border border-white/80 bg-white/90 p-3 shadow-[0_24px_60px_-28px_rgba(78,58,176,0.55)]">
                  {!!data?.invite?.imageUrl && (
                    <button
                      type="button"
                      onClick={() => setFullscreenOpen(true)}
                      className="absolute left-5 top-5 z-10 inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-3 py-1.5 text-xs hover:bg-gray-50"
                    >
                      <ZoomIn size={14} />
                      تكبير
                    </button>
                  )}
                  <div className="aspect-[9/16] w-full overflow-hidden rounded-2xl bg-[#f6f4fa]">
                    {data?.invite?.imageUrl ? (
                      <img
                        src={data.invite.imageUrl}
                        alt={data?.invite?.title || 'Invitation'}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted text-center px-6">
                        لم يتم العثور على صورة الدعوة الفعلية.
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.section>

              {!successStatus ? (
                <section className="mx-auto w-full md:w-3/5 space-y-3">
                  <motion.button
                    whileHover={{ y: -2, boxShadow: '0 12px 28px -12px rgba(97,76,245,0.65)' }}
                    whileTap={{ scale: 0.99 }}
                    type="button"
                    onClick={() => submitRsvp('accepted')}
                    disabled={sending || !data?.canRespond}
                    className="w-full rounded-2xl bg-gradient-to-r from-[#5e4ef2] to-[#7f58ff] py-4 px-4 text-white text-lg font-bold shadow-lg disabled:opacity-60"
                  >
                    <span className="inline-flex items-center gap-2 justify-center">
                      <Check size={20} />
                      {sending ? 'جاري تسجيل الرد...' : 'تأكيد الحضور'}
                    </span>
                  </motion.button>

                  <motion.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    type="button"
                    onClick={() => submitRsvp('declined')}
                    disabled={sending || !data?.canRespond}
                    className="w-full rounded-2xl border-2 border-[#d6d9ea] bg-white py-4 px-4 text-[#2f3551] text-lg font-bold hover:bg-[#f9faff] disabled:opacity-60"
                  >
                    رفض الدعوه
                  </motion.button>

                  {!data?.canRespond && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-amber-700 text-sm text-center">
                      تم تسجيل رد مسبقًا ولا يمكن تغييره.
                    </div>
                  )}
                </section>
              ) : (
                <motion.section
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="mx-auto w-full md:w-3/5 space-y-4 rounded-3xl bg-white/90 border border-white p-5 shadow-xl"
                >
                  <motion.div
                    initial={{ scale: 0.7, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 280, damping: 20 }}
                    className="mx-auto h-14 w-14 rounded-full bg-green-100 text-green-700 flex items-center justify-center"
                  >
                    <Check size={28} />
                  </motion.div>
                  <div className="text-center">
                    <p className="text-xl font-bold">تم تسجيل ردك، شكرًا لك ✨</p>
                    <p className="mt-1 text-muted">
                      {successStatus === 'accepted' ? 'تم تسجيل حضورك ✅' : 'تم تسجيل اعتذارك'}
                    </p>
                    {data?.guest?.respondedAt && (
                      <p className="text-xs mt-1 text-muted">
                        وقت الرد: {new Date(data.guest.respondedAt).toLocaleString('ar-SA')}
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-primary/20 bg-primarySoft p-4 text-center">
                    <p className="font-bold mb-1">أعجبتك الدعوة؟ صمّم دعوتك الآن</p>
                    <p className="text-sm text-muted mb-3">دعوات فخمة + إرسال واتساب + تتبع الردود</p>
                    <Link
                      href="/packages"
                      className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-white font-semibold hover:bg-accent transition-colors"
                    >
                      <Heart size={18} />
                      ابدأ تصميم دعوتك
                    </Link>
                  </div>
                </motion.section>
              )}

              <section className="mx-auto w-full md:w-3/5">
                <button
                  type="button"
                  onClick={() => setDetailsOpen((v) => !v)}
                  className="w-full inline-flex items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 hover:bg-gray-50"
                >
                  <span className="font-semibold">تفاصيل المناسبة</span>
                  <ChevronDown size={18} className={`transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {detailsOpen && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 rounded-xl bg-white p-4 text-sm space-y-1 border border-gray-100">
                        <p><strong>المناسبة:</strong> {data?.invite?.title || '-'}</p>
                        <p><strong>التاريخ:</strong> {data?.invite?.date || '-'}</p>
                        <p><strong>الوقت:</strong> {data?.invite?.time || '-'}</p>
                        <p><strong>المكان:</strong> {data?.invite?.locationName || '-'}</p>
                        {data?.invite?.locationMapUrl && (
                          <a
                            href={data.invite.locationMapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-primary underline mt-2"
                          >
                            <ExternalLink size={14} />
                            فتح الموقع
                          </a>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>
            </div>
          )}
        </div>
      </main>

      <AnimatePresence>
        {fullscreenOpen && !!data?.invite?.imageUrl && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/90 p-4 flex items-center justify-center"
            onClick={() => setFullscreenOpen(false)}
          >
            <img src={data.invite.imageUrl} alt="Invitation Fullscreen" className="max-h-[95vh] max-w-[95vw] object-contain" />
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </>
  )
}

