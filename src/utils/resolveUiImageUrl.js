export function apiMediaUrl(path) {
  const u = String(path || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u) || u.startsWith('data:') || u.startsWith('blob:')) return u
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
  return `${base}${u.startsWith('/') ? u : `/${u}`}`
}

export function resolveUiImageUrl(url, hotelSlug) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (/^https?:\/\//i.test(u) || u.startsWith('data:') || u.startsWith('blob:')) return u
  if (u.startsWith('/api/')) {
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
    try {
      const resolved = new URL(u, `${base}/`)
      const slug = hotelSlug || localStorage.getItem('hotelSlug') || ''
      if (slug && !resolved.searchParams.has('hotel')) resolved.searchParams.set('hotel', slug)
      return resolved.toString()
    } catch {
      return `${base}${u}`
    }
  }
  return u
}
