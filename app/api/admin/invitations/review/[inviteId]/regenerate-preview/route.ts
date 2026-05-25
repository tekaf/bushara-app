import { NextRequest, NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { getAdminApp, getAdminFirestore } from '@/lib/firebase/admin'
import { isAdminEmailServer } from '@/lib/auth/admin-access'
import { INVITE_WORKFLOW_STATUS } from '@/lib/invitations/workflow'
import { resolveAdminPreviewUrl } from '@/lib/admin/workshop-queue'
import { uploadWorkshopPreviewPng } from '@/lib/admin/upload-workshop-preview'
import type { FinalInvitationSnapshot } from '@/lib/workshop/snapshot'
import { ensureInviteOrderFoundation } from '@/lib/orders/order-code'
import { ensurePaidInviteWorkshopReady } from '@/lib/admin/ensure-workshop-ready'
import { renderFinalPngToStorage } from '@/lib/render/final-png'

export const runtime = 'nodejs'
export const maxDuration = 30

const DEPLOY_TAG = process.env.VERCEL_GIT_COMMIT_SHA || 'local-no-vercel'

const PREVIEW_REGENERATE_ALLOWED_STATUSES = new Set<string>([
  INVITE_WORKFLOW_STATUS.IN_WORKSHOP_REVIEW,
  INVITE_WORKFLOW_STATUS.NEEDS_CUSTOMER_UPDATE,
  INVITE_WORKFLOW_STATUS.APPROVED,
  INVITE_WORKFLOW_STATUS.READY_FOR_SCHEDULING,
  INVITE_WORKFLOW_STATUS.SCHEDULED,
  INVITE_WORKFLOW_STATUS.SENDING,
  INVITE_WORKFLOW_STATUS.PARTIALLY_SENT,
  INVITE_WORKFLOW_STATUS.SENT,
])

async function verifyAdmin(request: NextRequest) {
  const authHeader = request.headers.get('authorization') || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  if (!token) throw new Error('Unauthorized')

  const app = getAdminApp()
  if (!app) throw new Error('Admin SDK not configured')

  const auth = getAuth(app)
  const decoded = await auth.verifyIdToken(token)
  if (!decoded?.uid) throw new Error('Unauthorized')
  const email = decoded.email || (await auth.getUser(decoded.uid)).email || ''
  if (!isAdminEmailServer(email)) throw new Error('Unauthorized')
  return decoded.uid
}

function isServerless() {
  return process.env.VERCEL === '1'
}

export async function POST(request: NextRequest, { params }: { params: { inviteId: string } }) {
  try {
    const adminUid = await verifyAdmin(request)
    const inviteId = params?.inviteId
    if (!inviteId) return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })

    const body = await request.json().catch(() => ({}))
    const imageBase64 = String(body?.imageBase64 || '').trim()

    const adminDb = getAdminFirestore()
    if (!adminDb) return NextResponse.json({ error: 'Admin SDK not configured' }, { status: 500 })

    const inviteRef = adminDb.collection('invites').doc(inviteId)
    const inviteSnap = await inviteRef.get()
    if (!inviteSnap.exists) return NextResponse.json({ error: 'Invite not found' }, { status: 404 })
    await ensureInviteOrderFoundation(adminDb, inviteId)

    const ready = await ensurePaidInviteWorkshopReady(adminDb, inviteId, {
      origin: request.nextUrl.origin,
      repairPreview: false,
    })
    const invite = ready.invite as Record<string, unknown>

    const workflowStatus = String(ready.workflowStatus || invite?.workflowStatus || '').trim()
    if (!PREVIEW_REGENERATE_ALLOWED_STATUSES.has(workflowStatus)) {
      return NextResponse.json(
        { error: `Preview regeneration is not allowed for workflow status: ${workflowStatus || 'unknown'}.` },
        { status: 409 }
      )
    }

    const internalSnap = await adminDb.collection('invitation_internal').doc(inviteId).get()
    const internal = internalSnap.exists ? (internalSnap.data() as Record<string, unknown>) : {}
    const existingPreview = resolveAdminPreviewUrl(invite, internal)

    if (imageBase64) {
      const base64Data = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '')
      const pngBuffer = Buffer.from(base64Data, 'base64')
      if (!pngBuffer.length) {
        return NextResponse.json({ error: 'Invalid preview image data' }, { status: 400 })
      }
      const adminPreviewUrl = await uploadWorkshopPreviewPng(
        adminDb,
        inviteId,
        pngBuffer,
        adminUid,
        'admin_preview_uploaded',
        'Preview uploaded via regenerate-preview (browser payload).'
      )
      return NextResponse.json({
        ok: true,
        adminPreviewUrl,
        source: 'browser_upload',
        deployTag: DEPLOY_TAG,
      })
    }

    // Vercel cannot run Chromium — never call renderFinalPngToStorage here.
    if (isServerless()) {
      if (existingPreview) {
        return NextResponse.json({
          ok: true,
          adminPreviewUrl: existingPreview,
          source: 'existing',
          deployTag: DEPLOY_TAG,
          message: 'تم استخدام المعاينة المحفوظة. Chromium معطّل على Vercel.',
        })
      }
      return NextResponse.json(
        {
          ok: false,
          error:
            'على Vercel: اضغط «حفظ» لرفع المعاينة من المتصفح (لا يعمل توليد الصورة على السيرفر).',
          code: 'USE_BROWSER_UPLOAD',
          deployTag: DEPLOY_TAG,
          previewMode: 'browser_upload',
        },
        { status: 409 }
      )
    }

    const snapshot = (internal?.finalInvitationSnapshot || null) as FinalInvitationSnapshot | null
    if (!snapshot?.templateId || !snapshot?.fields) {
      return NextResponse.json({ error: 'Snapshot is missing. Open workshop first to initialize it.' }, { status: 409 })
    }

    const adminPreviewUrl = await renderFinalPngToStorage({
      templateId: snapshot.templateId,
      variant: snapshot.variant || 'whatsapp_1080x1920',
      fields: (snapshot.fields || {}) as Record<string, unknown>,
      renderOptions: {
        layoutB: (snapshot?.renderOptions as any)?.layoutB,
        blockStyleOverrides: (snapshot?.renderOptions as any)?.blockStyleOverrides || {},
        blockPositionOverrides: (snapshot?.renderOptions as any)?.blockPositionOverrides || {},
      },
      assetBaseUrl: request.nextUrl.origin,
    })

    await adminDb.collection('invitation_internal').doc(inviteId).set(
      {
        adminPreviewUrl,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return NextResponse.json({ ok: true, adminPreviewUrl, source: 'server_render', deployTag: DEPLOY_TAG })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to regenerate preview'
    const status = message === 'Unauthorized' ? 401 : 500
    return NextResponse.json({ error: message, deployTag: DEPLOY_TAG }, { status })
  }
}
