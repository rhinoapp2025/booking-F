export function logoIconVersion(logoUrl) {
  const logo = String(logoUrl || '').trim()
  if (!logo) return '0'
  try {
    const version = new URL(logo, 'https://theotel.app').searchParams.get('v')
    if (version) return version.split('/').pop().replace(/\.[^.]+$/, '').slice(0, 24) || '0'
  } catch {
    /* keep the path fallback */
  }
  const base = logo.split('/').pop().split('?')[0]
  return base.replace(/\.[^.]+$/, '').slice(0, 24) || '0'
}

export function hotelIconUrl(apiBase, slug, size, version) {
  const base = String(apiBase || '').replace(/\/$/, '')
  const v = version != null && version !== '' ? `?v=${encodeURIComponent(String(version))}` : ''
  return `${base}/api/hotels/${encodeURIComponent(slug)}/icon/${size}.png${v}`
}

function replaceIconLink(rel, href, extra = {}) {
  document.querySelectorAll(`link[rel="${rel}"]`).forEach((el) => el.remove())
  const link = document.createElement('link')
  link.rel = rel
  link.href = href
  for (const [key, value] of Object.entries(extra)) {
    if (value) link.setAttribute(key, value)
  }
  document.head.appendChild(link)
}

export function syncHotelIcons({ hotelSlug, iconVersion, apiBase } = {}) {
  if (typeof document === 'undefined') return
  const slug = String(hotelSlug || '').trim().toLowerCase()
  const origin = window.location.origin
  const base = String(apiBase || import.meta.env.VITE_API_BASE_URL || origin).replace(/\/$/, '')
  if (!slug) {
    replaceIconLink('icon', `${origin}/favicon.png`, { type: 'image/png' })
    replaceIconLink('apple-touch-icon', `${origin}/favicon.png`)
    return
  }
  const version = iconVersion || '0'
  replaceIconLink('icon', hotelIconUrl(base, slug, 32, version), { type: 'image/png', sizes: '32x32' })
  replaceIconLink('apple-touch-icon', hotelIconUrl(base, slug, 180, version), { sizes: '180x180' })
}
