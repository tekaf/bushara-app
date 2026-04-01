import { NextRequest, NextResponse } from 'next/server'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'

export const runtime = 'nodejs'

type AgentReport = {
  generatedAt: string
  periodHours: number
  metrics: {
    rendersTotal: number
    rendersCompleted: number
    rendersFailed: number
    templatesTotal: number
    templatesByType: { A: number; B: number; C: number }
  }
  findings: string[]
  requirements: string[]
  priority: 'low' | 'medium' | 'high'
  source: 'local-rules' | 'ai-model'
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

type PresetTextBlock = {
  id?: string
  boxPct?: { x?: number; y?: number; w?: number; h?: number }
  font?: { baseSize?: number; minSize?: number }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function isAutopilotEnabled(): boolean {
  const raw = (process.env.AGENT_AUTOPILOT || 'on').toLowerCase().trim()
  return !['0', 'false', 'off', 'disabled'].includes(raw)
}

function normalizePresetForAutofix(preset: any): {
  changed: boolean
  preset: any
  changeCount: number
} {
  const blocks = Array.isArray(preset?.textBlocks) ? preset.textBlocks : []
  if (!blocks.length) {
    return { changed: false, preset, changeCount: 0 }
  }

  let changeCount = 0
  const nextBlocks = blocks.map((rawBlock: PresetTextBlock) => {
    const block = { ...rawBlock }
    const rawBox = block.boxPct || {}
    const rawFont = block.font || {}

    let x = Number(rawBox.x ?? 0)
    let y = Number(rawBox.y ?? 0)
    let w = Number(rawBox.w ?? 0.8)
    let h = Number(rawBox.h ?? 0.08)
    let baseSize = Number(rawFont.baseSize ?? 40)
    let minSize = Number(rawFont.minSize ?? 20)

    const prev = { x, y, w, h, baseSize, minSize }

    w = clamp(Number.isFinite(w) ? w : 0.8, 0.03, 1)
    h = clamp(Number.isFinite(h) ? h : 0.08, 0.03, 1)
    x = clamp(Number.isFinite(x) ? x : 0, 0, 1)
    y = clamp(Number.isFinite(y) ? y : 0, 0, 1)
    if (x + w > 1) x = Math.max(0, 1 - w)
    if (y + h > 1) y = Math.max(0, 1 - h)

    baseSize = clamp(Number.isFinite(baseSize) ? baseSize : 40, 12, 120)
    minSize = clamp(Number.isFinite(minSize) ? minSize : 20, 8, baseSize)

    const changed =
      x !== prev.x ||
      y !== prev.y ||
      w !== prev.w ||
      h !== prev.h ||
      baseSize !== prev.baseSize ||
      minSize !== prev.minSize

    if (changed) changeCount += 1

    return {
      ...block,
      boxPct: { ...(block.boxPct || {}), x, y, w, h },
      font: { ...(block.font || {}), baseSize, minSize },
    }
  })

  if (!changeCount) {
    return { changed: false, preset, changeCount: 0 }
  }

  return {
    changed: true,
    changeCount,
    preset: {
      ...preset,
      textBlocks: nextBlocks,
    },
  }
}

async function runPresetAutopilot(adminDb: FirebaseFirestore.Firestore, actor: string) {
  const enabled = isAutopilotEnabled()
  const summary: AgentReport['automation'] = {
    enabled,
    applied: 0,
    skipped: 0,
    failed: 0,
    actions: [],
  }

  if (!enabled) return summary

  const presetTypes: Array<'A' | 'B' | 'C'> = ['A', 'B', 'C']
  for (const type of presetTypes) {
    try {
      const docRef = adminDb.collection('presets').doc(type)
      const snap = await docRef.get()
      if (!snap.exists) {
        summary.skipped += 1
        summary.actions.push({
          target: `preset:${type}`,
          status: 'skipped',
          message: 'غير موجود',
        })
        continue
      }

      const data = snap.data() || {}
      const fixed = normalizePresetForAutofix(data)
      if (!fixed.changed) {
        summary.skipped += 1
        summary.actions.push({
          target: `preset:${type}`,
          status: 'skipped',
          message: 'لا يوجد إصلاحات لازمة',
        })
        continue
      }

      await docRef.set(
        {
          ...fixed.preset,
          autoFixedAt: new Date(),
          autoFixedBy: `agent:${actor}`,
          updatedAt: new Date(),
          updatedBy: `agent:${actor}`,
        },
        { merge: true }
      )

      summary.applied += 1
      summary.actions.push({
        target: `preset:${type}`,
        status: 'applied',
        message: `تم تطبيق ${fixed.changeCount} إصلاح تلقائي`,
      })
    } catch (error: any) {
      summary.failed += 1
      summary.actions.push({
        target: `preset:${type}`,
        status: 'failed',
        message: error?.message || 'فشل الإصلاح التلقائي',
      })
    }
  }

  if (summary.actions.length > 0) {
    await adminDb.collection('agent_actions').add({
      createdAt: new Date(),
      actor: `agent:${actor}`,
      kind: 'preset_autofix',
      summary,
    })
  }

  return summary
}

function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const authHeader = request.headers.get('authorization') || ''
  if (authHeader === `Bearer ${secret}`) return true
  const token = request.nextUrl.searchParams.get('token')
  return token === secret
}

async function verifyUserFromBearer(
  request: NextRequest
): Promise<{ uid: string; email?: string } | null> {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) return null

  const app = getAdminApp()
  if (!app) return null
  const decoded = await getAuth(app).verifyIdToken(token)
  if (!decoded?.uid) return null
  return { uid: decoded.uid, email: decoded.email }
}

function buildLocalReport(input: {
  rendersTotal: number
  rendersCompleted: number
  rendersFailed: number
  templatesTotal: number
  templatesByType: { A: number; B: number; C: number }
}): AgentReport {
  const findings: string[] = []
  const requirements: string[] = []
  let priority: AgentReport['priority'] = 'low'

  const failRate = input.rendersTotal > 0 ? input.rendersFailed / input.rendersTotal : 0
  if (failRate > 0.1) {
    findings.push(`معدل فشل الرندر مرتفع: ${(failRate * 100).toFixed(1)}%`)
    requirements.push('إضافة تتبع مفصل لأسباب فشل الرندر وربطها بتنبيهات فورية.')
    priority = 'high'
  }

  if (input.templatesByType.B > 0 && input.templatesByType.A + input.templatesByType.C > 0) {
    findings.push('يوجد استخدام متعدد لأنواع القوالب، يلزم توحيد QA لكل نوع.')
    requirements.push('تشغيل تدقيق ذكي تلقائي بعد كل حفظ preset (A/B/C) مع تقرير مقارنة قبل/بعد.')
    if (priority !== 'high') priority = 'medium'
  }

  if (input.rendersTotal < 10) {
    findings.push('عدد عمليات الرندر قليل لتحليل سلوك دقيق.')
    requirements.push('إضافة event tracking لمسار المستخدم (Preview/Final/Download) لبناء قرارات أدق.')
  }

  if (findings.length === 0) {
    findings.push('لا توجد مؤشرات خطر عالية خلال الفترة الحالية.')
    requirements.push('استمر في جمع بيانات الأحداث لتقوية اقتراحات الذكاء الأسبوعية.')
  }

  return {
    generatedAt: new Date().toISOString(),
    periodHours: 24,
    metrics: input,
    findings,
    requirements,
    priority,
    source: 'local-rules',
  }
}

async function buildExternalInsightsIfConfigured(report: AgentReport): Promise<AgentReport | null> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return null

  const model = process.env.OPENAI_AUDIT_MODEL || 'gpt-4o-mini'
  const prompt = `
You are a senior product analyst for an Arabic invitation platform.
Return ONLY valid JSON with fields:
{
  "findings": string[],
  "requirements": string[],
  "priority": "low" | "medium" | "high"
}
Use the metrics to infer emerging requirements and quality risks.
Input metrics:
${JSON.stringify(report.metrics)}
Current findings:
${JSON.stringify(report.findings)}
Current requirements:
${JSON.stringify(report.requirements)}
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
    const findings = Array.isArray(parsed.findings) ? parsed.findings.map(String) : report.findings
    const requirements = Array.isArray(parsed.requirements) ? parsed.requirements.map(String) : report.requirements
    const priority: AgentReport['priority'] =
      parsed.priority === 'high' || parsed.priority === 'medium' || parsed.priority === 'low'
        ? parsed.priority
        : report.priority

    return {
      ...report,
      findings,
      requirements,
      priority,
      source: 'ai-model',
    }
  } catch {
    return null
  }
}

export async function POST(request: NextRequest) {
  try {
    const adminDb = getAdminFirestore()
    if (!adminDb) {
      return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })
    }

    const cronAuthorized = isAuthorizedCron(request)
    const authUser = cronAuthorized ? null : await verifyUserFromBearer(request)
    const userId = cronAuthorized ? 'cron' : authUser?.uid || null
    if (!cronAuthorized && (!authUser || !isAdminEmailServer(authUser.email))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = Date.now()
    const since = new Date(now - 24 * 60 * 60 * 1000)

    const [rendersSnap, templatesSnap] = await Promise.all([
      adminDb.collection('renders').where('createdAt', '>=', since).get(),
      adminDb.collection('templates').get(),
    ])

    const renders = rendersSnap.docs.map((d) => d.data())
    const templates = templatesSnap.docs.map((d) => d.data())
    const templatesByType = { A: 0, B: 0, C: 0 }
    for (const t of templates) {
      const type = (t.type || 'A') as 'A' | 'B' | 'C'
      if (type in templatesByType) templatesByType[type] += 1
    }

    const base = buildLocalReport({
      rendersTotal: renders.length,
      rendersCompleted: renders.filter((r) => r.status === 'completed').length,
      rendersFailed: renders.filter((r) => r.status === 'failed').length,
      templatesTotal: templates.length,
      templatesByType,
    })

    const actor = userId || 'unknown'
    const automation = await runPresetAutopilot(adminDb, actor)
    const enriched = (await buildExternalInsightsIfConfigured(base)) || base
    const report: AgentReport = {
      ...enriched,
      automation,
      findings: [
        ...enriched.findings,
        ...(automation.enabled
          ? [`Autopilot: applied=${automation.applied}, skipped=${automation.skipped}, failed=${automation.failed}`]
          : ['Autopilot غير مفعّل (AGENT_AUTOPILOT=off)']),
      ],
    }

    await adminDb.collection('agent_reports').add({
      ...report,
      createdAt: new Date(),
      createdBy: actor,
      periodStart: since,
      periodEnd: new Date(),
    })

    return NextResponse.json({ ok: true, report })
  } catch (error: any) {
    console.error('❌ [AGENT][RUN] failed:', error)
    return NextResponse.json(
      { error: error?.message || 'Failed to run agent' },
      { status: 500 }
    )
  }
}
