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
    const snapshot = await adminDb
      .collection('fonts')
      .where('active', '==', true)
      .get()

    const fonts: FontData[] = []
    for (const doc of snapshot.docs) {
      const data = doc.data()
      fonts.push({
        id: doc.id,
        name: data.name || '',
        language: data.language || 'ar',
        weight: data.weight || 400,
        style: data.style || 'normal',
        format: data.format || 'truetype',
        active: data.active !== false,
        fileUrl: data.fileUrl || '',
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

    const format = font.format === 'truetype' ? 'truetype' : 'woff2'
    const fontFace = `
@font-face {
  font-family: '${font.name}';
  src: url('data:font/${format};base64,${base64}') format('${format}');
  font-weight: ${font.weight};
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
    return "'Amiri', 'Cairo', sans-serif"
  }
  return "'Montserrat', sans-serif"
}
