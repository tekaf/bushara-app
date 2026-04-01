import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const runtime = 'nodejs'

type BoxPct = { x: number; y: number; w: number; h: number }
type TextBlockInput = {
  id: string
  boxPct: BoxPct
  font?: { baseSize?: number; minSize?: number; familyKey?: string }
  color?: string
}

type AuditInput = {
  presetType: 'A' | 'B' | 'C'
  preset: { textBlocks?: TextBlockInput[] }
  sampleTexts?: { groomNameAr?: string; brideNameAr?: string; dateText?: string }
}

function isDateFormatOk(value: string): boolean {
  return /^\d{4}\s\|\s[A-Z]+\s\|\s\d{2}$/.test(value.trim())
}

function area(box: BoxPct): number {
  return Math.max(0, box.w) * Math.max(0, box.h)
}

function overlapRatio(a: BoxPct, b: BoxPct): number {
  const x1 = Math.max(a.x, b.x)
  const y1 = Math.max(a.y, b.y)
  const x2 = Math.min(a.x + a.w, b.x + b.w)
  const y2 = Math.min(a.y + a.h, b.y + b.h)
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1)
  const minArea = Math.min(area(a), area(b)) || 1
  return inter / minArea
}

function estimateTextWidthPct(text: string, fontSizePx: number, isArabic: boolean): number {
  const chars = Array.from(text)
  let totalPx = 0
  for (const ch of chars) {
    if (ch === ' ') totalPx += fontSizePx * 0.28
    else if (/[0-9A-Z|]/.test(ch)) totalPx += fontSizePx * 0.52
    else totalPx += fontSizePx * (isArabic ? 0.58 : 0.5)
  }
  return totalPx / 1080
}

function localAudit(input: AuditInput) {
  const findings: string[] = []
  const suggestions: string[] = []
  let score = 100

  const blocks = input.preset?.textBlocks || []
  if (blocks.length === 0) {
    findings.push('لا توجد textBlocks في preset.')
    score -= 50
  }

  if (input.presetType === 'B') {
    const required = ['groom_name', 'bride_name', 'date']
    const ids = new Set(blocks.map((b) => b.id))
    for (const id of required) {
      if (!ids.has(id)) {
        findings.push(`نموذج B يجب أن يحتوي على block: ${id}`)
        score -= 15
      }
    }
  }

  // Check multiline risk for key names in type B (must stay one line)
  if (input.presetType === 'B') {
    const groomBlock = blocks.find((b) => b.id === 'groom_name')
    const brideBlock = blocks.find((b) => b.id === 'bride_name')
    const checks = [
      { label: 'اسم العريس', block: groomBlock, value: (input.sampleTexts?.groomNameAr || '').trim() },
      { label: 'اسم العروس', block: brideBlock, value: (input.sampleTexts?.brideNameAr || '').trim() },
    ]
    for (const c of checks) {
      if (!c.block || !c.value) continue
      const fSize = c.block.font?.baseSize || 40
      const isArabic = (c.block.font?.familyKey || 'arabic') === 'arabic'
      const estimatedW = estimateTextWidthPct(c.value, fSize, isArabic)
      if (estimatedW > c.block.boxPct.w * 0.95) {
        findings.push(`${c.label} قد ينكسر إلى سطرين (العرض غير كافٍ).`)
        suggestions.push(`خفّض حجم خط ${c.label} أو زِد عرض الصندوق.`)
        score -= 18
      }
      if (c.value.includes(' ') && c.block.boxPct.w < 0.26) {
        findings.push(`${c.label} يحتوي مسافة وعرض الصندوق صغير؛ خطر التفاف السطر مرتفع.`)
        score -= 10
      }
    }
  }

  for (const block of blocks) {
    const { x, y, w, h } = block.boxPct
    if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > 1 || y + h > 1) {
      findings.push(`block "${block.id}" خارج حدود التصميم (boxPct).`)
      score -= 8
    }
    const fontSize = block.font?.baseSize || 0
    if (fontSize < 12 || fontSize > 120) {
      findings.push(`fontSize غير مناسب في "${block.id}" (${fontSize}px).`)
      score -= 4
    }
  }

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const r = overlapRatio(blocks[i].boxPct, blocks[j].boxPct)
      if (r > 0.35) {
        findings.push(`تداخل كبير بين "${blocks[i].id}" و "${blocks[j].id}".`)
        score -= 5
      }
    }
  }

  const formattedDate = input.sampleTexts?.dateText || ''
  if (formattedDate && !isDateFormatOk(formattedDate)) {
    findings.push('تنسيق التاريخ ليس بالشكل المطلوب: YYYY | MONTH | DD')
    suggestions.push('استخدم التاريخ بصيغة: 2026 | FEBRUARY | 15')
    score -= 8
  }

  const groom = (input.sampleTexts?.groomNameAr || '').trim()
  const bride = (input.sampleTexts?.brideNameAr || '').trim()
  for (const name of [groom, bride]) {
    if (!name) continue
    if (name.length <= 1) {
      findings.push(`الاسم "${name}" قصير جدًا.`)
      score -= 4
    }
  }

  if (findings.length === 0) {
    suggestions.push('التوزيع جيد. اختبر معاينة نهائية للتأكد من حدة الصورة.')
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    findings,
    suggestions,
    source: 'local-rules',
  }
}

async function externalAuditIfConfigured(input: AuditInput) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const model = process.env.OPENAI_AUDIT_MODEL || 'gpt-4o-mini'
  const prompt = `
You are an expert Arabic invitation QA assistant.
Return ONLY valid JSON with fields: score (0-100), findings (string[]), suggestions (string[]).
Focus on typography, Arabic readability, Kashida balance, text box placement, overlap risk, and date format.
Input:
${JSON.stringify(input)}
`.trim()

  const resp = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      input: prompt,
    }),
  })

  if (!resp.ok) return null
  const data: any = await resp.json()
  const text = data?.output_text || ''
  if (!text) return null

  try {
    const parsed = JSON.parse(text)
    return {
      score: Math.max(0, Math.min(100, Number(parsed.score) || 0)),
      findings: Array.isArray(parsed.findings) ? parsed.findings.map(String) : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions.map(String) : [],
      source: 'ai-model',
    }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const app = getAdminApp()
    if (!app) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }
    const decoded = await getAuth(app).verifyIdToken(token)
    if (!decoded?.uid || !isAdminEmailServer(decoded.email)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = (await request.json()) as AuditInput
    if (!body?.presetType || !body?.preset) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const local = localAudit(body)
    const external = await externalAuditIfConfigured(body)
    const result = external || local

    return NextResponse.json({
      ok: true,
      audit: result,
      fallback: external ? undefined : local,
      usedExternalModel: Boolean(external),
    })
  } catch (error: any) {
    console.error('❌ [API][ADMIN][AI-AUDIT] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to run AI audit' },
      { status: 500 }
    )
  }
}
