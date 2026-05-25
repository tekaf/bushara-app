import { existsSync } from 'fs'

/**
 * Must run before `import '@sparticuz/chromium'` so the package extracts al2023 libs on Vercel.
 */
function appendLdLibraryPath(baseLibPath: string) {
  if (!existsSync(baseLibPath)) return
  const current = process.env.LD_LIBRARY_PATH
  if (!current) {
    process.env.LD_LIBRARY_PATH = baseLibPath
    return
  }
  if (current.split(':').includes(baseLibPath)) return
  process.env.LD_LIBRARY_PATH = `${baseLibPath}:${current}`
}

const onServerless =
  Boolean(process.env.VERCEL) ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME) ||
  Boolean(process.env.AWS_EXECUTION_ENV)

if (onServerless) {
  const nodeMajor = Number(process.versions.node.split('.')[0] || 20)
  const runtime = nodeMajor >= 22 ? 'nodejs22.x' : 'nodejs20.x'
  process.env.AWS_LAMBDA_JS_RUNTIME ??= runtime
  if (!process.env.AWS_EXECUTION_ENV) {
    process.env.AWS_EXECUTION_ENV = `AWS_Lambda_${runtime}`
  }
  process.env.FONTCONFIG_PATH ??= '/tmp/fonts'
  appendLdLibraryPath('/tmp/al2023/lib')
  appendLdLibraryPath('/tmp/al2/lib')
}
