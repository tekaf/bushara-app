'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'

const INTRO_KEY = 'bushara_intro_seen_session_v1'
const LEGACY_LOCAL_KEY = 'bushara_intro_seen_v1'
const INTRO_DURATION_MS = 4200
const OUTLINE_JSON_PATHS = ['/intro/weddingoutline.json', '/weddingoutline.json']
const INTRO_LOGO_PATHS = ['/intro/logo-white.png', '/favicon.png']

type Star = {
  id: number
  left: number
  top: number
  size: number
  opacity: number
  blur: number
  glow: number
  delay: number
  duration: number
}

type ShootingStar = {
  id: number
  top: string
  left: string
  width: number
  height: number
  angle: number
  travelX: number
  travelY: number
  duration: number
  delay: number
}

type FirstVisitIntroProps = {
  forceShow?: boolean
}

export default function FirstVisitIntro({ forceShow = false }: FirstVisitIntroProps) {
  const pathname = usePathname()
  const [show, setShow] = useState(false)
  const [fadeOut, setFadeOut] = useState(false)
  const outlineAnimationRef = useRef<HTMLDivElement | null>(null)
  const [outlineReady, setOutlineReady] = useState(false)
  const [logoIndex, setLogoIndex] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const stars = useMemo<Star[]>(() => {
    if (!mounted) return []
    // Deterministic pseudo-random distribution avoids hydration mismatch.
    let seed = 815743
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }

    return Array.from({ length: 90 }, (_, id) => ({
      id,
      top: nextRand() * 100,
      left: nextRand() * 100,
      size: 1 + nextRand() * 3.5,
      opacity: 0.25 + nextRand() * 0.75,
      blur: nextRand() > 0.75 ? 6 : 0,
      glow: 5 + nextRand() * 12,
      duration: 2.5 + nextRand() * 4,
      delay: nextRand() * 3,
    }))
  }, [mounted])

  const shootingStars = useMemo<ShootingStar[]>(
    () => [
      {
        id: 1,
        top: '18%',
        left: '82%',
        width: 120,
        height: 2,
        angle: 214,
        travelX: -420,
        travelY: 165,
        duration: 11.5,
        delay: 1.1,
      },
      {
        id: 2,
        top: '34%',
        left: '70%',
        width: 95,
        height: 1.8,
        angle: 224,
        travelX: -350,
        travelY: 140,
        duration: 13.2,
        delay: 5.4,
      },
      {
        id: 3,
        top: '12%',
        left: '62%',
        width: 145,
        height: 2.2,
        angle: 206,
        travelX: -500,
        travelY: 185,
        duration: 15.4,
        delay: 9.2,
      },
    ],
    []
  )

  useEffect(() => {
    if (!forceShow && pathname !== '/') return
    if (typeof window === 'undefined') return

    // Use session storage so intro appears on a new visit/session.
    if (!forceShow) {
      const seen = window.sessionStorage.getItem(INTRO_KEY)
      if (seen === '1') return
    }

    setShow(true)
    // Cleanup old permanent flag from previous behavior.
    window.localStorage.removeItem(LEGACY_LOCAL_KEY)

    const fadeTimer = window.setTimeout(() => setFadeOut(true), INTRO_DURATION_MS - 550)
    const endTimer = window.setTimeout(() => {
      if (!forceShow) {
        window.sessionStorage.setItem(INTRO_KEY, '1')
        setShow(false)
      } else {
        setFadeOut(false)
      }
    }, INTRO_DURATION_MS)

    return () => {
      window.clearTimeout(fadeTimer)
      window.clearTimeout(endTimer)
    }
  }, [pathname, forceShow])

  useEffect(() => {
    if (!show || !outlineAnimationRef.current) return
    let destroyed = false
    let animationInstance: any = null

    const load = async () => {
      const lottieModule = await import('lottie-web')
      const lottie: any = (lottieModule as any).default || lottieModule

      let animationData: any = null
      let loadedPath = ''
      for (const outlinePath of OUTLINE_JSON_PATHS) {
        const response = await fetch(outlinePath, { cache: 'no-store' })
        if (!response.ok) continue
        animationData = await response.json()
        loadedPath = outlinePath
        break
      }

      if (!animationData) {
        throw new Error('weddingoutline.json not found in /public/intro or /public root')
      }

      console.log(`✅ Wedding outline animation loaded from: ${loadedPath}`)
      if (destroyed || !outlineAnimationRef.current) return
      animationInstance = lottie.loadAnimation({
        container: outlineAnimationRef.current,
        renderer: 'svg',
        loop: true,
        autoplay: true,
        animationData,
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid meet',
          progressiveLoad: true,
        },
      })
      setOutlineReady(true)
    }

    load().catch((err) => {
      setOutlineReady(false)
      console.error('Failed to load wedding outline animation:', err)
    })

    return () => {
      destroyed = true
      setOutlineReady(false)
      if (animationInstance) animationInstance.destroy()
    }
  }, [show])

  if (!show) return null

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#0E1936] via-[#172B57] to-[#1C2451] transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_18%,rgba(255,255,255,.24),transparent_34%),radial-gradient(circle_at_85%_18%,rgba(165,195,255,.2),transparent_30%),radial-gradient(circle_at_55%_78%,rgba(129,115,255,.2),transparent_38%)]" />

      {stars.map((star) => (
        <span
          key={star.id}
          className="animate-twinkle absolute rounded-full bg-white"
          style={{
            top: `${star.top}%`,
            left: `${star.left}%`,
            width: star.size,
            height: star.size,
            opacity: star.opacity,
            filter: `blur(${star.blur}px)`,
            animationDuration: `${star.duration}s`,
            animationDelay: `${star.delay}s`,
            boxShadow: `0 0 ${star.glow}px rgba(255,255,255,0.65)`,
          }}
        />
      ))}

      {shootingStars.map((shootingStar) => (
        <span
          key={shootingStar.id}
          aria-hidden
          className="shooting-star"
          style={{
            top: shootingStar.top,
            left: shootingStar.left,
            width: `${shootingStar.width}px`,
            height: `${shootingStar.height}px`,
            ['--shoot-angle' as any]: `${shootingStar.angle}deg`,
            ['--shoot-x' as any]: `${shootingStar.travelX}px`,
            ['--shoot-y' as any]: `${shootingStar.travelY}px`,
            animationDuration: `${shootingStar.duration}s`,
            animationDelay: `${shootingStar.delay}s`,
          }}
        />
      ))}

      <div
        ref={outlineAnimationRef}
        aria-hidden
        className={`pointer-events-none absolute bottom-[-2%] left-1/2 z-[3] h-[260px] w-[96vw] max-w-[1200px] -translate-x-1/2 md:bottom-[-4%] md:h-[460px] ${
          outlineReady ? 'opacity-95' : 'opacity-0'
        }`}
      />

      <div className="relative z-10 text-center">
        <div className="relative mx-auto mb-4 w-fit animate-logo-in">
          <Image
            src={INTRO_LOGO_PATHS[logoIndex] || '/favicon.png'}
            alt="BUSHARA Logo"
            width={320}
            height={320}
            priority
            className="h-auto w-[220px] object-contain md:w-[320px]"
            onError={() =>
              setLogoIndex((prev) => (prev < INTRO_LOGO_PATHS.length - 1 ? prev + 1 : prev))
            }
          />
        </div>
        <p className="animate-slogan-in mt-5 text-lg text-[#eef5ff] md:text-2xl">
          لحظتك تبدأ بدعوة تليق بك
        </p>
      </div>

      <style jsx>{`
        .animate-twinkle {
          animation-name: twinkle;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }

        .animate-logo-in {
          animation: logoEnter 1.2s ease-out both;
        }

        .shooting-star {
          position: absolute;
          z-index: 4;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0));
          filter: blur(0.4px);
          box-shadow: 0 0 12px rgba(255, 255, 255, 0.85);
          transform-origin: left center;
          transform: translateX(0) translateY(0) rotate(var(--shoot-angle));
          opacity: 0;
          animation-name: shootingStar;
          animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
          animation-iteration-count: infinite;
        }

        .shooting-star::after {
          content: '';
          position: absolute;
          left: -2px;
          top: 50%;
          width: 6px;
          height: 6px;
          border-radius: 999px;
          transform: translateY(-50%);
          background: rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 10px rgba(255, 255, 255, 0.8);
        }

        .animate-slogan-in {
          animation: sloganEnter 1.5s ease-out both;
          animation-delay: 0.5s;
        }

        @keyframes twinkle {
          0%,
          100% {
            transform: scale(0.85);
            opacity: 0.35;
          }
          50% {
            transform: scale(1.25);
            opacity: 1;
          }
        }

        @keyframes shootingStar {
          0% {
            transform: translateX(0) translateY(0) rotate(var(--shoot-angle));
            opacity: 0;
          }
          8% {
            opacity: 0.95;
          }
          16% {
            opacity: 0.95;
          }
          24% {
            transform: translateX(var(--shoot-x)) translateY(var(--shoot-y)) rotate(var(--shoot-angle));
            opacity: 0;
          }
          100% {
            transform: translateX(var(--shoot-x)) translateY(var(--shoot-y)) rotate(var(--shoot-angle));
            opacity: 0;
          }
        }

        @keyframes logoEnter {
          0% {
            opacity: 0;
            transform: translateY(16px) scale(0.92);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        @keyframes sloganEnter {
          0% {
            opacity: 0;
            transform: translateY(14px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  )
}

