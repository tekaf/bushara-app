import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#6B4EFF',
        primarySoft: '#EDE9FF',
        accent: '#8B5CF6',
        textDark: '#2E2E38',
        muted: '#8A8A9E',
        bg: '#F9F9FC',
        admin: {
          surface: '#FFFFFF',
          surfaceSoft: '#FAFAFC',
          border: '#ECECF2',
          borderLight: '#F3F3F8',
          sidebar: '#FBFBFE',
          gold: '#C4A962',
          goldSoft: '#F7F2E8',
        },
      },
      fontFamily: {
        sans: ['var(--font-cairo)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        admin: '0 1px 2px rgba(46, 46, 56, 0.04), 0 8px 24px rgba(46, 46, 56, 0.06)',
        'admin-hover': '0 2px 8px rgba(46, 46, 56, 0.06), 0 16px 40px rgba(107, 78, 255, 0.08)',
      },
      borderRadius: {
        admin: '14px',
        'admin-lg': '18px',
      },
      animation: {
        'admin-fade-in': 'adminFadeIn 0.35s ease-out',
      },
      keyframes: {
        adminFadeIn: {
          '0%': { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
export default config

