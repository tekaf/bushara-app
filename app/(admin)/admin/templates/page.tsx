'use client'

import { useState } from 'react'
import { collection, addDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { db, storage } from '@/lib/firebase/config'
import type { TemplateType } from '@/lib/template-presets/types'
import { Upload, Save, X } from 'lucide-react'

export default function AdminTemplatesPage() {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    type: 'A' as TemplateType,
    backgroundFile: null as File | null,
  })
  const [preview, setPreview] = useState<string | null>(null)
  const [fileType, setFileType] = useState<'image' | 'pdf' | null>(null)
  const [isDragging, setIsDragging] = useState(false)

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

  const processFile = (file: File) => {
    // Check file type
    if (file.type === 'application/pdf') {
      setFileType('pdf')
      setFormData({ ...formData, backgroundFile: file })
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    } else if (file.type.startsWith('image/')) {
      setFileType('image')
      setFormData({ ...formData, backgroundFile: file })
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreview(e.target?.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      alert('الرجاء رفع صورة أو ملف PDF فقط')
      setFileType(null)
      setPreview(null)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const removeFile = () => {
    setFormData({ ...formData, backgroundFile: null })
    setPreview(null)
    setFileType(null)
    // Reset file input
    const fileInput = document.getElementById('background-upload') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files?.[0]
    if (file) {
      processFile(file)
    }
  }

  const generateThumbnail = async (file: File): Promise<File | null> => {
    // Only generate thumbnail for images, not PDFs
    if (file.type === 'application/pdf') {
      return null
    }
    
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
          } else {
            resolve(null)
          }
        }, 'image/jpeg', 0.8)
      }
      img.src = URL.createObjectURL(file)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.backgroundFile) {
      alert('الرجاء رفع ملف')
      return
    }

    setLoading(true)
    try {
      const templateId = crypto.randomUUID()
      const isPdf = formData.backgroundFile.type === 'application/pdf'
      const fileExtension = isPdf ? 'pdf' : formData.backgroundFile.name.split('.').pop() || 'png'

      // Upload file using API route (server-side, bypasses client rules)
      const uploadFormData = new FormData()
      uploadFormData.append('file', formData.backgroundFile)
      uploadFormData.append('templateId', templateId)
      uploadFormData.append('fileExtension', fileExtension)

      const uploadResponse = await fetch('/api/upload-template', {
        method: 'POST',
        body: uploadFormData,
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json()
        const errorMsg = errorData.error || 'فشل رفع الملف'
        console.error('Upload error:', errorData)
        throw new Error(errorMsg)
      }

      const { url: fileUrl } = await uploadResponse.json()

      let thumbUrl = fileUrl // Default to file URL for PDFs

      // Generate and upload thumbnail (only for images)
      if (!isPdf) {
        const thumbFile = await generateThumbnail(formData.backgroundFile)
        if (thumbFile) {
          const thumbFormData = new FormData()
          thumbFormData.append('file', thumbFile)
          thumbFormData.append('templateId', templateId)
          thumbFormData.append('fileExtension', 'jpg')
          thumbFormData.append('isThumbnail', 'true')

          const thumbResponse = await fetch('/api/upload-template', {
            method: 'POST',
            body: thumbFormData,
          })

          if (thumbResponse.ok) {
            const { url: thumbUrlResponse } = await thumbResponse.json()
            thumbUrl = thumbUrlResponse
          }
        }
      }

      // Create template document
      await addDoc(collection(db, 'templates'), {
        name: formData.name,
        type: formData.type,
        status: 'published',
        fileType: isPdf ? 'pdf' : 'image',
        assets: {
          backgroundUrl: fileUrl,
          thumbUrl,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      alert('تم رفع التصميم بنجاح!')
      setFormData({ name: '', type: 'A', backgroundFile: null })
      setPreview(null)
      setFileType(null)
    } catch (error: any) {
      console.error('Error uploading template:', error)
      const errorMsg = error.message || 'حدث خطأ أثناء رفع التصميم'
      alert(`خطأ: ${errorMsg}\n\nتأكد من نشر قواعد Firebase Storage في Firebase Console.`)
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
              <label className="block mb-2 font-semibold">ملف التصميم (صورة أو PDF)</label>
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  isDragging
                    ? 'border-primary bg-primary/5'
                    : 'border-gray-300 hover:border-primary/50'
                }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="background-upload"
                />
                {!formData.backgroundFile ? (
                  <label
                    htmlFor="background-upload"
                    className="cursor-pointer flex flex-col items-center gap-4"
                  >
                    <Upload className="text-primary" size={48} />
                    <span className="text-muted">
                      {isDragging
                        ? 'أفلت الملف هنا'
                        : 'اسحب الملف هنا أو انقر للرفع'}
                    </span>
                    <span className="text-sm text-gray-400">صورة أو PDF</span>
                  </label>
                ) : (
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-primary font-semibold">
                        {formData.backgroundFile.name}
                      </span>
                      <button
                        type="button"
                        onClick={removeFile}
                        className="p-1 hover:bg-red-50 rounded-full transition-colors"
                        title="حذف الملف"
                      >
                        <X className="text-red-500" size={20} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {preview && (
                <div className="mt-4 relative">
                  {fileType === 'pdf' ? (
                    <div className="w-full max-w-md mx-auto relative">
                      <button
                        type="button"
                        onClick={removeFile}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors z-10"
                        title="حذف الملف"
                      >
                        <X size={18} />
                      </button>
                      <iframe
                        src={preview}
                        className="w-full h-96 rounded-lg shadow border"
                        title="PDF Preview"
                      />
                      <p className="text-center text-muted mt-2">معاينة ملف PDF</p>
                    </div>
                  ) : (
                    <div className="w-full max-w-md mx-auto relative">
                      <button
                        type="button"
                        onClick={removeFile}
                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors z-10"
                        title="حذف الملف"
                      >
                        <X size={18} />
                      </button>
                      <img
                        src={preview}
                        alt="Preview"
                        className="w-full max-w-md mx-auto rounded-lg shadow"
                      />
                    </div>
                  )}
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

