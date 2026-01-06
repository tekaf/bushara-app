import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'

export default function DesignsPage() {
  return (
    <>
      <Navbar />
      <main className="pt-32 pb-20 px-4 min-h-screen">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">التصاميم</h1>
            <p className="text-xl text-muted max-w-2xl mx-auto">
              قريباً: استعرض مجموعتنا من التصاميم الاحترافية
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="bg-bg rounded-2xl p-8 aspect-square flex items-center justify-center"
              >
                <div className="text-muted">تصميم {i}</div>
              </div>
            ))}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}

