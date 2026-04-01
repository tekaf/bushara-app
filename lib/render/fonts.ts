import { getAdminFirestore } from '@/lib/firebase/admin'

export interface FontData {
  id: string
  name: string
  language: 'ar' | 'en'
  weight: number
  style: string
  format: string
  active: boolean
  fileUrl: string
  base64?: string
}

function normalizeFontFormat(input?: string, fileUrl?: string): 'truetype' | 'opentype' | 'woff' | 'woff2' {
  const raw = (input || '').toLowerCase().trim()
  if (raw === 'ttf' || raw === 'truetype') return 'truetype'
  if (raw === 'otf' || raw === 'opentype') return 'opentype'
  if (raw === 'woff') return 'woff'
  if (raw === 'woff2') return 'woff2'

  const url = (fileUrl || '').toLowerCase()
  if (url.includes('.otf')) return 'opentype'
  if (url.includes('.woff2')) return 'woff2'
  if (url.includes('.woff')) return 'woff'
  return 'truetype'
}

function inferWeight(rawWeight: unknown, docId: string, fileUrl: string): number {
  const parsed = Number(rawWeight)
  if (Number.isFinite(parsed) && parsed > 0) return parsed

  const hint = `${docId} ${fileUrl}`.toLowerCase()
  if (hint.includes('bold')) return 700
  if (hint.includes('medium')) return 500
  if (hint.includes('light')) return 300
  return 400
}

function inferStyle(rawStyle: unknown, docId: string, fileUrl: string): string {
  if (typeof rawStyle === 'string' && rawStyle.trim()) return rawStyle.trim().toLowerCase()
  const hint = `${docId} ${fileUrl}`.toLowerCase()
  return hint.includes('italic') ? 'italic' : 'normal'
}

function stripVariantFromName(name: string): string {
  return name
    .replace(/[-_ ]?(regular|bolditalic|bold|italic|medium|light)$/i, '')
    .trim()
}

function resolveFontNameAndUrl(data: Record<string, any>, docId: string): { name: string; fileUrl: string } {
  const directUrl = String(data.fileUrl || data.url || '').trim()
  if (directUrl) {
    const directName = String(data.name || '').trim() || stripVariantFromName(docId)
    return { name: directName, fileUrl: directUrl }
  }

  // Compatibility: some docs were saved with URL under a dynamic key (e.g. "Amiri": "https://...")
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (!trimmed.startsWith('http')) continue
    if (!trimmed.includes('storage.googleapis.com') && !trimmed.includes('firebasestorage')) continue
    const inferredName = String(data.name || '').trim() || stripVariantFromName(key) || stripVariantFromName(docId)
    return { name: inferredName, fileUrl: trimmed }
  }

  const fallbackName = String(data.name || '').trim() || stripVariantFromName(docId)
  return { name: fallbackName, fileUrl: '' }
}

/**
 * Fetch active fonts from Firestore
 */
export async function fetchFontsFromFirestore(): Promise<FontData[]> {
  const adminDb = getAdminFirestore()
  if (!adminDb) {
    console.warn('⚠️ [FONTS] Admin Firestore not available, using fallback')
    return []
  }

  try {
    // Read all fonts, then apply default-active behavior in code.
    // This keeps legacy docs working even if they don't contain "active".
    const snapshot = await adminDb.collection('fonts').get()

    const fonts: FontData[] = []
    for (const doc of snapshot.docs) {
      const data = doc.data()
      const { name, fileUrl } = resolveFontNameAndUrl(data as Record<string, any>, doc.id)
      if (!name || !fileUrl) continue

      const language = data.language === 'en' ? 'en' : 'ar'
      const weight = inferWeight(data.weight, doc.id, fileUrl)
      const style = inferStyle(data.style, doc.id, fileUrl)
      const format = normalizeFontFormat(data.format, fileUrl)
      const active = data.active !== false

      fonts.push({
        id: doc.id,
        name,
        language,
        weight,
        style,
        format,
        active,
        fileUrl,
      })
    }

    console.log(`✅ [FONTS] Loaded ${fonts.length} active fonts from Firestore`)
    return fonts
  } catch (error: any) {
    console.error('❌ [FONTS] Error fetching fonts:', error.message)
    return []
  }
}

/**
 * Download font file and convert to base64
 */
export async function downloadFontAsBase64(fileUrl: string): Promise<string | null> {
  try {
    console.log('📤 [FONTS] Downloading font from:', fileUrl)
    const response = await fetch(fileUrl)
    if (!response.ok) {
      throw new Error(`Failed to download font: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const base64 = buffer.toString('base64')
    
    console.log('✅ [FONTS] Font converted to base64, size:', base64.length)
    return base64
  } catch (error: any) {
    console.error('❌ [FONTS] Error downloading font:', error.message)
    return null
  }
}

/**
 * Generate @font-face CSS for all fonts
 */
export async function generateFontFaces(): Promise<string> {
  const fonts = await fetchFontsFromFirestore()
  
  if (fonts.length === 0) {
    console.warn('⚠️ [FONTS] No fonts found, using fallback')
    return ''
  }

  const fontFaces: string[] = []

  for (const font of fonts) {
    const base64 = await downloadFontAsBase64(font.fileUrl)
    if (!base64) {
      console.warn(`⚠️ [FONTS] Skipping font ${font.name} (download failed)`)
      continue
    }

    const format = normalizeFontFormat(font.format, font.fileUrl)
    const fontFace = `
@font-face {
  font-family: '${font.name}';
  src: url('data:font/${format};base64,${base64}') format('${format}');
  font-weight: 100 900;
  font-style: ${font.style};
  font-display: swap;
}`
    fontFaces.push(fontFace)
  }

  const css = fontFaces.join('\n')
  console.log(`✅ [FONTS] Generated ${fontFaces.length} @font-face declarations`)
  return css
}

/**
 * Get font family name by language
 */
export function getFontFamilyByLanguage(
  language: 'ar' | 'en',
  fonts: FontData[]
): string {
  const font = fonts.find((f) => f.language === language && f.active)
  if (font) {
    return `'${font.name}'`
  }

  // Fallback
  if (language === 'ar') {
    return "'TheSans alinma', 'Amiri', 'Cairo', sans-serif"
  }
  return "'Montserrat', sans-serif"
}
