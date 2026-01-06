'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import type { Invite, Guest } from '@/lib/firebase/types'
import { QRCodeSVG } from 'qrcode.react'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'

function InviteContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const inviteId = params.inviteId as string
  const qrToken = searchParams.get('t')
  const [invite, setInvite] = useState<Invite | null>(null)
  const [guest, setGuest] = useState<Guest | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch invite
        const inviteDoc = await getDoc(doc(db, 'invites', inviteId))
        if (inviteDoc.exists()) {
          setInvite({ id: inviteDoc.id, ...inviteDoc.data() } as Invite)
        }

        // Fetch guest if QR token provided
        if (qrToken) {
          const guestsRef = collection(db, 'invites', inviteId, 'guests')
          const q = query(guestsRef, where('qrToken', '==', qrToken))
          const querySnapshot = await getDocs(q)
          if (!querySnapshot.empty) {
            const guestDoc = querySnapshot.docs[0]
            setGuest({ id: guestDoc.id, ...guestDoc.data() } as Guest)
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        setLoading(false)
      }
    }

    if (inviteId) {
      fetchData()
    }
  }, [inviteId, qrToken])

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center pt-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted">جاري التحميل...</p>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  if (!invite) {
    return (
      <>
        <Navbar />
        <div className="min-h-screen flex items-center justify-center pt-32">
          <div className="text-center">
            <p className="text-muted mb-4">الدعوة غير موجودة</p>
          </div>
        </div>
        <Footer />
      </>
    )
  }

  const inviteUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/invite/${inviteId}${qrToken ? `?t=${qrToken}` : ''}`
    : ''

  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen">
        <div className="container mx-auto max-w-2xl">
          <div className="bg-white rounded-2xl p-8 shadow-lg text-center">
            <h1 className="text-4xl font-bold mb-4">{invite.title}</h1>
            <p className="text-2xl text-muted mb-8">
              {invite.groomName} & {invite.brideName}
            </p>

            {guest && (
              <div className="mb-8">
                <p className="text-lg mb-4">مرحباً، {guest.name}</p>
                <div className="bg-primarySoft rounded-xl p-6 inline-block">
                  <QRCodeSVG value={inviteUrl} size={200} />
                </div>
                <p className="text-sm text-muted mt-4">
                  رقم التسلسل: {guest.serialNumber}
                </p>
              </div>
            )}

            <div className="space-y-4 text-right">
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
              {invite.locationMapUrl && (
                <div className="mt-6">
                  <a
                    href={invite.locationMapUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-accent underline"
                  >
                    عرض الموقع على الخريطة
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

export default function PublicInvitePage() {
  return (
    <Suspense
      fallback={
        <>
          <Navbar />
          <div className="min-h-screen flex items-center justify-center pt-32">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted">جاري التحميل...</p>
            </div>
          </div>
          <Footer />
        </>
      }
    >
      <InviteContent />
    </Suspense>
  )
}

