import Hero from '@/components/sections/Hero'
import Features from '@/components/sections/Features'
import PackagesPreview from '@/components/sections/PackagesPreview'
import CTA from '@/components/sections/CTA'
import Navbar from '@/components/ui/Navbar'
import Footer from '@/components/ui/Footer'

export default function Home() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <Hero />
      <Features />
      <PackagesPreview />
      <CTA />
      <Footer />
    </main>
  )
}

