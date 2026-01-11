'use client'

import Link from 'next/link'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <motion.nav
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      className="fixed top-0 w-full bg-white/80 backdrop-blur-md z-50 border-b border-primarySoft"
    >
      <div className="container mx-auto px-4 py-4 relative">
        {/* Logo - Centered at top */}
        <div className="flex items-center justify-center">
          <Link href="/" className="flex items-center">
            <Image
              src="/favicon.png"
              alt="بشارة"
              width={50}
              height={50}
              className="object-contain"
            />
          </Link>
        </div>

        {/* Desktop Menu - Right side */}
        <div className="hidden md:flex items-center gap-8 absolute left-4 top-1/2 -translate-y-1/2">
          <Link
            href="/packages"
            className="text-muted hover:text-primary transition-colors"
          >
            الباقات
          </Link>
            <Link
              href="/templates"
              className="text-muted hover:text-primary transition-colors"
            >
              التصاميم
            </Link>
          <Link
            href="/login"
            className="text-muted hover:text-primary transition-colors"
          >
            تسجيل الدخول
          </Link>
          <Link
            href="/register"
            className="bg-primary text-white px-6 py-2 rounded-lg hover:bg-accent transition-colors"
          >
            ابدأ الآن
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="md:hidden absolute left-4 top-1/2 -translate-y-1/2"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Menu"
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </button>

        {/* Mobile Menu */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden mt-4 pb-4 space-y-4"
          >
            <Link
              href="/packages"
              className="block text-muted hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              الباقات
            </Link>
            <Link
              href="/templates"
              className="block text-muted hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              التصاميم
            </Link>
            <Link
              href="/login"
              className="block text-muted hover:text-primary transition-colors"
              onClick={() => setIsOpen(false)}
            >
              تسجيل الدخول
            </Link>
            <Link
              href="/register"
              className="block bg-primary text-white px-6 py-2 rounded-lg hover:bg-accent transition-colors text-center"
              onClick={() => setIsOpen(false)}
            >
              ابدأ الآن
            </Link>
          </motion.div>
        )}
      </div>
    </motion.nav>
  )
}

