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
  left: string
  top: string
  size: number
  delay: number
  duration: number
}

type Meteor = {
  right: string
  bottom: string
  delay: number
  duration: number
  width: number
  opacity: number
  peakHeight: number
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

  const stars = useMemo<Star[]>(
    () =>
      Array.from({ length: 110 }).map((_, i) => ({
        left: `${(i * 37) % 100}%`,
        top: `${(i * 53) % 100}%`,
        size: 1.5 + (i % 4) * 0.8,
        delay: (i % 10) * 0.22,
        duration: 1.9 + (i % 6) * 0.38,
      })),
    []
  )
  const meteors = useMemo<Meteor[]>(
    () => [
      // Large meteor
      { right: '8%', bottom: '-8%', delay: 0.25, duration: 2.4, width: 5, opacity: 0.95, peakHeight: 480 },
      // Small meteor
      { right: '44%', bottom: '-6%', delay: 1.35, duration: 1.9, width: 3, opacity: 0.82, peakHeight: 260 },
      // Very small/far meteor
      { right: '74%', bottom: '4%', delay: 2.45, duration: 1.6, width: 2, opacity: 0.65, peakHeight: 170 },
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
      className={`fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-gradient-to-b from-[#08122e] via-[#142a62] to-[#27125e] transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.28),transparent_36%),radial-gradient(circle_at_85%_18%,rgba(145,210,255,.18),transparent_30%),radial-gradient(circle_at_50%_78%,rgba(186,113,255,.18),transparent_36%)]" />

      {stars.map((star, idx) => (
        <span
          key={idx}
          className="absolute rounded-full bg-white star-float"
          style={{
            left: star.left,
            top: star.top,
            width: `${star.size}px`,
            height: `${star.size}px`,
            animationDelay: `${star.delay}s`,
            animationDuration: `${star.duration}s`,
            boxShadow: '0 0 10px rgba(255,255,255,0.95), 0 0 22px rgba(180,210,255,0.65)',
          }}
        />
      ))}

      {meteors.map((meteor, idx) => (
        <span
          key={`meteor-${idx}`}
          aria-hidden
          className="absolute meteor-shoot"
          style={{
            right: meteor.right,
            bottom: meteor.bottom,
            width: `${meteor.width}px`,
            opacity: meteor.opacity,
            ['--meteor-delay' as any]: `${meteor.delay}s`,
            ['--meteor-duration' as any]: `${meteor.duration}s`,
            ['--meteor-peak' as any]: `${meteor.peakHeight}px`,
          }}
        />
      ))}

      <div className="rocket-wrap" aria-hidden>
        <span className="rocket">🚀</span>
      </div>

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
        .star-float {
          animation-name: starTwinkle, starDrift;
          animation-timing-function: ease-in-out, linear;
          animation-iteration-count: infinite, infinite;
        }

        .meteor-shoot {
          height: 8px;
          border-top-left-radius: 999px;
          border-top-right-radius: 999px;
          background: linear-gradient(to top, rgba(255, 255, 255, 0), rgba(255, 255, 255, 1));
          filter: drop-shadow(0 0 10px rgba(180, 230, 255, 0.95));
          transform: rotate(-45deg);
          transform-origin: bottom center;
          animation-name: animShootingStar;
          animation-duration: var(--meteor-duration);
          animation-delay: var(--meteor-delay);
          animation-timing-function: linear;
          animation-iteration-count: 1;
          animation-fill-mode: both;
          z-index: 6;
        }

        .rocket-wrap {
          position: absolute;
          left: -10%;
          top: 58%;
          width: 120%;
          animation: rocketFlight 4.2s ease-in-out infinite;
          pointer-events: none;
        }

        .rocket {
          position: absolute;
          font-size: 36px;
          filter: drop-shadow(0 6px 16px rgba(11, 43, 95, 0.4));
        }

        .rocket::after {
          content: '';
          position: absolute;
          left: -30px;
          top: 50%;
          width: 26px;
          height: 3px;
          transform: translateY(-50%);
          background: linear-gradient(90deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.9));
          border-radius: 999px;
        }

        .animate-logo-in {
          animation: logoEnter 1.2s ease-out both;
        }

        .animate-slogan-in {
          animation: sloganEnter 1.5s ease-out both;
          animation-delay: 0.5s;
        }

        @keyframes starTwinkle {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(1);
          }
          50% {
            opacity: 1;
            transform: scale(1.4);
          }
        }

        @keyframes starDrift {
          0% {
            transform: translateY(0px);
          }
          50% {
            transform: translateY(-10px);
          }
          100% {
            transform: translateY(0px);
          }
        }

        @keyframes animShootingStar {
          0% {
            transform: translateY(0px) translateX(0px) rotate(-45deg);
            opacity: 0;
            height: 8px;
          }
          12% {
            opacity: 1;
          }
          55% {
            opacity: 1;
            height: var(--meteor-peak);
          }
          100% {
            opacity: 0;
            height: calc(var(--meteor-peak) * 1.6);
            transform: translateY(-170vh) translateX(-170vw) rotate(-45deg);
          }
        }

        @keyframes rocketFlight {
          0% {
            transform: translate3d(0%, 32px, 0) rotate(-8deg);
            opacity: 0;
          }
          10% {
            opacity: 1;
          }
          50% {
            transform: translate3d(52%, -20px, 0) rotate(-10deg);
          }
          100% {
            transform: translate3d(100%, -90px, 0) rotate(-12deg);
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

