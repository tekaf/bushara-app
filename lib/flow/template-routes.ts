export const TEMPLATE_FAVORITES_QUERY = 'favorites=1'

/** Catalog browse — all designs without an active package flow. */
export function templatesBrowseUrl(options?: { favoritesOnly?: boolean }): string {
  const params = new URLSearchParams()
  params.set('browse', '1')
  if (options?.favoritesOnly) params.set('favorites', '1')
  return `/templates?${params.toString()}`
}

export function templateDetailBrowseUrl(templateId: string): string {
  return `/templates/${encodeURIComponent(templateId)}?browse=1`
}

type SearchParamsLike = { get(name: string): string | null }

export function isTemplateBrowseMode(searchParams: SearchParamsLike): boolean {
  return searchParams.get('browse') === '1'
}

export function isTemplateFavoritesView(searchParams: SearchParamsLike): boolean {
  return searchParams.get('favorites') === '1'
}
