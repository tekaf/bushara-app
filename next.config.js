/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['puppeteer-core', '@sparticuz/chromium-min', 'sharp'],
  },
  images: {
    domains: ['firebasestorage.googleapis.com', 'storage.googleapis.com'],
  },
  async redirects() {
    return [
      {
        source: '/favicon.ico',
        destination: '/favicon.png',
        permanent: false,
      },
    ]
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals.push({
        'puppeteer-core': 'commonjs puppeteer-core',
        '@sparticuz/chromium-min': 'commonjs @sparticuz/chromium-min',
      })
    }
    return config
  },
}

module.exports = nextConfig

