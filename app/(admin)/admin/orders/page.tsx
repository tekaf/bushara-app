'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'

type OrderRow = {
  id: string
  orderCode: string
  title: string
  workflowStatus: string
  paymentStatus: string
  updatedAt: string | null
}

export default function AdminOrdersPage() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [query, setQuery] = useState('')

  useEffect(() => {
    const load = async () => {
      if (!user) return
      try {
        setLoading(true)
        const token = await user.getIdToken()
        const endpoint = query.trim()
          ? `/api/admin/invitations?limit=100&q=${encodeURIComponent(query.trim())}`
          : '/api/admin/invitations?limit=100'
        const response = await fetch(endpoint, { headers: { Authorization: `Bearer ${token}` } })
        const data = await response.json().catch(() => ({}))
        setOrders(Array.isArray(data?.invites) ? data.invites : [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [query, user])

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <section className="rounded-admin-lg border border-admin-border bg-admin-surface p-5 shadow-admin">
        <h2 className="text-lg font-bold">الطلبات</h2>
        <p className="text-sm text-muted">جميع الطلبات مرتبطة بـ invites + orderCode في Firestore.</p>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="بحث..."
          className="mt-4 w-full rounded-admin border border-admin-border px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </section>

      <section className="overflow-hidden rounded-admin-lg border border-admin-border bg-admin-surface shadow-admin">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-admin-surfaceSoft text-xs text-muted">
              <tr>
                <th className="px-4 py-3 text-right">Order Code</th>
                <th className="px-4 py-3 text-right">العنوان</th>
                <th className="px-4 py-3 text-right">Workflow</th>
                <th className="px-4 py-3 text-right">Payment</th>
                <th className="px-4 py-3 text-right">آخر تحديث</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    جاري التحميل...
                  </td>
                </tr>
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    لا توجد طلبات.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} className="border-t border-admin-borderLight">
                    <td className="px-4 py-3 font-medium">
                      <Link href={`/admin/invitations/review/${order.id}`} className="text-primary hover:underline">
                        {order.orderCode || order.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{order.title || '—'}</td>
                    <td className="px-4 py-3">{order.workflowStatus || '—'}</td>
                    <td className="px-4 py-3">{order.paymentStatus || '—'}</td>
                    <td className="px-4 py-3 text-muted">{order.updatedAt ? new Date(order.updatedAt).toLocaleString('ar-SA') : '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
