'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Download, Minus, Pipette, Plus, Save } from 'lucide-react'
import { useAuth } from '@/lib/auth/context'
import { isAdminEmailClient } from '@/lib/auth/admin-access'

const BASE_WIDTH = 1080
const BASE_HEIGHT = 1920

type DragState = {
  blockId: string
  startClientX: number
  startClientY: number
  startLeft: number
  startTop: number
  moved: boolean
}

type BlockStyle = {
  fontSize?: number
  fontFamily?: string
  color?: string
}

type EditableBlockKind = 'text' | 'image'

type SnapshotPatchBlock = {
  id: string
  content: string
  xPx: number
  yPx: number
  wPx: number
  hPx: number
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  align: 'left' | 'center' | 'right'
  lineHeight: number
  direction: 'rtl' | 'ltr'
  visible: boolean
}

type ReviewPayload = {
  invite?: {
    id: string
    title: string
    orderCode?: string
    orderNumber: string
    designId: string
    groomName: string
    brideName: string
    date: string
    locationName: string
    packageName?: string
    paidAmount?: string | number
    paymentStatus?: string
    dispatchMode?: string
    dispatchStatus?: string
    apiHealthStatus?: string
    apiFailureReason?: string
    phone?: string
    workflowStatus: string
    reviewStatus: string
    adminPreviewUrl?: string
    inviteImageUrl?: string
    finalUrl?: string
    previewUrl?: string
  }
  customer?: {
    uid: string
    name: string
    email: string
    phone?: string
  } | null
}

function normalizeFontFamily(value: string) {
  return String(value || '')
    .replace(/['"]/g, '')
    .split(',')[0]
    .trim()
}

function toPx(value: string, fallback = 0) {
  const parsed = Number(String(value || '').replace('px', '').trim())
  return Number.isFinite(parsed) ? parsed : fallback
}

function cssColorToHex(value: string, fallback = '#000000') {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw
  if (/^#[0-9a-f]{3}$/i.test(raw)) {
    const hex = raw.slice(1)
    return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
  }
  if (typeof window === 'undefined') return fallback
  const probe = document.createElement('span')
  probe.style.color = raw
  document.body.appendChild(probe)
  const computed = window.getComputedStyle(probe).color
  document.body.removeChild(probe)
  const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return fallback
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0')
  return `#${toHex(Number(match[1]))}${toHex(Number(match[2]))}${toHex(Number(match[3]))}`
}

function assignPayloadByBlockId(payload: Record<string, string>, blockId: string, value: string) {
  switch (blockId) {
    case 'groom_name':
      payload.groomName = value
      break
    case 'bride_name':
      payload.brideName = value
      break
    case 'date':
    case 'date_en':
      payload.date = value
      break
    case 'venue':
      payload.venueText = value
      payload.locationName = value
      break
    case 'location_name':
      payload.venueText = value
      payload.locationName = value
      payload.hallLocation = value
      break
    case 'hall_location':
      payload.hallLocation = value
      payload.locationName = value
      break
    case 'reception_time':
      payload.receptionTime = value
      payload.time = value
      break
    case 'zaffa_time':
      payload.zaffaTime = value
      break
    case 'intro_text':
      payload.introText = value
      break
    case 'invite_line':
      payload.inviteLine = value
      break
    case 'verse_or_dua':
      payload.verseOrDua = value
      break
    case 'full_date_line':
      payload.fullDateLine = value
      break
    case 'wedding_day_line':
      payload.weddingDayLine = value
      break
    case 'father_of_bride':
      payload.fatherOfBride = value
      break
    case 'father_of_groom':
      payload.fatherOfGroom = value
      break
    case 'mother_of_bride':
      payload.motherOfBride = value
      break
    case 'mother_of_groom':
      payload.motherOfGroom = value
      break
    case 'groom_english':
      payload.groomNameEn = value
      break
    case 'bride_english':
      payload.brideNameEn = value
      break
    default:
      break
  }
}

export default function AdminWorkshopPage() {
  const params = useParams()
  const router = useRouter()
  const inviteId = String(params?.inviteId || '')
  const { user, loading: authLoading } = useAuth()
  const isAdmin = isAdminEmailClient(user?.email)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [rebuildingSnapshot, setRebuildingSnapshot] = useState(false)
  const [approving, setApproving] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [modeUpdating, setModeUpdating] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [payload, setPayload] = useState<ReviewPayload | null>(null)
  const [docHtml, setDocHtml] = useState('')
  const [zoom, setZoom] = useState(1)
  const [editedBlocks, setEditedBlocks] = useState<Record<string, string>>({})
  const [positionsByBlockId, setPositionsByBlockId] = useState<Record<string, { xPx: number; yPx: number }>>({})
  const [styleByBlockId, setStyleByBlockId] = useState<Record<string, BlockStyle>>({})
  const [fontOptions, setFontOptions] = useState<string[]>(['Amiri', 'Montserrat', 'Cairo', 'TheSans alinma'])
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null)
  const [activeBlockKind, setActiveBlockKind] = useState<EditableBlockKind>('text')

  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const listenersRef = useRef<Array<() => void>>([])
  const dragRef = useRef<DragState | null>(null)
  const toastTimerRef = useRef<any>(null)

  const loadAll = async () => {
    if (!user || !isAdmin || !inviteId) return
    try {
      setLoading(true)
      setError('')
      setEditedBlocks({})
      setPositionsByBlockId({})
      setStyleByBlockId({})
      setActiveBlockId(null)
      const token = await user.getIdToken()

      const [reviewRes, htmlRes] = await Promise.all([
        fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/editable-html`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ])

      const reviewData = await reviewRes.json().catch(() => ({}))
      const htmlData = await htmlRes.json().catch(() => ({}))
      if (!reviewRes.ok) throw new Error(reviewData?.error || 'Failed to load invite')
      if (!htmlRes.ok) throw new Error(htmlData?.error || 'Failed to load editable invite')

      setPayload(reviewData)
      setDocHtml(String(htmlData?.html || ''))
    } catch (e: any) {
      setError(e?.message || 'Failed to load workshop')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!authLoading) loadAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, inviteId, isAdmin, user])

  useEffect(() => {
    return () => {
      for (const cleanup of listenersRef.current) cleanup()
      listenersRef.current = []
      dragRef.current = null
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    }
  }, [])

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 3200)
  }

  useEffect(() => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    doc.body.style.transformOrigin = 'top left'
    doc.body.style.transform = `scale(${zoom})`
    doc.body.style.width = `${BASE_WIDTH / zoom}px`
    doc.body.style.height = `${BASE_HEIGHT / zoom}px`
  }, [zoom])

  const bindInlineEditingAndDrag = () => {
    for (const cleanup of listenersRef.current) cleanup()
    listenersRef.current = []
    dragRef.current = null

    const iframe = iframeRef.current
    const doc = iframe?.contentDocument
    if (!doc) return

    doc.body.style.transformOrigin = 'top left'
    doc.body.style.transform = `scale(${zoom})`
    doc.body.style.width = `${BASE_WIDTH / zoom}px`
    doc.body.style.height = `${BASE_HEIGHT / zoom}px`

    const styleTag = doc.createElement('style')
    styleTag.textContent = `
      .editable-block {
        cursor: move !important;
        transition: box-shadow 120ms ease;
      }
      .editable-block.is-active {
        box-shadow: 0 0 0 1.5px rgba(83, 112, 255, 0.52) inset;
      }
      .editable-block:focus {
        outline: none !important;
      }
    `
    doc.head.appendChild(styleTag)

    const editableNodes = Array.from(
      doc.querySelectorAll<HTMLElement>('.text-block[data-block-id], .image-block[data-block-id]')
    )
    const textNodes = editableNodes.filter((node) => node.classList.contains('text-block'))
    const nextPositions: Record<string, { xPx: number; yPx: number }> = {}
    const nextStyles: Record<string, BlockStyle> = {}
    const discoveredFonts = new Set(fontOptions)
    for (const el of editableNodes) {
      const blockId = String(el.dataset.blockId || '').trim()
      if (!blockId) continue
      el.classList.add('editable-block')
      const left = Number.parseFloat(el.style.left || '0')
      const top = Number.parseFloat(el.style.top || '0')
      if (Number.isFinite(left) && Number.isFinite(top)) {
        nextPositions[blockId] = { xPx: Math.round(left), yPx: Math.round(top) }
      }
      const size =
        Number.parseFloat(el.style.fontSize || '0') || Number.parseFloat(el.style.width || '0') || undefined
      const family = normalizeFontFamily(el.style.fontFamily || '')
      const color = String(el.style.color || el.style.backgroundColor || '').trim()
      nextStyles[blockId] = {
        fontSize: Number.isFinite(Number(size)) && Number(size) > 0 ? Math.round(Number(size)) : undefined,
        fontFamily: family || undefined,
        color: color || undefined,
      }
      if (family) discoveredFonts.add(family)
    }
    setPositionsByBlockId(nextPositions)
    setStyleByBlockId(nextStyles)
    setFontOptions(Array.from(discoveredFonts))

    const clearActiveVisual = () => {
      for (const node of editableNodes) node.classList.remove('is-active')
    }
    const applyActiveVisual = (blockId: string) => {
      clearActiveVisual()
      const node = editableNodes.find((n) => n.dataset.blockId === blockId)
      if (node) node.classList.add('is-active')
    }

    const onDocMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const node = editableNodes.find((n) => n.dataset.blockId === drag.blockId)
      if (!node) return
      const dx = (event.clientX - drag.startClientX) / zoom
      const dy = (event.clientY - drag.startClientY) / zoom
      const nextLeft = Math.max(0, Math.round(drag.startLeft + dx))
      const nextTop = Math.max(0, Math.round(drag.startTop + dy))
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true
      node.style.left = `${nextLeft}px`
      node.style.top = `${nextTop}px`
      setPositionsByBlockId((prev) => ({ ...prev, [drag.blockId]: { xPx: nextLeft, yPx: nextTop } }))
    }

    const onDocUp = () => {
      const drag = dragRef.current
      if (!drag) return
      const node = editableNodes.find((n) => n.dataset.blockId === drag.blockId)
      if (node && !drag.moved) node.focus()
      dragRef.current = null
    }

    doc.addEventListener('pointermove', onDocMove)
    doc.addEventListener('pointerup', onDocUp)
    listenersRef.current.push(() => {
      doc.removeEventListener('pointermove', onDocMove)
      doc.removeEventListener('pointerup', onDocUp)
    })

    for (const el of editableNodes) {
      const blockId = String(el.dataset.blockId || '').trim()
      if (!blockId) continue
      const isTextBlock = el.classList.contains('text-block')
      el.tabIndex = 0
      if (isTextBlock) {
        el.contentEditable = 'true'
        el.spellcheck = false
      } else {
        el.contentEditable = 'false'
        el.spellcheck = false
      }

      const onInput = () => {
        if (!isTextBlock) return
        const next = (el.innerText || '').replace(/\n/g, ' ').trim()
        setEditedBlocks((prev) => ({ ...prev, [blockId]: next }))
      }
      const onKeyDown = (event: KeyboardEvent) => {
        if (!isTextBlock) return
        if (event.key === 'Enter') {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).blur()
        }
      }
      const onFocus = () => {
        setActiveBlockId(blockId)
        setActiveBlockKind(isTextBlock ? 'text' : 'image')
        applyActiveVisual(blockId)
      }
      const onPointerDown = (event: PointerEvent) => {
        setActiveBlockId(blockId)
        setActiveBlockKind(isTextBlock ? 'text' : 'image')
        applyActiveVisual(blockId)
        const left = Number.parseFloat(el.style.left || '0')
        const top = Number.parseFloat(el.style.top || '0')
        dragRef.current = {
          blockId,
          startClientX: event.clientX,
          startClientY: event.clientY,
          startLeft: Number.isFinite(left) ? left : 0,
          startTop: Number.isFinite(top) ? top : 0,
          moved: false,
        }
      }

      el.addEventListener('input', onInput)
      el.addEventListener('keydown', onKeyDown)
      el.addEventListener('focus', onFocus)
      el.addEventListener('pointerdown', onPointerDown)
      listenersRef.current.push(() => {
        el.removeEventListener('input', onInput)
        el.removeEventListener('keydown', onKeyDown)
        el.removeEventListener('focus', onFocus)
        el.removeEventListener('pointerdown', onPointerDown)
      })
    }
  }

  const activeStyle = useMemo(() => {
    if (!activeBlockId) return null
    return styleByBlockId[activeBlockId] || null
  }, [activeBlockId, styleByBlockId])

  const applyActiveStyle = (patch: Partial<BlockStyle>) => {
    if (!activeBlockId) return
    const doc = iframeRef.current?.contentDocument
    if (!doc) return
    const node = doc.querySelector<HTMLElement>(`[data-block-id="${activeBlockId}"]`)
    if (!node) return
    const next: BlockStyle = { ...(styleByBlockId[activeBlockId] || {}), ...patch }
    const isTextBlock = node.classList.contains('text-block')

    if (Number.isFinite(Number(next.fontSize)) && Number(next.fontSize) > 0) {
      const size = Math.round(Number(next.fontSize))
      if (isTextBlock) {
        node.style.fontSize = `${size}px`
      } else {
        const baseW = Math.max(1, toPx(node.style.width || '1px', 1))
        const baseH = Math.max(1, toPx(node.style.height || '1px', 1))
        const ratio = baseW / baseH
        if (ratio >= 1) {
          node.style.width = `${size}px`
          node.style.height = `${Math.max(8, Math.round(size / ratio))}px`
        } else {
          node.style.height = `${size}px`
          node.style.width = `${Math.max(8, Math.round(size * ratio))}px`
        }
      }
    }
    if (isTextBlock && next.fontFamily && next.fontFamily.trim()) {
      node.style.fontFamily = `'${next.fontFamily.trim()}'`
    }
    if (next.color && next.color.trim()) {
      if (isTextBlock) {
        node.style.color = next.color.trim()
      } else {
        node.style.backgroundColor = next.color.trim()
        node.style.color = next.color.trim()
      }
    }
    setStyleByBlockId((prev) => ({ ...prev, [activeBlockId]: next }))
  }

  const pickColorFromImage = async () => {
    if (!activeBlockId) return
    try {
      const EyeDropperCtor = (window as any).EyeDropper
      if (!EyeDropperCtor) {
        showToast('error', 'المتصفح الحالي لا يدعم أداة القطّارة.')
        return
      }
      showToast('success', 'اختر اللون من صورة الدعوة الآن...')
      const eyeDropper = new EyeDropperCtor()
      const result = await eyeDropper.open()
      const picked = String(result?.sRGBHex || '').trim()
      if (!picked) return
      applyActiveStyle({ color: picked })
      showToast('success', `تم تطبيق اللون ${picked} على العنصر المحدد.`)
    } catch (e: any) {
      if (String(e?.name || '') !== 'AbortError') {
        showToast('error', 'تعذر اختيار اللون من الصورة.')
      }
    }
  }

  const collectSnapshotBlocksFromIframe = (): SnapshotPatchBlock[] => {
    const doc = iframeRef.current?.contentDocument
    if (!doc) return []
    return Array.from(
      doc.querySelectorAll<HTMLElement>('.text-block[data-block-id], .image-block[data-block-id]')
    ).map((node) => {
      const style = node.style
      const isTextBlock = node.classList.contains('text-block')
      return {
        id: String(node.dataset.blockId || ''),
        content: isTextBlock ? (node.innerText || '').replace(/\n/g, ' ').trim() : '',
        xPx: Math.max(0, Math.round(toPx(style.left, 0))),
        yPx: Math.max(0, Math.round(toPx(style.top, 0))),
        wPx: Math.max(0, Math.round(toPx(style.width, 0))),
        hPx: Math.max(0, Math.round(toPx(style.height, 0))),
        fontFamily: normalizeFontFamily(style.fontFamily || ''),
        fontSize: Math.max(8, Math.round(toPx(style.fontSize, 16))),
        fontWeight: Math.max(100, Math.round(Number(style.fontWeight || 400))),
        color: String(style.color || style.backgroundColor || '').trim(),
        align: (String(style.textAlign || 'center') as 'left' | 'center' | 'right'),
        lineHeight: Math.max(0.8, Number(style.lineHeight || 1.2)),
        direction: (String(style.direction || 'rtl') as 'rtl' | 'ltr'),
        visible: true,
      }
    })
  }

  const captureIframePreviewBase64 = async (): Promise<string> => {
    const doc = iframeRef.current?.contentDocument
    const body = doc?.body
    if (!body) throw new Error('تعذر الوصول لمعاينة الدعوة داخل المحرر.')

    const canvas = await html2canvas(body, {
      width: BASE_WIDTH,
      height: BASE_HEIGHT,
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      logging: false,
    })
    const dataUrl = canvas.toDataURL('image/png', 0.95)
    if (!dataUrl || dataUrl.length < 100) {
      throw new Error('فشل التقاط صورة المعاينة من المحرر.')
    }
    return dataUrl
  }

  const persistWorkshopEdits = async () => {
    if (!user || !inviteId) return
    const token = await user.getIdToken()
    const textPayload: Record<string, string> = {}
    for (const [blockId, value] of Object.entries(editedBlocks)) {
      assignPayloadByBlockId(textPayload, blockId, String(value || ''))
    }
    const snapshotBlocks = collectSnapshotBlocksFromIframe()
    const designerRes = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/designer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        blockPositionOverrides: positionsByBlockId,
        blockStyleOverrides: styleByBlockId,
        snapshotPatch: {
          blocks: snapshotBlocks,
        },
      }),
    })
    const designerData = await designerRes.json().catch(() => ({}))
    if (!designerRes.ok) throw new Error(designerData?.error || 'Failed to save designer changes')

    if (Object.keys(textPayload).length > 0) {
      const editRes = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          ...textPayload,
          skipSnapshotSync: true,
        }),
      })
      const editData = await editRes.json().catch(() => ({}))
      if (!editRes.ok) throw new Error(editData?.error || 'Failed to save invite edits')
    }

    const imageBase64 = await captureIframePreviewBase64()
    const previewRes = await fetch(
      `/api/admin/invitations/review/${encodeURIComponent(inviteId)}/regenerate-preview`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ imageBase64 }),
      }
    )
    const previewData = await previewRes.json().catch(() => ({}))
    if (!previewRes.ok) {
      throw new Error(
        previewData?.error ||
          'تم حفظ التعديلات، لكن رفع صورة المعاينة فشل. جرّب مرة أخرى بعد تحميل الخطوط.'
      )
    }
  }

  const saveAll = async () => {
    if (!user || !inviteId || saving) return
    setSaving(true)
    setError('')
    try {
      await persistWorkshopEdits()
      showToast('success', 'تم حفظ التعديلات بنجاح.')
      await loadAll()
    } catch (e: any) {
      setError(e?.message || 'Failed to save workshop edits')
    } finally {
      setSaving(false)
    }
  }

  const approveInvite = async () => {
    if (!user || !inviteId || approving) return
    setApproving(true)
    setError('')
    try {
      await persistWorkshopEdits()
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ notes: 'Approved from workshop page.' }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to approve invite')
      await loadAll()
      alert('تم اعتماد التصميم بنجاح.')
    } catch (e: any) {
      setError(e?.message || 'Failed to approve invite')
    } finally {
      setApproving(false)
    }
  }

  const rebuildSnapshot = async () => {
    if (!user || !inviteId || rebuildingSnapshot) return
    const ok = window.confirm('هل تريد إعادة بناء Snapshot لهذه الدعوة الآن؟')
    if (!ok) return

    setRebuildingSnapshot(true)
    setError('')
    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/invitations/${encodeURIComponent(inviteId)}/rebuild-snapshot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'فشل إعادة بناء Snapshot')
      showToast('success', `تم إعادة بناء Snapshot بنجاح (v${data?.snapshotVersion || '?'})`)
      await loadAll()
    } catch (e: any) {
      const message = e?.message || 'فشل إعادة بناء Snapshot'
      setError(message)
      showToast('error', message)
    } finally {
      setRebuildingSnapshot(false)
    }
  }

  const sanitizeFileSegment = (value: string, fallback: string) => {
    const cleaned = String(value || '')
      .trim()
      .replace(/[\\/:*?"<>|]/g, '')
      .replace(/\s+/g, ' ')
    return cleaned || fallback
  }

  const handleDownloadInvite = async () => {
    if (!user || !inviteId) {
      showToast('error', 'تعذر تنزيل الدعوة حالياً.')
      return
    }

    setDownloading(true)
    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/invitations/review/${encodeURIComponent(inviteId)}/download-pdf`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data?.error || 'تعذر إنشاء ملف PDF')
      }
      const blob = await response.blob()
      const objectUrl = URL.createObjectURL(blob)
      const brideName = sanitizeFileSegment(String(invite?.brideName || ''), 'صاحبة-المناسبة')
      const groomName = sanitizeFileSegment(String(invite?.groomName || ''), 'صاحب-المناسبة')
      const fileName = `${brideName}-${groomName}.pdf`
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = fileName
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
      showToast('success', 'تم تنزيل الدعوة بصيغة PDF.')
    } catch (e: any) {
      showToast('error', e?.message || 'تعذر تنزيل الدعوة بصيغة PDF.')
    } finally {
      setDownloading(false)
    }
  }

  const updateDispatchMode = async (mode: 'api' | 'manual') => {
    if (!user || !inviteId || modeUpdating) return
    setModeUpdating(true)
    try {
      const token = await user.getIdToken()
      const response = await fetch(`/api/admin/risk-case/${encodeURIComponent(inviteId)}/set-dispatch-mode`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mode }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(data?.error || 'Failed to update dispatch mode')
      if (data?.fallbackApplied) {
        showToast('error', 'تعذر تفعيل API، وتم تحويل الطلب إلى Risk Case للإرسال اليدوي.')
      } else {
        showToast('success', String(data?.message || 'تم تحديث طريقة الإرسال.'))
      }
      await loadAll()
    } catch (e: any) {
      showToast('error', e?.message || 'Failed to update dispatch mode')
    } finally {
      setModeUpdating(false)
    }
  }

  const changedCount = useMemo(() => Object.keys(editedBlocks).length, [editedBlocks])
  const positionCount = useMemo(() => Object.keys(positionsByBlockId).length, [positionsByBlockId])
  const activeColorHex = useMemo(() => cssColorToHex(String(activeStyle?.color || ''), '#222222'), [activeStyle?.color])
  const invite = payload?.invite
  const customer = payload?.customer
  const dispatchMode = String(invite?.dispatchMode || 'manual').toLowerCase()
  const dispatchStatus = String(invite?.dispatchStatus || 'pending').toLowerCase()
  const apiHealthStatus = String(invite?.apiHealthStatus || '').toLowerCase()
  const riskCaseReady = dispatchMode === 'manual' || dispatchStatus === 'ready_manual' || dispatchStatus === 'ready'
  const showRiskCaseButton = riskCaseReady
  const isApproved =
    String(invite?.workflowStatus || '').toLowerCase() === 'approved' ||
    String(invite?.reviewStatus || '').toLowerCase() === 'approved'

  if (authLoading || loading) return <div className="p-8 text-center text-muted">جاري تحميل الورشة...</div>
  if (!user || !isAdmin) return <div className="p-8 text-center text-red-600">غير مصرح بالدخول.</div>

  return (
    <div className="min-h-screen bg-bg p-3">
      <div className="mx-auto w-full max-w-[1800px]">
        <div className="mb-3 flex items-center justify-between rounded-2xl border border-gray-200 bg-white p-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/admin/invitations/review')}
              className="rounded-lg border border-gray-300 p-2 hover:bg-gray-50"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-lg font-bold">ورشة التأكد</h1>
              <p className="text-xs text-muted">تحرير مباشر للدعوة مع حفظ فوري للمحتوى والمواضع.</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {activeBlockId && (
              <div className="mr-2 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1">
                <span className="text-xs text-muted">العنصر: {activeBlockId}</span>
                <button
                  type="button"
                  onClick={() => applyActiveStyle({ fontSize: Math.max(8, Number(activeStyle?.fontSize || 20) - 1) })}
                  className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-white"
                >
                  -
                </button>
                <input
                  type="number"
                  min={8}
                  value={Math.max(8, Number(activeStyle?.fontSize || 20))}
                  onChange={(e) => applyActiveStyle({ fontSize: Math.max(8, Number(e.target.value || 8)) })}
                  className="w-14 rounded border border-gray-300 px-1 py-1 text-center text-xs"
                />
                <button
                  type="button"
                  onClick={() => applyActiveStyle({ fontSize: Math.min(220, Number(activeStyle?.fontSize || 20) + 1) })}
                  className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-white"
                >
                  +
                </button>
                {activeBlockKind === 'text' ? (
                  <select
                    value={activeStyle?.fontFamily || ''}
                    onChange={(e) => applyActiveStyle({ fontFamily: e.target.value })}
                    className="rounded border border-gray-300 px-2 py-1 text-xs"
                  >
                    <option value="">الخط الافتراضي</option>
                    {fontOptions.map((font) => (
                      <option key={font} value={font}>
                        {font}
                      </option>
                    ))}
                  </select>
                ) : null}
                <input
                  type="color"
                  value={activeColorHex}
                  onChange={(e) => applyActiveStyle({ color: e.target.value })}
                  className="h-7 w-9 cursor-pointer rounded border border-gray-300 bg-white p-0.5"
                  title="اختيار اللون"
                />
                <input
                  type="text"
                  value={activeColorHex}
                  onChange={(e) => applyActiveStyle({ color: e.target.value })}
                  placeholder="#000000"
                  className="w-20 rounded border border-gray-300 px-1 py-1 text-center text-xs"
                />
                <button
                  type="button"
                  onClick={pickColorFromImage}
                  className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-white"
                  title="اختيار اللون من صورة الدعوة"
                >
                  <Pipette className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
              className="rounded border border-gray-300 p-2 hover:bg-gray-50"
            >
              <Minus className="h-4 w-4" />
            </button>
            <input
              type="range"
              min={0.5}
              max={2}
              step={0.05}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="w-36"
            />
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))))}
              className="rounded border border-gray-300 p-2 hover:bg-gray-50"
            >
              <Plus className="h-4 w-4" />
            </button>
            <span className="min-w-[62px] text-center text-xs text-muted">{Math.round(zoom * 100)}%</span>
            <button
              onClick={rebuildSnapshot}
              disabled={rebuildingSnapshot}
              className="rounded border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
            >
              {rebuildingSnapshot ? 'إعادة البناء...' : 'إعادة بناء Snapshot'}
            </button>
            <button
              onClick={saveAll}
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              <Save className="ml-1 inline h-4 w-4" />
              {saving ? 'جاري الحفظ...' : `حفظ (${changedCount}/${positionCount})`}
            </button>
            <button
              onClick={handleDownloadInvite}
              disabled={downloading}
              className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/10 disabled:opacity-60"
            >
              <Download className="ml-1 inline h-4 w-4" />
              {downloading ? 'جاري التحويل...' : 'تحميل الدعوة PDF'}
            </button>
          </div>
        </div>

        {error ? <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{error}</div> : null}
        {toast ? (
          <div
            className={`mb-3 rounded-lg border p-3 text-sm ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-red-200 bg-red-50 text-red-700'
            }`}
          >
            {toast.message}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_330px]">
          <div className="rounded-2xl border border-gray-200 bg-white p-2">
            <div className="h-[calc(100vh-150px)] overflow-auto rounded-xl border border-gray-200 bg-slate-50/40 p-3">
              <div
                className="mx-auto origin-top"
                style={{
                  width: `${BASE_WIDTH * zoom}px`,
                  height: `${BASE_HEIGHT * zoom}px`,
                }}
              >
                <iframe
                  ref={iframeRef}
                  title="invite-live-inline-editor"
                  srcDoc={docHtml}
                  onLoad={bindInlineEditingAndDrag}
                  className="h-full w-full border-0 bg-white"
                />
              </div>
            </div>
          </div>

          <aside className="rounded-2xl border border-gray-200 bg-white p-4 xl:sticky xl:top-3 xl:h-fit">
            <h2 className="mb-4 text-base font-bold">معلومات الطلب</h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-muted">اسم العميل</p>
                <p className="font-semibold">{customer?.name || '-'}</p>
              </div>
              <div>
                <p className="text-muted">كود الطلب</p>
                <p className="font-semibold">{invite?.orderCode || invite?.orderNumber || '-'}</p>
              </div>
              <div>
                <p className="text-muted">الباقة</p>
                <p className="font-semibold">{invite?.packageName || '-'}</p>
              </div>
              <div>
                <p className="text-muted">السعر المدفوع</p>
                <p className="font-semibold">{invite?.paidAmount || '-'}</p>
              </div>
              <div>
                <p className="text-muted">البريد الإلكتروني</p>
                <p className="font-semibold">{customer?.email || '-'}</p>
              </div>
              <div>
                <p className="text-muted">رقم الجوال</p>
                <p className="font-semibold">{invite?.phone || customer?.phone || '-'}</p>
              </div>
              <div>
                <p className="text-muted">المساعد المصمم</p>
                <p className="font-semibold">Alien</p>
              </div>
              <div>
                <p className="text-muted">حالة الطلب</p>
                <p className="font-semibold">{invite?.workflowStatus || '-'}</p>
              </div>
              <div>
                <p className="text-muted">وضع الإرسال</p>
                <p className="font-semibold">{invite?.dispatchMode || 'manual'}</p>
              </div>
              <div>
                <p className="text-muted">حالة الإرسال</p>
                <p className="font-semibold">{invite?.dispatchStatus || 'pending'}</p>
              </div>
              <div>
                <p className="text-muted">فحص API</p>
                <p className="font-semibold">{invite?.apiHealthStatus || '-'}</p>
              </div>
              {invite?.apiFailureReason ? (
                <div>
                  <p className="text-muted">سبب فشل API</p>
                  <p className="font-semibold text-rose-700">{invite.apiFailureReason}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="mb-2 text-sm font-semibold">طريقة الإرسال</p>
              <div className="mb-2">
                <DispatchModeBadge
                  dispatchMode={dispatchMode}
                  dispatchStatus={dispatchStatus}
                  apiHealthStatus={apiHealthStatus}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => updateDispatchMode('api')}
                  disabled={modeUpdating}
                  className="rounded border border-blue-300 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-60"
                >
                  {modeUpdating ? 'جاري التحديث...' : 'تفعيل API'}
                </button>
                <button
                  onClick={() => updateDispatchMode('manual')}
                  disabled={modeUpdating}
                  className="rounded border border-indigo-300 px-3 py-1.5 text-xs font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                >
                  {modeUpdating ? 'جاري التحديث...' : 'تفعيل Risk Case / Manual'}
                </button>
              </div>
            </div>

            <button
              onClick={approveInvite}
              disabled={approving}
              className="mt-6 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              {approving ? 'جاري الاعتماد...' : isApproved ? 'إعادة اعتماد التصميم' : 'اعتماد التصميم'}
            </button>
            {showRiskCaseButton ? (
              <Link
                href={`/admin/invitations/${encodeURIComponent(inviteId)}/risk-case`}
                className="mt-2 block w-full rounded-xl border border-indigo-300 bg-indigo-50 px-4 py-3 text-center text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
              >
                فتح الريسك كيس
              </Link>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  )
}

function DispatchModeBadge({
  dispatchMode,
  dispatchStatus,
  apiHealthStatus,
}: {
  dispatchMode: string
  dispatchStatus: string
  apiHealthStatus: string
}) {
  if (dispatchMode === 'api' && apiHealthStatus === 'passed') {
    return <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">API جاهز</span>
  }
  if (apiHealthStatus === 'failed') {
    return <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-xs text-rose-700">API فشل</span>
  }
  if (dispatchMode === 'manual' && (dispatchStatus === 'ready_manual' || dispatchStatus === 'ready')) {
    return (
      <span className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
        Risk Case جاهز
      </span>
    )
  }
  if (dispatchStatus === 'preparing') {
    return <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-700">قيد التحضير</span>
  }
  return <span className="rounded-full border border-slate-300 bg-slate-50 px-2 py-1 text-xs text-slate-700">غير جاهز</span>
}
