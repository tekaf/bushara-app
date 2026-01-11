'use client'

import { useState } from 'react'
import { collection, addDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import type { TemplateType } from '@/lib/template-presets/types'
import { Upload, Save } from 'lucide-react'

export default function AdminTemplatesPage() {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    type: 'A' as TemplateType,
    backgroundFile: null as File | null,
  })
  const [preview, setPreview] = useState<string | null>(null)

  // Simple password protection (replace with proper auth later)
  const [password, setPassword] = useState('')
  const [authenticated, setAuthenticated] = useState(false)

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full">
          <h1 className="text-2xl font-bold mb-4">Admin Access</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter admin password"
            className="w-full px-4 py-3 border border-gray-300 rounded-lg mb-4"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && password === 'admin123') {
                setAuthenticated(true)
              }
            }}
          />
          <button
            onClick={() => {
              if (password === 'admin123') {
                setAuthenticated(true)
              } else {
                alert('Wrong password')
              }
            }}
            className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors"
          >
            Login
          </button>
        </div>
      </div>
    )
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setFormData({ ...formData, backgroundFile: file })
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const generateThumbnail = async (file: File): Promise<File> => {
    // Simple client-side resize for MVP
    return new Promise((resolve) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        const maxWidth = 400
        const maxHeight = 600
        let width = img.width
        let height = img.height

        if (width > height) {
          if (width > maxWidth) {
            height = (height * maxWidth) / width
            width = maxWidth
          }
        } else {
          if (height > maxHeight) {
            width = (width * maxHeight) / height
            height = maxHeight
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(new File([blob], 'thumb.jpg', { type: 'image/jpeg' }))
          }
        }, 'image/jpeg', 0.8)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.backgroundFile) {
      alert('Please upload a background image')
      return
    }

    setLoading(true)
    try {
      const templateId = crypto.randomUUID()

      // Upload background
      const backgroundRef = ref(storage, `templates/${templateId}/background.png`)
      await uploadBytes(backgroundRef, formData.backgroundFile)
      const backgroundUrl = await getDownloadURL(backgroundRef)

      // Generate and upload thumbnail
      const thumbFile = await generateThumbnail(formData.backgroundFile)
      const thumbRef = ref(storage, `templates/${templateId}/thumb.jpg`)
      await uploadBytes(thumbRef, thumbFile)
      const thumbUrl = await getDownloadURL(thumbRef)

      // Create template document
      await addDoc(collection(db, 'templates'), {
        name: formData.name,
        type: formData.type,
        status: 'published',
        assets: {
          backgroundUrl,
          thumbUrl,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      alert('Template uploaded successfully!')
      setFormData({ name: '', type: 'A', backgroundFile: null })
      setPreview(null)
    } catch (error) {
      console.error('Error uploading template:', error)
      alert('Error uploading template')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg p-4">
      <div className="container mx-auto max-w-2xl">
        <div className="bg-white rounded-2xl p-8 shadow-lg">
          <h1 className="text-3xl font-bold mb-6">Upload Template</h1>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block mb-2 font-semibold">Template Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
                placeholder="e.g., Elegant Wedding Design"
              />
            </div>

            <div>
              <label className="block mb-2 font-semibold">Template Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value as TemplateType })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="A">Type A - Minimal</option>
                <option value="B">Type B - Top Decoration</option>
                <option value="C">Type C - Bottom Decoration</option>
              </select>
            </div>

            <div>
              <label className="block mb-2 font-semibold">Background Image</label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                  id="background-upload"
                  required
                />
                <label
                  htmlFor="background-upload"
                  className="cursor-pointer flex flex-col items-center gap-4"
                >
                  <Upload className="text-primary" size={48} />
                  <span className="text-muted">
                    {formData.backgroundFile
                      ? formData.backgroundFile.name
                      : 'Click to upload background image'}
                  </span>
                </label>
              </div>
              {preview && (
                <div className="mt-4">
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full max-w-md mx-auto rounded-lg shadow"
                  />
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary text-white py-3 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Uploading...
                </>
              ) : (
                <>
                  <Save size={20} />
                  Publish Template
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

