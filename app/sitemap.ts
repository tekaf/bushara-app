import type { MetadataRoute } from 'next'

const siteUrl = 'https://www.busharh.com'

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date()

  const routes = ['/', '/intro', '/designs', '/packages', '/templates', '/checkout', '/guests']

  return routes.map((route) => ({
    url: `${siteUrl}${route}`,
    lastModified: now,
    changeFrequency: route === '/' ? 'daily' : 'weekly',
    priority: route === '/' ? 1 : 0.8,
  }))
}
