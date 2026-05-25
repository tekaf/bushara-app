import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'

const PAGE_WIDTH = 1080
const PAGE_HEIGHT = 1920

function isPng(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
}

async function normalizeImageBytes(bytes: Uint8Array): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' }> {
  if (isPng(bytes)) return { bytes, kind: 'png' }

  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (isJpeg) return { bytes, kind: 'jpg' }

  const converted = await sharp(Buffer.from(bytes)).jpeg({ quality: 92 }).toBuffer()
  return { bytes: new Uint8Array(converted), kind: 'jpg' }
}

export async function buildInvitePdfFromImageUrl(imageUrl: string): Promise<Uint8Array> {
  const response = await fetch(imageUrl, { cache: 'no-store' })
  if (!response.ok) {
    throw new Error(`Failed to fetch invite image (${response.status})`)
  }

  const rawBytes = new Uint8Array(await response.arrayBuffer())
  const { bytes, kind } = await normalizeImageBytes(rawBytes)

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
  const image = kind === 'png' ? await pdfDoc.embedPng(bytes) : await pdfDoc.embedJpg(bytes)

  const imageW = image.width
  const imageH = image.height
  const scale = Math.max(PAGE_WIDTH / imageW, PAGE_HEIGHT / imageH)
  const drawW = imageW * scale
  const drawH = imageH * scale
  const x = (PAGE_WIDTH - drawW) / 2
  const y = (PAGE_HEIGHT - drawH) / 2

  page.drawImage(image, { x, y, width: drawW, height: drawH })
  return pdfDoc.save()
}
