'use client'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="min-h-screen flex items-center justify-center bg-bg p-4">
          <div className="bg-white rounded-2xl p-8 shadow-lg max-w-md w-full text-center">
            <h2 className="text-2xl font-bold mb-4 text-red-600">حدث خطأ خطير</h2>
            <p className="text-muted mb-6">{error.message || 'حدث خطأ غير متوقع'}</p>
            <button
              onClick={reset}
              className="bg-primary text-white px-6 py-3 rounded-lg hover:bg-accent transition-colors"
            >
              حاول مرة أخرى
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
