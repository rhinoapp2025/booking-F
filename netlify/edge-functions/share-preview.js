const BOT_UA =
  /bot|crawler|spider|facebookexternalhit|Facebot|Twitterbot|LinkedInBot|Slackbot|Discordbot|WhatsApp|TelegramBot|Line\/|line-poker|Applebot/i

const SLUG_RE = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|$)/i
const RESERVED = new Set(['api', 'assets', 'favicon.png', 'favicon.svg', 'version.json'])

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

function absoluteUrl(apiBase, path) {
  const value = String(path || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  const base = String(apiBase || '').replace(/\/$/, '')
  return `${base}${value.startsWith('/') ? value : `/${value}`}`
}

function injectShareMeta(html, meta) {
  const title = escapeHtml(meta.title)
  const description = escapeHtml(meta.description)
  const url = escapeHtml(meta.url)
  const image = meta.image ? escapeHtml(meta.image) : ''
  const tags = [
    `<meta name="description" content="${description}">`,
    `<meta property="og:site_name" content="theotel">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${url}">`,
  ]
  if (image) tags.push(`<meta property="og:image" content="${image}">`)

  let next = html.replace(/<title>[^<]*<\/title>/i, `<title>${title}</title>`)
  next = next.replace(/<meta[^>]+(?:name="description"|property="og:[^"]+")[^>]*>\s*/gi, '')
  next = next.replace(/<\/title>/i, `</title>\n    ${tags.join('\n    ')}`)
  return next
}

export default async (request, context) => {
  const ua = request.headers.get('user-agent') || ''
  if (!BOT_UA.test(ua)) return context.next()

  const pageUrl = new URL(request.url)
  const apiBase =
    Deno.env.get('API_BASE_URL') ||
    Deno.env.get('VITE_API_BASE_URL') ||
    'https://nail-b.onrender.com'
  const siteIcon = new URL('/favicon.png', pageUrl.origin).toString()
  const meta = {
    title: 'theotel',
    description: 'จองห้องพักออนไลน์กับ theotel',
    image: siteIcon,
    url: pageUrl.href,
  }

  const match = pageUrl.pathname.match(SLUG_RE)
  const slug = match ? match[1].toLowerCase() : ''
  if (slug && !RESERVED.has(slug)) {
    try {
      const previewRes = await fetch(`${apiBase.replace(/\/$/, '')}/api/hotels/${encodeURIComponent(slug)}`)
      if (previewRes.ok) {
        const hotel = await previewRes.json()
        const name = String(hotel?.name || '').trim()
        if (name) {
          meta.title = name
          meta.description = String(hotel.description || '').trim() || `จองห้องพัก ${name}`
          meta.image = absoluteUrl(apiBase, hotel.logo_url) || siteIcon
        }
      }
    } catch {
      // keep the site title when the hotel lookup fails
    }
  }

  try {
    const htmlRes = await fetch(new URL('/index.html', request.url))
    if (!htmlRes.ok) return context.next()
    const html = injectShareMeta(await htmlRes.text(), meta)
    return new Response(html, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'public, max-age=300',
      },
    })
  } catch {
    return context.next()
  }
}

export const config = {
  path: '/*',
}
