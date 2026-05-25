import { NextRequest, NextResponse } from 'next/server'
import { existsSync } from 'fs'
import { adminAuthErrorToResponse, verifyAdminRequest } from '@/lib/auth/verify-admin-request'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  try {
    await verifyAdminRequest(request)
    return NextResponse.json({
      ok: true,
      vercel: Boolean(process.env.VERCEL),
      awsLambdaJsRuntime: process.env.AWS_LAMBDA_JS_RUNTIME || null,
      awsExecutionEnv: process.env.AWS_EXECUTION_ENV || null,
      ldLibraryPath: process.env.LD_LIBRARY_PATH || null,
      chromiumPackUrl: process.env.CHROMIUM_REMOTE_PACK_URL || null,
      libs: {
        al2023Libnss3: existsSync('/tmp/al2023/lib/libnss3.so'),
        al2Libnss3: existsSync('/tmp/al2/lib/libnss3.so'),
        chromiumBinary: existsSync('/tmp/chromium'),
      },
      nodeVersion: process.version,
    })
  } catch (error: unknown) {
    const mapped = adminAuthErrorToResponse(error)
    return NextResponse.json({ error: mapped.error }, { status: mapped.status })
  }
}
