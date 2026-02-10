'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, getDoc, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { useAuth } from '@/lib/auth/context'
import type { Template } from '@/lib/firebase/types'
import { Save, ArrowLeft, Move } from 'lucide-react'

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const DEFAULT_GRID_COLS = 26 // A-Z
const DEFAULT_GRID_ROWS = 30

interface ElementPosition {
  xPx: number
  yPx: number
  fontSize: number
  xPct: number
  yPct: number
}

interface LayoutB {
  groom: ElementPosition
  bride: ElementPosition
  date: ElementPosition
}

export default function PositionEditorPage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  // Decode and validate templateId
  const rawId = params.id as string
  const templateId = rawId && !rawId.includes('[') && !rawId.includes('template-id') 
    ? decodeURIComponent(rawId) 
    : null

  const [template, setTemplate] = useState<Template | null>(null)
  const [rawTemplateType, setRawTemplateType] = useState<string | null>(null)
  const [templateExists, setTemplateExists] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scale, setScale] = useState(1)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<keyof LayoutB | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [showGrid, setShowGrid] = useState(true)
  const [gridCols, setGridCols] = useState(DEFAULT_GRID_COLS)
  const [gridRows, setGridRows] = useState(DEFAULT_GRID_ROWS)

  // Initial positions from preset or saved layout
  // Default positions based on user's preferred layout
  const [layout, setLayout] = useState<LayoutB>({
    groom: { xPx: 726, yPx: 539, fontSize: 54, xPct: 0.6722, yPct: 0.2807 },
    bride: { xPx: 126, yPx: 537, fontSize: 54, xPct: 0.1167, yPct: 0.2797 },
    date: { xPx: 461, yPx: 1301, fontSize: 24, xPct: 0.4269, yPct: 0.6776 },
  })

  // Load template
  useEffect(() => {
    if (!templateId || authLoading) {
      if (!templateId && !authLoading) {
        setTemplateExists(false)
        setLoading(false)
      }
      return
    }

    async function loadTemplate() {
      if (!templateId) return
      try {
        const docRef = doc(db, 'templates', templateId)
        const docSnap = await getDoc(docRef)
        if (docSnap.exists()) {
          const data = docSnap.data()
          const normalizedType = String(data.type || '').toUpperCase()
          setRawTemplateType(data.type ?? null)
          setTemplateExists(true)
          const templateData: Template = {
            id: docSnap.id,
            name: data.name || '',
            type: (normalizedType === 'A' || normalizedType === 'B' || normalizedType === 'C'
              ? (normalizedType as 'A' | 'B' | 'C')
              : 'A'),
            status: data.status || 'draft',
            assets: data.assets || { backgroundUrl: '' },
            layoutB: data.layoutB,
            createdAt: data.createdAt?.toDate() || new Date(),
            updatedAt: data.updatedAt?.toDate() || new Date(),
          }
          setTemplate(templateData)

          // Use saved layout if exists, otherwise use defaults
          if (templateData.layoutB) {
            setLayout({
              groom: {
                xPx: templateData.layoutB.groom.xPx,
                yPx: templateData.layoutB.groom.yPx,
                fontSize: templateData.layoutB.groom.fontSize,
                xPct: templateData.layoutB.groom.xPct || templateData.layoutB.groom.xPx / CANVAS_WIDTH,
                yPct: templateData.layoutB.groom.yPct || templateData.layoutB.groom.yPx / CANVAS_HEIGHT,
              },
              bride: {
                xPx: templateData.layoutB.bride.xPx,
                yPx: templateData.layoutB.bride.yPx,
                fontSize: templateData.layoutB.bride.fontSize,
                xPct: templateData.layoutB.bride.xPct || templateData.layoutB.bride.xPx / CANVAS_WIDTH,
                yPct: templateData.layoutB.bride.yPct || templateData.layoutB.bride.yPx / CANVAS_HEIGHT,
              },
              date: {
                xPx: templateData.layoutB.date.xPx,
                yPx: templateData.layoutB.date.yPx,
                fontSize: templateData.layoutB.date.fontSize,
                xPct: templateData.layoutB.date.xPct || templateData.layoutB.date.xPx / CANVAS_WIDTH,
                yPct: templateData.layoutB.date.yPct || templateData.layoutB.date.yPx / CANVAS_HEIGHT,
              },
            })
          }
        } else {
          console.error('Template not found')
          setTemplateExists(false)
        }
      } catch (error) {
        console.error('Error loading template:', error)
        setTemplateExists(false)
      } finally {
        setLoading(false)
      }
    }

    loadTemplate()
  }, [templateId, authLoading])

  // Calculate scale to fit canvas in viewport
  useEffect(() => {
    if (!canvasRef.current) return

    const updateScale = () => {
      const container = canvasRef.current?.parentElement
      if (!container) return

      const containerWidth = container.clientWidth - 400 // Leave space for controls
      const containerHeight = window.innerHeight - 100

      const scaleX = containerWidth / CANVAS_WIDTH
      const scaleY = containerHeight / CANVAS_HEIGHT
      const newScale = Math.min(scaleX, scaleY, 1) // Don't scale up

      setScale(newScale)
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  // Mouse handlers for dragging
  const handleMouseDown = (e: React.MouseEvent, elementId: 'groom' | 'bride' | 'date') => {
    e.preventDefault()
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const element = layout[elementId]
    const elementX = element.xPx * scale
    const elementY = element.yPx * scale

    const offsetX = e.clientX - rect.left - elementX
    const offsetY = e.clientY - rect.top - elementY

    setDragging(elementId)
    setDragOffset({ x: offsetX, y: offsetY })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left - dragOffset.x) / scale
    const mouseY = (e.clientY - rect.top - dragOffset.y) / scale

    // Clamp to canvas bounds
    const clampedX = Math.max(0, Math.min(CANVAS_WIDTH - 100, mouseX))
    const clampedY = Math.max(0, Math.min(CANVAS_HEIGHT - 50, mouseY))

    setLayout((prev) => ({
      ...prev,
      [dragging]: {
        ...prev[dragging],
        xPx: Math.round(clampedX),
        yPx: Math.round(clampedY),
        xPct: clampedX / CANVAS_WIDTH,
        yPct: clampedY / CANVAS_HEIGHT,
      },
    }))
  }

  const handleMouseUp = () => {
    setDragging(null)
  }

  // Font size handlers
  const handleFontSizeChange = (elementId: 'groom' | 'bride' | 'date', fontSize: number) => {
    setLayout((prev) => ({
      ...prev,
      [elementId]: {
        ...prev[elementId],
        fontSize: Math.max(10, Math.min(200, fontSize)),
      },
    }))
  }

  // Save layout to Firestore
  const handleSave = async () => {
    if (!template || !user || !templateId) return

    setSaving(true)
    try {
      const layoutToSave = {
        groom: {
          xPx: layout.groom.xPx,
          yPx: layout.groom.yPx,
          fontSize: layout.groom.fontSize,
          xPct: layout.groom.xPct,
          yPct: layout.groom.yPct,
        },
        bride: {
          xPx: layout.bride.xPx,
          yPx: layout.bride.yPx,
          fontSize: layout.bride.fontSize,
          xPct: layout.bride.xPct,
          yPct: layout.bride.yPct,
        },
        date: {
          xPx: layout.date.xPx,
          yPx: layout.date.yPx,
          fontSize: layout.date.fontSize,
          xPct: layout.date.xPct,
          yPct: layout.date.yPct,
        },
      }

      await updateDoc(doc(db, 'templates', templateId), {
        layoutB: layoutToSave,
        updatedAt: new Date(),
      })

      alert('تم حفظ التخطيط بنجاح!')
    } catch (error) {
      console.error('Error saving layout:', error)
      alert('حدث خطأ أثناء حفظ التخطيط')
    } finally {
      setSaving(false)
    }
  }

  const renderGridOverlay = () => {
    if (!showGrid) return null

    const cols = Math.max(1, Math.min(52, gridCols))
    const rows = Math.max(1, Math.min(60, gridRows))

    const colLetters = Array.from({ length: cols }, (_, i) => {
      // A-Z then AA-...
      const a = 'A'.charCodeAt(0)
      if (i < 26) return String.fromCharCode(a + i)
      const first = Math.floor(i / 26) - 1
      const second = i % 26
      return `${String.fromCharCode(a + first)}${String.fromCharCode(a + second)}`
    })

    return (
      <div className="absolute inset-0 z-40 pointer-events-none">
        {/* Vertical lines + column labels */}
        {Array.from({ length: cols + 1 }, (_, i) => {
          const leftPct = (i / cols) * 100
          return (
            <div key={`v-${i}`}>
              <div
                style={{
                  position: 'absolute',
                  left: `${leftPct}%`,
                  top: 0,
                  width: '1px',
                  height: '100%',
                  background: 'rgba(0, 120, 255, 0.28)',
                }}
              />
              {i < cols && (
                <div
                  style={{
                    position: 'absolute',
                    left: `${(i / cols) * 100}%`,
                    top: 0,
                    transform: 'translateX(-50%)',
                    padding: '2px 4px',
                    fontSize: 12,
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 700,
                    color: 'rgba(0, 80, 200, 0.85)',
                    background: 'rgba(255, 255, 255, 0.55)',
                    borderRadius: 4,
                  }}
                >
                  {colLetters[i]}
                </div>
              )}
            </div>
          )
        })}

        {/* Horizontal lines + row labels */}
        {Array.from({ length: rows + 1 }, (_, i) => {
          const topPct = (i / rows) * 100
          return (
            <div key={`h-${i}`}>
              <div
                style={{
                  position: 'absolute',
                  left: 0,
                  top: `${topPct}%`,
                  width: '100%',
                  height: '1px',
                  background: 'rgba(0, 120, 255, 0.28)',
                }}
              />
              {i < rows && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: `${(i / rows) * 100}%`,
                    transform: 'translateY(-50%)',
                    padding: '2px 4px',
                    fontSize: 12,
                    fontFamily: 'Arial, sans-serif',
                    fontWeight: 700,
                    color: 'rgba(0, 80, 200, 0.85)',
                    background: 'rgba(255, 255, 255, 0.55)',
                    borderRadius: 4,
                    marginLeft: 4,
                  }}
                >
                  {i + 1}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  // Auth check
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted">جاري التحميل...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
          <p className="text-muted mb-6">You must be logged in to access this page.</p>
          <a
            href="/login"
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors inline-block"
          >
            Go to Login
          </a>
        </div>
      </div>
    )
  }

  if (!template || template.type !== 'B') {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">Template Not Found</h1>
          {templateExists === false ? (
            <p className="text-muted mb-6">
              لم يتم العثور على هذا القالب في Firestore.
              <br />
              <span className="font-mono text-xs">id: {templateId}</span>
            </p>
          ) : (
            <p className="text-muted mb-6">
              هذا المحرر مخصص لقوالب Type B فقط.
              <br />
              النوع الحالي: <span className="font-semibold">{template?.type ?? 'غير معروف'}</span>
              {rawTemplateType !== null && (
                <>
                  <br />
                  <span className="text-xs">raw type: <span className="font-mono">{String(rawTemplateType)}</span></span>
                </>
              )}
              <br />
              <span className="font-mono text-xs">id: {templateId}</span>
            </p>
          )}

          {templateExists !== false && template && template.type !== 'B' && templateId && (
            <button
              onClick={async () => {
                const ok = confirm('هل تريد تغيير نوع القالب إلى Type B؟')
                if (!ok || !templateId) return
                try {
                  await updateDoc(doc(db, 'templates', templateId), {
                    type: 'B',
                    updatedAt: new Date(),
                  })
                  setTemplate({ ...template, type: 'B' })
                  alert('تم تحويل القالب إلى Type B. سيتم فتح المحرر الآن.')
                } catch (e) {
                  console.error('Failed to update template type:', e)
                  alert('فشل تحويل نوع القالب. تحقق من الصلاحيات.')
                }
              }}
              className="w-full mb-3 bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors"
            >
              تحويل إلى Type B
            </button>
          )}

          <button
            onClick={() => router.back()}
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.back()}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold">Position Editor</h1>
                <p className="text-muted">{template.name}</p>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              {saving ? 'جاري الحفظ...' : 'حفظ التخطيط'}
            </button>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Canvas */}
          <div className="flex-1 bg-white rounded-2xl p-4 shadow-sm overflow-auto">
            <div
              ref={canvasRef}
              className="relative mx-auto"
              style={{
                width: `${CANVAS_WIDTH * scale}px`,
                height: `${CANVAS_HEIGHT * scale}px`,
                backgroundImage: `url(${template.assets.backgroundUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                cursor: dragging ? 'grabbing' : 'default',
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {renderGridOverlay()}
              {/* Groom Name */}
              <div
                className={`absolute cursor-grab active:cursor-grabbing ${dragging === 'groom' ? 'z-50' : 'z-10'}`}
                style={{
                  left: `${layout.groom.xPx * scale}px`,
                  top: `${layout.groom.yPx * scale}px`,
                  fontSize: `${layout.groom.fontSize * scale}px`,
                  color: '#6B6B6B',
                  fontFamily: 'Amiri, serif',
                  textAlign: 'center',
                  direction: 'rtl',
                  border: '2px solid rgba(255, 0, 0, 0.5)',
                  padding: '4px 8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  borderRadius: '4px',
                  minWidth: '100px',
                }}
                onMouseDown={(e) => handleMouseDown(e, 'groom')}
              >
                <div className="flex items-center gap-2">
                  <Move className="w-4 h-4 opacity-50" />
                  <span>اسم العريس</span>
                </div>
              </div>

              {/* Bride Name */}
              <div
                className={`absolute cursor-grab active:cursor-grabbing ${dragging === 'bride' ? 'z-50' : 'z-10'}`}
                style={{
                  left: `${layout.bride.xPx * scale}px`,
                  top: `${layout.bride.yPx * scale}px`,
                  fontSize: `${layout.bride.fontSize * scale}px`,
                  color: '#6B6B6B',
                  fontFamily: 'Amiri, serif',
                  textAlign: 'center',
                  direction: 'rtl',
                  border: '2px solid rgba(0, 255, 0, 0.5)',
                  padding: '4px 8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  borderRadius: '4px',
                  minWidth: '100px',
                }}
                onMouseDown={(e) => handleMouseDown(e, 'bride')}
              >
                <div className="flex items-center gap-2">
                  <Move className="w-4 h-4 opacity-50" />
                  <span>اسم العروس</span>
                </div>
              </div>

              {/* Date */}
              <div
                className={`absolute cursor-grab active:cursor-grabbing ${dragging === 'date' ? 'z-50' : 'z-10'}`}
                style={{
                  left: `${layout.date.xPx * scale}px`,
                  top: `${layout.date.yPx * scale}px`,
                  fontSize: `${layout.date.fontSize * scale}px`,
                  color: '#6B6B6B',
                  fontFamily: 'Montserrat, sans-serif',
                  textAlign: 'center',
                  border: '2px solid rgba(0, 0, 255, 0.5)',
                  padding: '4px 8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.8)',
                  borderRadius: '4px',
                  minWidth: '100px',
                }}
                onMouseDown={(e) => handleMouseDown(e, 'date')}
              >
                <div className="flex items-center gap-2">
                  <Move className="w-4 h-4 opacity-50" />
                  <span>Date</span>
                </div>
              </div>
            </div>
          </div>

          {/* Controls Panel */}
          <div className="w-96 bg-white rounded-2xl p-6 shadow-sm">
            <h2 className="text-xl font-bold mb-6">Controls</h2>

            {/* Grid Controls (Editor only) */}
            <div className="mb-6 p-4 border rounded-lg bg-gray-50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold">Grid overlay (للتحديد فقط)</h3>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                  />
                  إظهار
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm text-muted">Columns</label>
                  <input
                    type="number"
                    value={gridCols}
                    min={1}
                    max={52}
                    onChange={(e) => setGridCols(parseInt(e.target.value) || DEFAULT_GRID_COLS)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">Rows</label>
                  <input
                    type="number"
                    value={gridRows}
                    min={1}
                    max={60}
                    onChange={(e) => setGridRows(parseInt(e.target.value) || DEFAULT_GRID_ROWS)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
              </div>
              <p className="text-xs text-muted mt-2">
                هذه الشبكة تظهر في المحرر فقط ولن تظهر في الرندر النهائي.
              </p>
            </div>

            {/* Groom Controls */}
            <div className="mb-6 p-4 border border-red-200 rounded-lg bg-red-50">
              <h3 className="font-semibold mb-3 text-red-700">اسم العريس (Groom)</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-sm text-muted">X (px)</label>
                  <input
                    type="number"
                    value={layout.groom.xPx}
                    onChange={(e) => {
                      const xPx = parseInt(e.target.value) || 0
                      setLayout((prev) => ({
                        ...prev,
                        groom: {
                          ...prev.groom,
                          xPx,
                          xPct: xPx / CANVAS_WIDTH,
                        },
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">Y (px)</label>
                  <input
                    type="number"
                    value={layout.groom.yPx}
                    onChange={(e) => {
                      const yPx = parseInt(e.target.value) || 0
                      setLayout((prev) => ({
                        ...prev,
                        groom: {
                          ...prev.groom,
                          yPx,
                          yPct: yPx / CANVAS_HEIGHT,
                        },
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">Font Size (px)</label>
                  <input
                    type="number"
                    value={layout.groom.fontSize}
                    onChange={(e) => handleFontSizeChange('groom', parseInt(e.target.value) || 54)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="text-xs text-muted mt-2">
                  <div>X%: {layout.groom.xPct.toFixed(4)}</div>
                  <div>Y%: {layout.groom.yPct.toFixed(4)}</div>
                </div>
              </div>
            </div>

            {/* Bride Controls */}
            <div className="mb-6 p-4 border border-green-200 rounded-lg bg-green-50">
              <h3 className="font-semibold mb-3 text-green-700">اسم العروس (Bride)</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-sm text-muted">X (px)</label>
                  <input
                    type="number"
                    value={layout.bride.xPx}
                    onChange={(e) => {
                      const xPx = parseInt(e.target.value) || 0
                      setLayout((prev) => ({
                        ...prev,
                        bride: {
                          ...prev.bride,
                          xPx,
                          xPct: xPx / CANVAS_WIDTH,
                        },
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">Y (px)</label>
                  <input
                    type="number"
                    value={layout.bride.yPx}
                    onChange={(e) => {
                      const yPx = parseInt(e.target.value) || 0
                      setLayout((prev) => ({
                        ...prev,
                        bride: {
                          ...prev.bride,
                          yPx,
                          yPct: yPx / CANVAS_HEIGHT,
                        },
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">Font Size (px)</label>
                  <input
                    type="number"
                    value={layout.bride.fontSize}
                    onChange={(e) => handleFontSizeChange('bride', parseInt(e.target.value) || 54)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="text-xs text-muted mt-2">
                  <div>X%: {layout.bride.xPct.toFixed(4)}</div>
                  <div>Y%: {layout.bride.yPct.toFixed(4)}</div>
                </div>
              </div>
            </div>

            {/* Date Controls */}
            <div className="mb-6 p-4 border border-blue-200 rounded-lg bg-blue-50">
              <h3 className="font-semibold mb-3 text-blue-700">التاريخ (Date)</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-sm text-muted">X (px)</label>
                  <input
                    type="number"
                    value={layout.date.xPx}
                    onChange={(e) => {
                      const xPx = parseInt(e.target.value) || 0
                      setLayout((prev) => ({
                        ...prev,
                        date: {
                          ...prev.date,
                          xPx,
                          xPct: xPx / CANVAS_WIDTH,
                        },
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">Y (px)</label>
                  <input
                    type="number"
                    value={layout.date.yPx}
                    onChange={(e) => {
                      const yPx = parseInt(e.target.value) || 0
                      setLayout((prev) => ({
                        ...prev,
                        date: {
                          ...prev.date,
                          yPx,
                          yPct: yPx / CANVAS_HEIGHT,
                        },
                      }))
                    }}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">Font Size (px)</label>
                  <input
                    type="number"
                    value={layout.date.fontSize}
                    onChange={(e) => handleFontSizeChange('date', parseInt(e.target.value) || 24)}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div className="text-xs text-muted mt-2">
                  <div>X%: {layout.date.xPct.toFixed(4)}</div>
                  <div>Y%: {layout.date.yPct.toFixed(4)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
