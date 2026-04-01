'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth/context'
import { doc, getDoc, collection, query, where, limit, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
// Import presets directly (client-side safe)
import presetA from '@/lib/template-presets/A.json'
import presetB from '@/lib/template-presets/B.json'
import presetC from '@/lib/template-presets/C.json'
import type { TemplatePreset, TextBlock, TemplateType } from '@/lib/template-presets/types'
import { Save, ArrowLeft, Grid, Palette, Type, Eye, Sparkles, Plus } from 'lucide-react'
import { formatDateForInvitation } from '@/lib/render/date-format'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

const CANVAS_WIDTH = 1080
const CANVAS_HEIGHT = 1920
const DEFAULT_GRID_COLS = 26 // A-Z
const DEFAULT_GRID_ROWS = 30
type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
const FONT_OPTIONS = [
  'Cairo',
  'Amiri',
  'TheSans alinma',
  'IranNastaliq',
  'AMoshrefNaskh',
  'Tajawal',
  'Noto Kufi Arabic',
  'Noto Naskh Arabic',
  'IBM Plex Sans Arabic',
  'Montserrat',
  'Cormorant Garamond',
  'Arial',
  'Tahoma',
]

// Helper function to get default preset (client-side safe)
function getDefaultPreset(type: TemplateType): TemplatePreset {
  switch (type) {
    case 'A':
      return presetA as TemplatePreset
    case 'B':
      return presetB as TemplatePreset
    case 'C':
      return presetC as TemplatePreset
    default:
      return presetA as TemplatePreset
  }
}

function mergePresetWithDefault(type: TemplateType, incoming: TemplatePreset): TemplatePreset {
  const fallback = getDefaultPreset(type)
  const incomingById = new Map(incoming.textBlocks.map((block) => [block.id, block]))

  // Keep incoming order/settings, and append any missing required blocks from default preset.
  const mergedBlocks: TextBlock[] = [...incoming.textBlocks]
  for (const defaultBlock of fallback.textBlocks) {
    if (!incomingById.has(defaultBlock.id)) {
      mergedBlocks.push(defaultBlock as TextBlock)
    }
  }

  return {
    ...fallback,
    ...incoming,
    textBlocks: mergedBlocks,
  }
}

export default function PresetEditorPage() {
  const params = useParams()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)
  const presetType = (params.type as string)?.toUpperCase() as TemplateType
  const templateId = searchParams.get('templateId') || ''
  const templateNameFromQuery = searchParams.get('templateName') || ''

  const [preset, setPreset] = useState<TemplatePreset | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [scale, setScale] = useState(1)
  const canvasRef = useRef<HTMLDivElement>(null)
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
  const [showGrid, setShowGrid] = useState(true)
  const [gridCols, setGridCols] = useState(DEFAULT_GRID_COLS)
  const [gridRows, setGridRows] = useState(DEFAULT_GRID_ROWS)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [backgroundUrl, setBackgroundUrl] = useState<string | null>(null)
  const [localBackgroundObjectUrl, setLocalBackgroundObjectUrl] = useState<string | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const [resizing, setResizing] = useState<{
    blockId: string
    dir: ResizeDirection
    startMouseX: number
    startMouseY: number
    startBox: { x: number; y: number; w: number; h: number }
  } | null>(null)
  const [auditLoading, setAuditLoading] = useState(false)
  const [dynamicFontCss, setDynamicFontCss] = useState('')
  const [bulkTextColor, setBulkTextColor] = useState('#2a2a2a')
  const [ruleIcons, setRuleIcons] = useState({
    noKidsUrl: '/icons/no-kids.svg',
    noPhotographyUrl: '/icons/no-photo.svg',
  })
  const [ruleIconFiles, setRuleIconFiles] = useState<{
    noKids: File | null
    noPhotography: File | null
  }>({
    noKids: null,
    noPhotography: null,
  })
  const [updatingRuleIcon, setUpdatingRuleIcon] = useState<'noKids' | 'noPhotography' | null>(null)
  const [auditResult, setAuditResult] = useState<{
    score: number
    findings: string[]
    suggestions: string[]
    source: string
  } | null>(null)
  
  // Sample text for preview
  const [sampleTexts, setSampleTexts] = useState({
    groomNameAr: 'محمد',
    brideNameAr: 'فاطمة',
    dateText: '2026-02-15',
    fatherOfBride: 'خالد العائلة',
    fatherOfGroom: 'عبدالله العائلة',
    motherOfBride: 'ابنة السيدة أم سارة',
    motherOfGroom: 'ابن السيدة أم عبدالله',
    weddingDayLine: 'وذلك بمشيئة الله تعالى يوم الجمعة',
    fullDateLine: '10 أبريل 2026 م  |  22 شوال 1447 هـ',
    hallLocation: 'قاعة اللؤلؤة - الرياض',
    receptionTime: 'يبدأ الاستقبال 8:00 مساءً',
    zaffaTime: 'موعد الزفة 10:00 مساءً',
    noKids: true,
    noPhotography: true,
  })

  const selectedBlockData = preset?.textBlocks.find((b) => b.id === selectedBlock) || null

  // Load preset and background
  useEffect(() => {
    if (!presetType || !['A', 'B', 'C'].includes(presetType) || authLoading || !isAdmin) {
      if (!authLoading) setLoading(false)
      return
    }

    async function loadPreset() {
      try {
        // 1) Load latest preset from server-side Admin API (source of truth)
        const serverRes = await fetch(
          `/api/admin/presets?type=${presetType}${templateId ? `&templateId=${templateId}` : ''}`
        )
        if (serverRes.ok) {
          const serverData = await serverRes.json()
          if (serverData?.preset) {
            setPreset(mergePresetWithDefault(presetType, serverData.preset as TemplatePreset))
            console.log('✅ Loaded preset from Admin API')
          } else {
            const jsonPreset = getDefaultPreset(presetType)
            setPreset(jsonPreset)
            console.log('✅ Loaded preset from JSON fallback')
          }
        } else {
          // 2) Fallback to client Firestore if API unavailable
          const presetDocRef = doc(db, 'presets', presetType)
          const presetDoc = await getDoc(presetDocRef)
          if (presetDoc.exists()) {
            const data = presetDoc.data()
            const { updatedAt, updatedBy, ...presetData } = data
            setPreset(mergePresetWithDefault(presetType, presetData as TemplatePreset))
            console.log('✅ Loaded preset from Firestore fallback')
          } else {
            const jsonPreset = getDefaultPreset(presetType)
            setPreset(jsonPreset)
            console.log('✅ Loaded preset from JSON fallback')
          }
        }

        // Load background for current template if provided, otherwise sample by type.
        if (templateId) {
          const templateDoc = await getDoc(doc(db, 'templates', templateId))
          if (templateDoc.exists()) {
            const template = templateDoc.data()
            setBackgroundUrl(template.assets?.backgroundUrl || null)
          }
        } else {
          const templatesQuery = query(
            collection(db, 'templates'),
            where('type', '==', presetType),
            limit(1)
          )
          const templatesSnapshot = await getDocs(templatesQuery)
          if (!templatesSnapshot.empty) {
            const template = templatesSnapshot.docs[0].data()
            setBackgroundUrl(template.assets?.backgroundUrl || null)
            console.log('✅ Loaded background URL')
          } else {
            console.warn('⚠️ No template found for type ' + presetType)
          }
        }
      } catch (error) {
        console.error('Error loading preset:', error)
        // Fallback to JSON file
        const jsonPreset = getDefaultPreset(presetType)
        setPreset(jsonPreset)
      } finally {
        setLoading(false)
      }
    }

    loadPreset()
  }, [presetType, authLoading, isAdmin, templateId])

  useEffect(() => {
    if (!user || !isAdmin) return

    const loadFontsForEditor = async () => {
      try {
        const idToken = await user.getIdToken()
        const response = await fetch('/api/admin/fonts/css', {
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(data?.error || 'Failed to load fonts css')
        }
        setDynamicFontCss(typeof data?.css === 'string' ? data.css : '')
      } catch (error) {
        console.error('Failed to load editor fonts:', error)
      }
    }

    loadFontsForEditor()
  }, [user, isAdmin])

  useEffect(() => {
    if (!user || !isAdmin || templateId) return
    const loadRuleIcons = async () => {
      try {
        const token = await user.getIdToken()
        const response = await fetch('/api/admin/rule-icons', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok) return
        setRuleIcons({
          noKidsUrl: data?.noKidsUrl || '/icons/no-kids.svg',
          noPhotographyUrl: data?.noPhotographyUrl || '/icons/no-photo.svg',
        })
      } catch (error) {
        console.error('Failed to load rule icons:', error)
      }
    }
    loadRuleIcons()
  }, [user, isAdmin, templateId])

  useEffect(() => {
    return () => {
      if (localBackgroundObjectUrl) {
        URL.revokeObjectURL(localBackgroundObjectUrl)
      }
    }
  }, [localBackgroundObjectUrl])

  // Calculate scale to fit canvas in viewport
  useEffect(() => {
    if (!canvasRef.current) return

    const updateScale = () => {
      const container = canvasRef.current?.parentElement
      if (!container) return

      const containerWidth = container.clientWidth - 50
      const containerHeight = window.innerHeight - 200

      const scaleX = containerWidth / CANVAS_WIDTH
      const scaleY = containerHeight / CANVAS_HEIGHT
      const newScale = Math.min(scaleX, scaleY, 1)

      setScale(newScale)
    }

    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [])

  // Update text block
  const updateTextBlock = (blockId: string, updates: Partial<TextBlock>) => {
    if (!preset) return

    setPreset({
      ...preset,
      textBlocks: preset.textBlocks.map((block) =>
        block.id === blockId ? { ...block, ...updates } : block
      ),
    })
  }

  const handleAddTextBlock = () => {
    if (!preset) return

    const existingIds = new Set(preset.textBlocks.map((block) => block.id))
    let index = preset.textBlocks.length + 1
    let nextId = `text_${index}`
    while (existingIds.has(nextId)) {
      index += 1
      nextId = `text_${index}`
    }

    const newBlock: TextBlock = {
      id: nextId,
      kind: 'text',
      fallbackText: 'نص جديد',
      boxPct: {
        x: 0.1,
        y: 0.1,
        w: 0.8,
        h: 0.06,
      },
      font: {
        familyKey: 'arabic',
        baseSize: 48,
        minSize: 18,
        weight: 400,
      },
      color: '#2a2a2a',
      align: 'center',
      lineHeight: 1.2,
      letterSpacing: 0,
      maxLines: 1,
      autoFit: true,
      forceSingleLine: true,
      autoExpandWidthPct: 0.9,
    }

    setPreset({
      ...preset,
      textBlocks: [...preset.textBlocks, newBlock],
    })
    setSelectedBlock(newBlock.id)
  }

  const applyColorToAllTextBlocks = (color: string) => {
    if (!preset) return
    setPreset({
      ...preset,
      textBlocks: preset.textBlocks.map((block) =>
        block.kind === 'image' ? block : { ...block, color }
      ),
    })
  }

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent, blockId: string) => {
    e.preventDefault()
    if (!canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const block = preset?.textBlocks.find((b) => b.id === blockId)
    if (!block) return

    const blockX = block.boxPct.x * CANVAS_WIDTH * scale
    const blockY = block.boxPct.y * CANVAS_HEIGHT * scale

    const offsetX = e.clientX - rect.left - blockX
    const offsetY = e.clientY - rect.top - blockY

    setDragging(blockId)
    setDragOffset({ x: offsetX, y: offsetY })
    setSelectedBlock(blockId)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!canvasRef.current || !preset) return

    if (resizing) {
      const block = preset.textBlocks.find((b) => b.id === resizing.blockId)
      if (!block) return

      const minWPct = 0.04
      const minHPct = 0.03
      const deltaXPct = (e.clientX - resizing.startMouseX) / (CANVAS_WIDTH * scale)
      const deltaYPct = (e.clientY - resizing.startMouseY) / (CANVAS_HEIGHT * scale)
      let { x, y, w, h } = resizing.startBox
      const dir = resizing.dir

      if (dir.includes('e')) {
        w = Math.max(minWPct, resizing.startBox.w + deltaXPct)
      }
      if (dir.includes('s')) {
        h = Math.max(minHPct, resizing.startBox.h + deltaYPct)
      }
      if (dir.includes('w')) {
        const nextX = resizing.startBox.x + deltaXPct
        const nextW = resizing.startBox.w - deltaXPct
        if (nextW >= minWPct) {
          x = nextX
          w = nextW
        }
      }
      if (dir.includes('n')) {
        const nextY = resizing.startBox.y + deltaYPct
        const nextH = resizing.startBox.h - deltaYPct
        if (nextH >= minHPct) {
          y = nextY
          h = nextH
        }
      }

      x = Math.max(0, Math.min(1 - w, x))
      y = Math.max(0, Math.min(1 - h, y))
      w = Math.min(w, 1 - x)
      h = Math.min(h, 1 - y)

      updateTextBlock(block.id, {
        boxPct: { ...block.boxPct, x, y, w, h },
      })
      return
    }

    if (!dragging) return

    const rect = canvasRef.current.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left - dragOffset.x) / scale
    const mouseY = (e.clientY - rect.top - dragOffset.y) / scale

    const block = preset.textBlocks.find((b) => b.id === dragging)
    if (!block) return

    // Clamp to canvas bounds
    const clampedX = Math.max(0, Math.min(CANVAS_WIDTH - (block.boxPct.w * CANVAS_WIDTH), mouseX))
    const clampedY = Math.max(0, Math.min(CANVAS_HEIGHT - (block.boxPct.h * CANVAS_HEIGHT), mouseY))

    const newX = clampedX / CANVAS_WIDTH
    const newY = clampedY / CANVAS_HEIGHT

    updateTextBlock(dragging, {
      boxPct: {
        ...block.boxPct,
        x: newX,
        y: newY,
      },
    })
  }

  const handleMouseUp = () => {
    setDragging(null)
    setResizing(null)
  }

  const handleResizeMouseDown = (
    e: React.MouseEvent,
    blockId: string,
    dir: ResizeDirection
  ) => {
    e.preventDefault()
    e.stopPropagation()
    if (!preset) return
    const block = preset.textBlocks.find((b) => b.id === blockId)
    if (!block) return
    setSelectedBlock(blockId)
    setDragging(null)
    setResizing({
      blockId,
      dir,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBox: {
        x: block.boxPct.x,
        y: block.boxPct.y,
        w: block.boxPct.w,
        h: block.boxPct.h,
      },
    })
  }

  const handleBackgroundFileChange = (file?: File | null) => {
    if (!file) return
    if (localBackgroundObjectUrl) {
      URL.revokeObjectURL(localBackgroundObjectUrl)
    }
    const url = URL.createObjectURL(file)
    setLocalBackgroundObjectUrl(url)
    setBackgroundUrl(url)
  }

  const handleSmartAudit = async () => {
    if (!preset || !user) return
    setAuditLoading(true)
    try {
      const idToken = await user.getIdToken()
      const response = await fetch('/api/admin/ai-audit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          presetType,
          preset,
          sampleTexts: {
            groomNameAr: sampleTexts.groomNameAr,
            brideNameAr: sampleTexts.brideNameAr,
            dateText: formatDateForInvitation(sampleTexts.dateText),
          },
        }),
      })

      const data = await response.json()
      if (!response.ok) {
        throw new Error(data.error || 'Failed to run smart audit')
      }

      setAuditResult(data.audit)
    } catch (error: any) {
      console.error('Smart audit failed:', error)
      alert(`فشل التدقيق الذكي: ${error.message || 'خطأ غير متوقع'}`)
    } finally {
      setAuditLoading(false)
    }
  }

  const handleUpdateRuleIcon = async (kind: 'noKids' | 'noPhotography') => {
    if (!user || !isAdmin || templateId) return
    const file = ruleIconFiles[kind]
    if (!file) {
      alert('اختر صورة أولاً')
      return
    }

    setUpdatingRuleIcon(kind)
    try {
      const token = await user.getIdToken()
      const formData = new FormData()
      formData.append('kind', kind)
      formData.append('file', file)
      const response = await fetch('/api/admin/rule-icons', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        throw new Error(data?.error || 'فشل تحديث الأيقونة')
      }
      setRuleIcons({
        noKidsUrl: data?.noKidsUrl || '/icons/no-kids.svg',
        noPhotographyUrl: data?.noPhotographyUrl || '/icons/no-photo.svg',
      })
      setRuleIconFiles((prev) => ({ ...prev, [kind]: null }))
      alert('✅ تم تحديث الأيقونة وتطبيقها على جميع النماذج والتصاميم.')
    } catch (error: any) {
      alert(`❌ ${error?.message || 'فشل تحديث الأيقونة'}`)
    } finally {
      setUpdatingRuleIcon(null)
    }
  }

  // Save preset to Firestore
  const handleSave = async () => {
    if (!preset || !user || !presetType) return

    setSaving(true)
    try {
      const idToken = await user.getIdToken()
      const response = await fetch('/api/admin/presets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          presetType,
          preset,
          templateId: templateId || undefined,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save preset')
      }

      if (templateId) {
        alert('✅ تم حفظ التعديلات لهذا التصميم فقط بنجاح.')
      } else {
        alert('✅ تم حفظ التعديلات بنجاح!\n\nجميع التصاميم من هذا النوع ستستخدم الإعدادات الجديدة.')
      }
    } catch (error) {
      console.error('Error saving preset:', error)
      alert('❌ حدث خطأ أثناء حفظ التعديلات')
    } finally {
      setSaving(false)
    }
  }

  // Generate preview
  const handlePreview = async () => {
    if (!preset || !backgroundUrl) {
      alert('يرجى التأكد من وجود خلفية للتصميم. ارفع template من نوع ' + presetType + ' أولاً.')
      return
    }

    try {
      setSaving(true)
      
      const response = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: 'preview-preset',
          variant: 'whatsapp_1080x1920',
          fields: {
            groomNameAr: sampleTexts.groomNameAr,
            brideNameAr: sampleTexts.brideNameAr,
            dateText: formatDateForInvitation(sampleTexts.dateText),
            date: sampleTexts.dateText,
            date_en: formatDateForInvitation(sampleTexts.dateText),
            fatherOfBride: sampleTexts.fatherOfBride,
            fatherOfGroom: sampleTexts.fatherOfGroom,
            motherOfBride: sampleTexts.motherOfBride,
            motherOfGroom: sampleTexts.motherOfGroom,
            weddingDayLine: sampleTexts.weddingDayLine,
            fullDateLine: sampleTexts.fullDateLine,
            hallLocation: sampleTexts.hallLocation,
            receptionTime: sampleTexts.receptionTime,
            zaffaTime: sampleTexts.zaffaTime,
            noKids: sampleTexts.noKids ? '1' : '0',
            noPhotography: sampleTexts.noPhotography ? '1' : '0',
          },
          customPreset: preset,
          customBackgroundUrl: backgroundUrl,
        }),
      })

      const data = await response.json()
      if (response.ok && data?.url) {
        setPreviewUrl(data.url)
      } else {
        alert('خطأ في المعاينة: ' + (data?.error || 'حدث خطأ'))
      }
    } catch (error) {
      console.error('Error generating preview:', error)
      alert('حدث خطأ أثناء إنشاء المعاينة')
    } finally {
      setSaving(false)
    }
  }

  // Render grid overlay
  const renderGridOverlay = () => {
    if (!showGrid) return null

    const columnWidth = CANVAS_WIDTH / gridCols
    const rowHeight = CANVAS_HEIGHT / gridRows

    return (
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          width: `${CANVAS_WIDTH * scale}px`,
          height: `${CANVAS_HEIGHT * scale}px`,
        }}
      >
        {/* Column lines */}
        {Array.from({ length: gridCols + 1 }).map((_, i) => {
          const x = (i * columnWidth) * scale
          const letter = String.fromCharCode(65 + i)
          return (
            <div key={`col-${i}`}>
              <div
                className="absolute bg-blue-500 opacity-30"
                style={{
                  left: `${x}px`,
                  top: 0,
                  width: '1px',
                  height: `${CANVAS_HEIGHT * scale}px`,
                }}
              />
              {i < gridCols && (
                <div
                  className="absolute bg-blue-600 text-white text-xs font-bold px-1 rounded"
                  style={{
                    left: `${x + 2}px`,
                    top: '2px',
                  }}
                >
                  {letter}
                </div>
              )}
            </div>
          )
        })}

        {/* Row lines */}
        {Array.from({ length: gridRows + 1 }).map((_, i) => {
          const y = (i * rowHeight) * scale
          return (
            <div key={`row-${i}`}>
              <div
                className="absolute bg-blue-500 opacity-30"
                style={{
                  left: 0,
                  top: `${y}px`,
                  width: `${CANVAS_WIDTH * scale}px`,
                  height: '1px',
                }}
              />
              <div
                className="absolute bg-blue-600 text-white text-xs font-bold px-1 rounded"
                style={{
                  left: '2px',
                  top: `${y + 2}px`,
                }}
              >
                {i + 1}
              </div>
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

  if (!preset || !['A', 'B', 'C'].includes(presetType)) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
          <h1 className="text-2xl font-bold mb-4">Invalid Preset Type</h1>
          <p className="text-muted mb-6">Preset type must be A, B, or C.</p>
          <button
            onClick={() => router.push('/admin')}
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
      {dynamicFontCss && <style jsx global>{dynamicFontCss}</style>}
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/admin')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold">
                  {templateId ? `تعديل تصميم: ${templateNameFromQuery || templateId}` : `تعديل النموذج ${presetType}`}
                </h1>
                <p className="text-muted text-sm">
                  {templateId
                    ? 'هذا التعديل خاص بهذا التصميم فقط. باقي تصاميم النوع لن تتأثر.'
                    : preset.name}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleAddTextBlock}
                disabled={saving}
                className="bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg font-semibold hover:bg-emerald-100 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Plus className="w-4 h-4" />
                إضافة نص
              </button>
              <div className="flex items-center gap-2 bg-gray-50 border rounded-lg px-2 py-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBlock('ALL_TEXT_BLOCKS')
                    applyColorToAllTextBlocks(bulkTextColor)
                  }}
                  className="px-3 py-2 rounded bg-white border text-sm font-semibold hover:bg-gray-100"
                >
                  تحديد كل النصوص
                </button>
                <input
                  type="color"
                  value={bulkTextColor}
                  onChange={(e) => {
                    setBulkTextColor(e.target.value)
                    applyColorToAllTextBlocks(e.target.value)
                  }}
                  className="w-10 h-9 border rounded"
                  title="تلوين جميع النصوص"
                />
              </div>
              <button
                onClick={handleSmartAudit}
                disabled={auditLoading || saving}
                className="bg-violet-50 text-violet-700 px-4 py-2 rounded-lg font-semibold hover:bg-violet-100 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                {auditLoading ? 'جاري التدقيق...' : 'تدقيق ذكي'}
              </button>
              <button
                onClick={handlePreview}
                disabled={saving}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg font-semibold hover:bg-gray-200 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                <Eye className="w-4 h-4" />
                معاينة
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                <Save className="w-5 h-5" />
                {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </button>
            </div>
          </div>
        </div>

        {!templateId && (
          <div className="bg-white rounded-2xl p-6 mb-4 shadow-sm border border-gray-100">
            <h2 className="text-xl font-bold mb-4">إدارة أيقونات القواعد (عام لكل النظام)</h2>
            <p className="text-sm text-muted mb-4">
              تحديث هذه الأيقونات يطبق تلقائيًا على جميع النماذج والتصاميم (A/B/C) الحالية.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold mb-3">ممنوع اصطحاب الأطفال</h3>
                <div className="w-20 h-20 rounded-lg border bg-white flex items-center justify-center mb-3 overflow-hidden">
                  <img src={ruleIcons.noKidsUrl} alt="No kids icon" className="max-w-full max-h-full object-contain" />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setRuleIconFiles((prev) => ({
                      ...prev,
                      noKids: e.target.files?.[0] || null,
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-lg mb-3"
                />
                <button
                  type="button"
                  onClick={() => handleUpdateRuleIcon('noKids')}
                  disabled={!ruleIconFiles.noKids || updatingRuleIcon === 'noKids'}
                  className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {updatingRuleIcon === 'noKids' ? 'جاري التحديث...' : 'إدراج صورة ممنوع الأطفال'}
                </button>
              </div>

              <div className="rounded-xl border border-gray-200 p-4">
                <h3 className="font-semibold mb-3">ممنوع التصوير</h3>
                <div className="w-20 h-20 rounded-lg border bg-white flex items-center justify-center mb-3 overflow-hidden">
                  <img
                    src={ruleIcons.noPhotographyUrl}
                    alt="No photography icon"
                    className="max-w-full max-h-full object-contain"
                  />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) =>
                    setRuleIconFiles((prev) => ({
                      ...prev,
                      noPhotography: e.target.files?.[0] || null,
                    }))
                  }
                  className="w-full px-3 py-2 border rounded-lg mb-3"
                />
                <button
                  type="button"
                  onClick={() => handleUpdateRuleIcon('noPhotography')}
                  disabled={!ruleIconFiles.noPhotography || updatingRuleIcon === 'noPhotography'}
                  className="w-full bg-primary text-white py-2.5 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {updatingRuleIcon === 'noPhotography' ? 'جاري التحديث...' : 'إدراج صورة ممنوع التصوير'}
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedBlockData && (
          <div className="bg-white rounded-2xl p-4 mb-4 shadow-sm border">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-40">
                <p className="text-xs text-muted mb-1">العنصر المحدد</p>
                <p className="font-semibold">{selectedBlockData.id}</p>
              </div>
              {selectedBlockData.kind !== 'image' && (
                <>
                  <label className="text-xs text-muted">
                    الحجم
                    <input
                      type="number"
                      min={10}
                      max={160}
                      value={selectedBlockData.font.baseSize}
                      onChange={(e) =>
                        updateTextBlock(selectedBlockData.id, {
                          font: {
                            ...selectedBlockData.font,
                            baseSize: Number(e.target.value) || selectedBlockData.font.baseSize,
                          },
                        })
                      }
                      className="mt-1 w-24 px-2 py-1 border rounded text-sm block"
                    />
                  </label>
                  <label className="text-xs text-muted">
                    الخط
                    <select
                      value={selectedBlockData.font.familyName || ''}
                      onChange={(e) =>
                        updateTextBlock(selectedBlockData.id, {
                          font: {
                            ...selectedBlockData.font,
                            familyName: e.target.value || undefined,
                          },
                        })
                      }
                      className="mt-1 min-w-40 px-2 py-1 border rounded text-sm block"
                    >
                      <option value="">افتراضي حسب اللغة</option>
                      {FONT_OPTIONS.map((fontName) => (
                        <option key={fontName} value={fontName}>
                          {fontName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-muted">
                    اللون
                    <input
                      type="color"
                      value={selectedBlockData.color}
                      onChange={(e) => updateTextBlock(selectedBlockData.id, { color: e.target.value })}
                      className="mt-1 w-12 h-9 border rounded block"
                    />
                  </label>
                  <label className="text-xs text-muted min-w-52">
                    النص الثابت
                    <input
                      type="text"
                      value={selectedBlockData.fallbackText || ''}
                      onChange={(e) => updateTextBlock(selectedBlockData.id, { fallbackText: e.target.value })}
                      className="mt-1 w-full px-2 py-1 border rounded text-sm block"
                      placeholder="اختياري: يظهر عند عدم وجود حقل"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() =>
                      updateTextBlock(selectedBlockData.id, {
                        font: {
                          ...selectedBlockData.font,
                          weight: selectedBlockData.font.weight >= 700 ? 400 : 700,
                        },
                      })
                    }
                    className={`px-3 py-2 rounded border text-sm font-bold ${
                      selectedBlockData.font.weight >= 700
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    B
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateTextBlock(selectedBlockData.id, {
                        forceSingleLine: !(selectedBlockData.forceSingleLine ?? selectedBlockData.maxLines === 1),
                      })
                    }
                    className={`px-3 py-2 rounded border text-sm ${
                      selectedBlockData.forceSingleLine || selectedBlockData.maxLines === 1
                        ? 'bg-primarySoft text-primary border-primary'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    سطر واحد ذكي
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      updateTextBlock(selectedBlockData.id, {
                        autoFit: !selectedBlockData.autoFit,
                      })
                    }
                    className={`px-3 py-2 rounded border text-sm ${
                      selectedBlockData.autoFit
                        ? 'bg-primarySoft text-primary border-primary'
                        : 'bg-white text-gray-700 border-gray-300'
                    }`}
                  >
                    Auto Fit
                  </button>
                </>
              )}
            </div>
          </div>
        )}

        <div className="flex gap-4 flex-col 2xl:flex-row">
          {/* Canvas */}
          <div className="flex-1 bg-white rounded-2xl p-4 shadow-sm overflow-auto">
            {!backgroundUrl && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <p className="text-yellow-800 text-sm">
                  ⚠️ لا توجد خلفية للتصميم. يرجى رفع template من نوع {presetType} أولاً.
                </p>
              </div>
            )}
            <div
              ref={canvasRef}
              className="relative mx-auto"
              style={{
                width: `${CANVAS_WIDTH * scale}px`,
                height: `${CANVAS_HEIGHT * scale}px`,
                background:
                  'linear-gradient(45deg, #f0f0f0 25%, transparent 25%), linear-gradient(-45deg, #f0f0f0 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #f0f0f0 75%), linear-gradient(-45deg, transparent 75%, #f0f0f0 75%)',
                backgroundSize: '20px 20px',
              }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {backgroundUrl && (
                <img
                  src={backgroundUrl}
                  alt="Template background"
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none select-none"
                  draggable={false}
                  style={{
                    imageRendering: 'auto',
                    WebkitBackfaceVisibility: 'hidden',
                  }}
                />
              )}

              {/* Text blocks preview */}
              {preset.textBlocks.map((block) => {
                const xPx = block.boxPct.x * CANVAS_WIDTH * scale
                const yPx = block.boxPct.y * CANVAS_HEIGHT * scale
                const wPx = block.boxPct.w * CANVAS_WIDTH * scale
                const hPx = block.boxPct.h * CANVAS_HEIGHT * scale
                const isSelected = selectedBlock === block.id
                const isDragging = dragging === block.id

                // Get sample text for this block
                let displayText = block.id
                if (block.id === 'groom_name' || block.id === 'groomNameAr') {
                  displayText = sampleTexts.groomNameAr || block.id
                } else if (block.id === 'bride_name' || block.id === 'brideNameAr') {
                  displayText = sampleTexts.brideNameAr || block.id
                } else if (block.id === 'date' || block.id === 'dateText' || block.id === 'date_en') {
                  displayText = sampleTexts.dateText || block.id
                } else if (block.id === 'mother_of_bride') {
                  displayText = sampleTexts.motherOfBride || block.id
                } else if (block.id === 'mother_of_groom') {
                  displayText = sampleTexts.motherOfGroom || block.id
                } else if (block.id === 'father_of_bride') {
                  displayText = sampleTexts.fatherOfBride || block.id
                } else if (block.id === 'father_of_groom') {
                  displayText = sampleTexts.fatherOfGroom || block.id
                } else if (block.id === 'wedding_day_line') {
                  displayText = sampleTexts.weddingDayLine || block.id
                } else if (block.id === 'full_date_line') {
                  displayText = sampleTexts.fullDateLine || block.id
                } else if (block.id === 'hall_location') {
                  displayText = sampleTexts.hallLocation || block.id
                } else if (block.id === 'reception_time') {
                  displayText = sampleTexts.receptionTime || block.id
                } else if (block.id === 'zaffa_time') {
                  displayText = sampleTexts.zaffaTime || block.id
                }
                if (displayText === block.id && block.fallbackText) {
                  displayText = block.fallbackText
                }

                const isImage = block.kind === 'image'
                const showImage =
                  !isImage ||
                  (block.visibleWhenField === 'noKids' && sampleTexts.noKids) ||
                  (block.visibleWhenField === 'noPhotography' && sampleTexts.noPhotography)
                if (!showImage) return null

                return (
                  <div
                    key={block.id}
                    className={`absolute transition-all ${
                      isSelected ? 'ring-2 ring-primary ring-offset-2 z-50' : 'z-10'
                    } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    style={{
                      left: `${xPx}px`,
                      top: `${yPx}px`,
                      width: `${wPx}px`,
                      height: `${hPx}px`,
                      border: `2px dashed ${isSelected ? '#6B4EFF' : 'rgba(107, 78, 255, 0.55)'}`,
                      backgroundColor: 'transparent',
                      fontSize: `${block.font.baseSize * scale}px`,
                      color: block.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textAlign: block.align,
                      direction: block.font.familyKey === 'arabic' ? 'rtl' : 'ltr',
                      fontFamily:
                        block.font.familyName ||
                        (block.font.familyKey === 'arabic' ? 'Amiri, serif' : 'Montserrat, sans-serif'),
                      fontWeight: block.font.weight,
                      textShadow:
                        block.font.weight >= 700
                          ? '0 0 0 currentColor, 0.28px 0 currentColor, -0.28px 0 currentColor'
                          : 'none',
                      padding: isImage ? '0px' : '4px',
                      borderRadius: '4px',
                    }}
                    onClick={() => setSelectedBlock(block.id)}
                    onMouseDown={(e) => handleMouseDown(e, block.id)}
                  >
                    {isImage ? (
                      block.imageSrc ? (
                        <img src={block.imageSrc} alt={block.id} className="w-full h-full object-contain pointer-events-none" />
                      ) : (
                        <span className="text-xs">image</span>
                      )
                    ) : (
                      <span className="text-center break-words">{displayText}</span>
                    )}
                    {isSelected && (
                      <>
                        <button
                          type="button"
                          onMouseDown={(e) => handleResizeMouseDown(e, block.id, 'nw')}
                          className="absolute -top-2 -left-2 w-3 h-3 rounded-sm bg-primary border border-white cursor-nwse-resize"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => handleResizeMouseDown(e, block.id, 'ne')}
                          className="absolute -top-2 -right-2 w-3 h-3 rounded-sm bg-primary border border-white cursor-nesw-resize"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => handleResizeMouseDown(e, block.id, 'sw')}
                          className="absolute -bottom-2 -left-2 w-3 h-3 rounded-sm bg-primary border border-white cursor-nesw-resize"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => handleResizeMouseDown(e, block.id, 'se')}
                          className="absolute -bottom-2 -right-2 w-3 h-3 rounded-sm bg-primary border border-white cursor-nwse-resize"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => handleResizeMouseDown(e, block.id, 'n')}
                          className="absolute -top-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-sm bg-primary border border-white cursor-ns-resize"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => handleResizeMouseDown(e, block.id, 's')}
                          className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3 h-3 rounded-sm bg-primary border border-white cursor-ns-resize"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => handleResizeMouseDown(e, block.id, 'e')}
                          className="absolute top-1/2 -right-2 -translate-y-1/2 w-3 h-3 rounded-sm bg-primary border border-white cursor-ew-resize"
                        />
                        <button
                          type="button"
                          onMouseDown={(e) => handleResizeMouseDown(e, block.id, 'w')}
                          className="absolute top-1/2 -left-2 -translate-y-1/2 w-3 h-3 rounded-sm bg-primary border border-white cursor-ew-resize"
                        />
                      </>
                    )}
                  </div>
                )
              })}

              {/* Grid overlay */}
              {renderGridOverlay()}
            </div>
          </div>

          {/* Controls Panel */}
          <div className="w-full 2xl:w-96 bg-white rounded-2xl p-6 shadow-sm space-y-6 overflow-y-auto max-h-[calc(100vh-150px)]">
            {/* Background Selection */}
            <div>
              <h2 className="text-xl font-bold mb-4">خلفية المعاينة</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-muted">رفع صورة من جهازك (للمعاينة فقط)</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleBackgroundFileChange(e.target.files?.[0])}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">أو ألصق رابط صورة</label>
                  <input
                    type="url"
                    value={backgroundUrl || ''}
                    onChange={(e) => setBackgroundUrl(e.target.value || null)}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="https://..."
                  />
                </div>
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Sample Text Inputs */}
            <div>
              <h2 className="text-xl font-bold mb-4">نصوص تجريبية</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-sm text-muted">اسم العريس</label>
                  <input
                    type="text"
                    value={sampleTexts.groomNameAr}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, groomNameAr: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="محمد"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">اسم العروس</label>
                  <input
                    type="text"
                    value={sampleTexts.brideNameAr}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, brideNameAr: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="فاطمة"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">التاريخ</label>
                  <input
                    type="date"
                    value={sampleTexts.dateText}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, dateText: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                  <p className="text-xs text-muted mt-1">
                    الصيغة النهائية: {formatDateForInvitation(sampleTexts.dateText) || 'YYYY | MONTH | DD'}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-muted">اسم أب العروس والعائلة</label>
                  <input
                    type="text"
                    value={sampleTexts.fatherOfBride}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, fatherOfBride: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">اسم أب العريس والعائلة</label>
                  <input
                    type="text"
                    value={sampleTexts.fatherOfGroom}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, fatherOfGroom: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">نص أم العروس</label>
                  <input
                    type="text"
                    value={sampleTexts.motherOfBride}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, motherOfBride: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">نص أم العريس</label>
                  <input
                    type="text"
                    value={sampleTexts.motherOfGroom}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, motherOfGroom: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">سطر يوم العرس</label>
                  <input
                    type="text"
                    value={sampleTexts.weddingDayLine}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, weddingDayLine: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">سطر التاريخ الكامل</label>
                  <input
                    type="text"
                    value={sampleTexts.fullDateLine}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, fullDateLine: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">موقع القاعة</label>
                  <input
                    type="text"
                    value={sampleTexts.hallLocation}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, hallLocation: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">وقت الاستقبال</label>
                  <input
                    type="text"
                    value={sampleTexts.receptionTime}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, receptionTime: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">وقت الزفة</label>
                  <input
                    type="text"
                    value={sampleTexts.zaffaTime}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, zaffaTime: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sampleTexts.noKids}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, noKids: e.target.checked })}
                  />
                  معاينة أيقونة ممنوع الأطفال
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sampleTexts.noPhotography}
                    onChange={(e) => setSampleTexts({ ...sampleTexts, noPhotography: e.target.checked })}
                  />
                  معاينة أيقونة ممنوع التصوير
                </label>
              </div>
            </div>

            <hr className="border-gray-200" />

            {auditResult && (
              <>
                <div>
                  <h2 className="text-xl font-bold mb-2">نتيجة التدقيق الذكي</h2>
                  <div className="p-3 rounded-lg border bg-gray-50">
                    <p className="font-semibold mb-2">
                      الدرجة: <span className={auditResult.score >= 85 ? 'text-green-600' : auditResult.score >= 65 ? 'text-amber-600' : 'text-red-600'}>{auditResult.score}/100</span>
                    </p>
                    <p className="text-xs text-muted mb-2">المصدر: {auditResult.source}</p>
                    {auditResult.findings.length > 0 && (
                      <div className="mb-2">
                        <p className="font-medium text-sm mb-1">ملاحظات:</p>
                        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                          {auditResult.findings.map((item, idx) => (
                            <li key={`f-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {auditResult.suggestions.length > 0 && (
                      <div>
                        <p className="font-medium text-sm mb-1">اقتراحات:</p>
                        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                          {auditResult.suggestions.map((item, idx) => (
                            <li key={`s-${idx}`}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                <hr className="border-gray-200" />
              </>
            )}

            {/* Grid Settings */}
            <div>
              <h2 className="text-xl font-bold mb-4">إعدادات Grid</h2>
              <div className="space-y-3">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => setShowGrid(e.target.checked)}
                    className="w-4 h-4"
                  />
                  <span>إظهار Grid</span>
                </label>
                <div>
                  <label className="text-sm text-muted">عدد الأعمدة (A-Z)</label>
                  <input
                    type="number"
                    value={gridCols}
                    onChange={(e) => setGridCols(Math.max(1, Math.min(52, parseInt(e.target.value) || 26)))}
                    className="w-full px-3 py-2 border rounded-lg"
                    min="1"
                    max="52"
                  />
                </div>
                <div>
                  <label className="text-sm text-muted">عدد الصفوف</label>
                  <input
                    type="number"
                    value={gridRows}
                    onChange={(e) => setGridRows(Math.max(1, Math.min(100, parseInt(e.target.value) || 30)))}
                    className="w-full px-3 py-2 border rounded-lg"
                    min="1"
                    max="100"
                  />
                </div>
              </div>
            </div>

            <hr className="border-gray-200" />

            {/* Text Blocks Editor */}
            <div>
              <h2 className="text-xl font-bold mb-4">عناصر النص</h2>
              <p className="text-sm text-muted mb-4">
                💡 اضغط واسحب العناصر لتحريكها
              </p>
              <div className="space-y-4">
                {preset.textBlocks.map((block) => (
                  <div
                    key={block.id}
                    className={`p-4 border-2 rounded-lg cursor-pointer transition-colors ${
                      selectedBlock === block.id
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedBlock(block.id)}
                  >
                    <h3 className="font-semibold mb-3">{block.id}</h3>
                    {selectedBlock === block.id && (
                      <div className="space-y-3">
                        {/* Position */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-xs text-muted">X (%)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={(block.boxPct.x * 100).toFixed(2)}
                              onChange={(e) =>
                                updateTextBlock(block.id, {
                                  boxPct: { ...block.boxPct, x: parseFloat(e.target.value) / 100 || 0 },
                                })
                              }
                              className="w-full px-2 py-1 border rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted">Y (%)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={(block.boxPct.y * 100).toFixed(2)}
                              onChange={(e) =>
                                updateTextBlock(block.id, {
                                  boxPct: { ...block.boxPct, y: parseFloat(e.target.value) / 100 || 0 },
                                })
                              }
                              className="w-full px-2 py-1 border rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted">Width (%)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={(block.boxPct.w * 100).toFixed(2)}
                              onChange={(e) =>
                                updateTextBlock(block.id, {
                                  boxPct: { ...block.boxPct, w: parseFloat(e.target.value) / 100 || 0 },
                                })
                              }
                              className="w-full px-2 py-1 border rounded text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-xs text-muted">Height (%)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={(block.boxPct.h * 100).toFixed(2)}
                              onChange={(e) =>
                                updateTextBlock(block.id, {
                                  boxPct: { ...block.boxPct, h: parseFloat(e.target.value) / 100 || 0 },
                                })
                              }
                              className="w-full px-2 py-1 border rounded text-sm"
                            />
                          </div>
                        </div>

                        {/* Font Size */}
                        <div>
                          <label className="text-sm text-muted">حجم الخط (px)</label>
                          <input
                            type="range"
                            min="12"
                            max="120"
                            value={block.font.baseSize}
                            onChange={(e) =>
                              updateTextBlock(block.id, {
                                font: { ...block.font, baseSize: parseInt(e.target.value) },
                              })
                            }
                            className="w-full"
                          />
                          <div className="text-center font-bold text-lg">{block.font.baseSize}px</div>
                        </div>

                        {block.kind !== 'image' && (
                          <>
                            <div>
                              <label className="text-xs text-muted">النص الثابت (اختياري)</label>
                              <input
                                type="text"
                                value={block.fallbackText || ''}
                                onChange={(e) => updateTextBlock(block.id, { fallbackText: e.target.value })}
                                className="w-full px-2 py-1 border rounded text-sm"
                                placeholder="يظهر عند عدم وجود قيمة من النموذج"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-xs text-muted">نوع الخط</label>
                                <select
                                  value={block.font.familyName || ''}
                                  onChange={(e) =>
                                    updateTextBlock(block.id, {
                                      font: { ...block.font, familyName: e.target.value || undefined },
                                    })
                                  }
                                  className="w-full px-2 py-1 border rounded text-sm"
                                >
                                  <option value="">افتراضي حسب اللغة</option>
                                  {FONT_OPTIONS.map((fontName) => (
                                    <option key={fontName} value={fontName}>
                                      {fontName}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-xs text-muted">المحاذاة</label>
                                <select
                                  value={block.align}
                                  onChange={(e) =>
                                    updateTextBlock(block.id, {
                                      align: e.target.value as TextBlock['align'],
                                    })
                                  }
                                  className="w-full px-2 py-1 border rounded text-sm"
                                >
                                  <option value="right">Right</option>
                                  <option value="center">Center</option>
                                  <option value="left">Left</option>
                                </select>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={block.font.weight >= 700}
                                  onChange={(e) =>
                                    updateTextBlock(block.id, {
                                      font: { ...block.font, weight: e.target.checked ? 700 : 400 },
                                    })
                                  }
                                />
                                تغميق النص (B)
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={block.forceSingleLine || block.maxLines === 1}
                                  onChange={(e) =>
                                    updateTextBlock(block.id, {
                                      forceSingleLine: e.target.checked,
                                      maxLines: e.target.checked ? 1 : Math.max(block.maxLines, 2),
                                    })
                                  }
                                />
                                سطر واحد ذكي
                              </label>
                            </div>

                            <div>
                              <label className="text-xs text-muted">أقصى اتساع تلقائي (%)</label>
                              <input
                                type="number"
                                step="0.01"
                                min="0.05"
                                max="0.99"
                                value={block.autoExpandWidthPct ?? block.boxPct.w}
                                onChange={(e) =>
                                  updateTextBlock(block.id, {
                                    autoExpandWidthPct: parseFloat(e.target.value) || block.boxPct.w,
                                  })
                                }
                                className="w-full px-2 py-1 border rounded text-sm"
                              />
                            </div>
                          </>
                        )}

                        {block.kind === 'image' && (
                          <>
                            <div>
                              <label className="text-xs text-muted">رابط الأيقونة</label>
                              <input
                                type="text"
                                value={block.imageSrc || ''}
                                onChange={(e) =>
                                  updateTextBlock(block.id, {
                                    imageSrc: e.target.value,
                                  })
                                }
                                className="w-full px-2 py-1 border rounded text-sm"
                                placeholder="/icons/no-kids.png"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-muted">شرط الظهور (field key)</label>
                              <input
                                type="text"
                                value={block.visibleWhenField || ''}
                                onChange={(e) =>
                                  updateTextBlock(block.id, {
                                    visibleWhenField: e.target.value,
                                  })
                                }
                                className="w-full px-2 py-1 border rounded text-sm"
                                placeholder="noKids"
                              />
                            </div>
                          </>
                        )}

                        {/* Color */}
                        <div>
                          <label className="text-sm text-muted">اللون</label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={block.color}
                              onChange={(e) => updateTextBlock(block.id, { color: e.target.value })}
                              className="w-12 h-10 border rounded cursor-pointer"
                            />
                            <input
                              type="text"
                              value={block.color}
                              onChange={(e) => updateTextBlock(block.id, { color: e.target.value })}
                              className="flex-1 px-3 py-2 border rounded-lg font-mono text-sm"
                              placeholder="#000000"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Preview Modal */}
        {previewUrl && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-auto">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">معاينة</h2>
                <button
                  onClick={() => {
                    URL.revokeObjectURL(previewUrl)
                    setPreviewUrl(null)
                  }}
                  className="text-gray-500 hover:text-gray-700 text-2xl"
                >
                  ✕
                </button>
              </div>
              <img src={previewUrl} alt="Preview" className="w-full rounded-lg" />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
