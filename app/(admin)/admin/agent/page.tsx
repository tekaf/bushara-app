'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useAuth } from '@/lib/auth/context'
import { ArrowLeft, Bot, PlayCircle, RefreshCw } from 'lucide-react'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

type Report = {
  id: string
  generatedAt?: string
  source?: string
  priority?: 'low' | 'medium' | 'high'
  findings?: string[]
  requirements?: string[]
  metrics?: {
    rendersTotal: number
    rendersCompleted: number
    rendersFailed: number
    templatesTotal: number
    templatesByType: { A: number; B: number; C: number }
  }
  automation?: {
    enabled: boolean
    applied: number
    skipped: number
    failed: number
    actions: Array<{
      target: string
      status: 'applied' | 'skipped' | 'failed'
      message: string
    }>
  }
}

export default function AgentPage() {
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)

  const loadReports = async () => {
    if (!user || !isAdmin) return
    setLoading(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/admin/agent/reports?limit=12', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) {
        setReports(data.reports || [])
      } else {
        alert(data.error || 'فشل تحميل تقارير العامل')
      }
    } catch (error: any) {
      alert(error.message || 'فشل تحميل تقارير العامل')
    } finally {
      setLoading(false)
    }
  }

  const runAgentNow = async () => {
    if (!user || !isAdmin) return
    setRunning(true)
    try {
      const token = await user.getIdToken()
      const res = await fetch('/api/admin/agent/run', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'فشل تشغيل العامل')
      } else {
        await loadReports()
      }
    } catch (error: any) {
      alert(error.message || 'فشل تشغيل العامل')
    } finally {
      setRunning(false)
    }
  }

  useEffect(() => {
    if (!authLoading && user && isAdmin) {
      loadReports()
    } else if (!authLoading && !user) {
      setLoading(false)
    } else if (!authLoading && user && !isAdmin) {
      setLoading(false)
    }
  }, [authLoading, user, isAdmin])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
      </div>
    )
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
          <p className="text-muted mb-6">
            {!user
              ? 'You must be logged in to access this page.'
              : 'Your account is logged in, but does not have admin access.'}
          </p>
          <a
            href="/login"
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors inline-block"
          >
            {!user ? 'Go to Login' : 'Back to Home'}
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="p-2 rounded-lg hover:bg-gray-100">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <h1 className="text-3xl font-bold">العامل الذكي 24/7</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadReports}
              className="px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              تحديث
            </button>
            <button
              onClick={runAgentNow}
              disabled={running}
              className="px-4 py-2 rounded-lg bg-primary text-white hover:bg-accent flex items-center gap-2 disabled:opacity-50"
            >
              <PlayCircle className="w-4 h-4" />
              {running ? 'جاري التشغيل...' : 'تشغيل الآن'}
            </button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 mb-4 border">
          <p className="text-sm text-muted">
            هذا القسم يعمل كعامل ذاتي: يحلل المؤشرات ويطبّق إصلاحات آمنة تلقائيًا على Presets (A/B/C)
            عبر Cron بشكل مستمر (كل 15 دقيقة).
          </p>
        </div>

        <div className="space-y-4">
          {reports.map((report) => (
            <div key={report.id} className="bg-white rounded-2xl p-6 shadow-sm border">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Bot className="w-5 h-5 text-primary" />
                  <span className="font-semibold">تقرير ذكي</span>
                  <span className="text-xs text-muted">({report.source || 'local-rules'})</span>
                </div>
                <div className="text-sm text-muted">
                  {report.generatedAt ? new Date(report.generatedAt).toLocaleString() : '-'}
                </div>
              </div>

              {report.metrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
                  <div className="bg-gray-50 p-3 rounded-lg">Renders: {report.metrics.rendersTotal}</div>
                  <div className="bg-gray-50 p-3 rounded-lg">Completed: {report.metrics.rendersCompleted}</div>
                  <div className="bg-gray-50 p-3 rounded-lg">Failed: {report.metrics.rendersFailed}</div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    Templates: {report.metrics.templatesTotal} (A:{report.metrics.templatesByType.A} B:{report.metrics.templatesByType.B} C:{report.metrics.templatesByType.C})
                  </div>
                </div>
              )}

              <div className="mb-3">
                <h3 className="font-semibold mb-1">الملاحظات</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {(report.findings || []).map((f, idx) => (
                    <li key={idx}>{f}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="font-semibold mb-1">المتطلبات الناشئة</h3>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {(report.requirements || []).map((r, idx) => (
                    <li key={idx}>{r}</li>
                  ))}
                </ul>
              </div>

              {report.automation && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="font-semibold mb-1">تنفيذ العامل (Autopilot)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-sm">
                    <div className="bg-gray-50 p-3 rounded-lg">Enabled: {report.automation.enabled ? 'Yes' : 'No'}</div>
                    <div className="bg-gray-50 p-3 rounded-lg">Applied: {report.automation.applied}</div>
                    <div className="bg-gray-50 p-3 rounded-lg">Skipped: {report.automation.skipped}</div>
                    <div className="bg-gray-50 p-3 rounded-lg">Failed: {report.automation.failed}</div>
                  </div>
                  <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                    {(report.automation.actions || []).slice(0, 6).map((a, idx) => (
                      <li key={idx}>
                        [{a.status}] {a.target} - {a.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}

          {reports.length === 0 && (
            <div className="bg-white rounded-2xl p-10 text-center text-muted border">
              لا توجد تقارير بعد. اضغط &quot;تشغيل الآن&quot; لإنشاء أول تقرير.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
