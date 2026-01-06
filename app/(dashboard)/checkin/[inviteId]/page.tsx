'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Html5Qrcode } from 'html5-qrcode'
import { doc, getDoc, collection, query, where, getDocs, updateDoc, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuth } from '@/lib/auth/context'
import type { Guest, CheckInLog } from '@/lib/firebase/types'
import ProtectedRoute from '@/components/auth/ProtectedRoute'

function CheckInPageContent() {
  const params = useParams()
  const inviteId = params.inviteId as string
  const { user } = useAuth()
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [html5QrCode, setHtml5QrCode] = useState<Html5Qrcode | null>(null)

  useEffect(() => {
    return () => {
      if (html5QrCode) {
        html5QrCode.stop().catch(() => {})
      }
    }
  }, [html5QrCode])

  const startScanning = async () => {
    try {
      const qrCode = new Html5Qrcode('reader')
      setHtml5QrCode(qrCode)

      await qrCode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        async (decodedText) => {
          await handleQRScan(decodedText)
        },
        () => {}
      )

      setScanning(true)
    } catch (err) {
      console.error('Error starting scanner:', err)
      setResult({ type: 'error', message: 'فشل تشغيل الماسح' })
    }
  }

  const stopScanning = async () => {
    if (html5QrCode) {
      await html5QrCode.stop()
      html5QrCode.clear()
      setHtml5QrCode(null)
    }
    setScanning(false)
  }

  const handleQRScan = async (url: string) => {
    try {
      // Extract QR token from URL
      const urlObj = new URL(url)
      const qrToken = urlObj.searchParams.get('t')

      if (!qrToken) {
        setResult({ type: 'error', message: 'QR غير صالح' })
        return
      }

      // Find guest
      const guestsRef = collection(db, 'invites', inviteId, 'guests')
      const q = query(guestsRef, where('qrToken', '==', qrToken))
      const querySnapshot = await getDocs(q)

      if (querySnapshot.empty) {
        setResult({ type: 'error', message: 'الضيف غير موجود' })
        await logCheckIn('rejected', 'الضيف غير موجود')
        return
      }

      const guestDoc = querySnapshot.docs[0]
      const guest = { id: guestDoc.id, ...guestDoc.data() } as Guest

      // Check if already checked in
      if (guest.status === 'checked_in' && guest.checkInCount >= guest.allowedCount) {
        setResult({ type: 'error', message: 'تم الدخول مسبقاً' })
        await logCheckIn('rejected', 'تم الدخول مسبقاً', guest.id)
        return
      }

      // Update guest
      await updateDoc(guestDoc.ref, {
        status: 'checked_in',
        checkInCount: (guest.checkInCount || 0) + 1,
        lastCheckInAt: new Date(),
      })

      setResult({ type: 'success', message: `مرحباً ${guest.name}! تم تسجيل الدخول بنجاح` })
      await logCheckIn('allowed', undefined, guest.id)

      // Stop scanning after success
      await stopScanning()
    } catch (error) {
      console.error('Error processing QR:', error)
      setResult({ type: 'error', message: 'حدث خطأ أثناء المعالجة' })
    }
  }

  const logCheckIn = async (
    result: 'allowed' | 'rejected',
    reason?: string,
    guestId?: string
  ) => {
    if (!user || !guestId) return

    try {
      await addDoc(collection(db, 'checkin_logs'), {
        inviteId,
        guestId,
        staffUserId: user.uid,
        scannedAt: new Date(),
        result,
        reason,
      } as CheckInLog)
    } catch (error) {
      console.error('Error logging check-in:', error)
    }
  }

  return (
    <div className="min-h-screen bg-bg p-4">
      <div className="container mx-auto max-w-2xl">
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h1 className="text-3xl font-bold mb-6 text-center">مسح QR للدخول</h1>

          <div id="reader" className="mb-6"></div>

          {result && (
            <div
              className={`p-4 rounded-lg mb-6 ${
                result.type === 'success'
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {result.message}
            </div>
          )}

          <div className="flex gap-4">
            {!scanning ? (
              <button
                onClick={startScanning}
                className="flex-1 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors"
              >
                بدء المسح
              </button>
            ) : (
              <button
                onClick={stopScanning}
                className="flex-1 bg-red-500 text-white py-3 rounded-lg font-semibold hover:bg-red-600 transition-colors"
              >
                إيقاف المسح
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CheckInPage() {
  return (
    <ProtectedRoute>
      <CheckInPageContent />
    </ProtectedRoute>
  )
}

