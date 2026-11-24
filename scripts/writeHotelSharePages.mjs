import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
}

function absoluteUrl(origin, path) {
  const value = String(path || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `${origin}${value.startsWith('/') ? value : `/${value}`}`
}

function hotelPage(template, { title, description, image, url, favicon, apple }) {
  const safeTitle = escapeHtml(title)
  const safeDescription = escapeHtml(description)
  const safeImage = escapeHtml(image)
  const safeUrl = escapeHtml(url)
  const safeFavicon = escapeHtml(favicon || image)
  const safeApple = escapeHtml(apple || favicon || image)
  let html = template.replace(/<title>[^<]*<\/title>/i, `<title>${safeTitle}</title>`)
  html = html.replace(/<link[^>]+rel="(?:shortcut icon|icon|apple-touch-icon)"[^>]*>\s*/gi, '')
  html = html.replace(/<meta[^>]+(?:name="description"|property="og:[^"]+")[^>]*>\s*/gi, '')
  const tags = [
    `<link rel="icon" type="image/png" sizes="32x32" href="${safeFavicon}">`,
    `<link rel="apple-touch-icon" sizes="180x180" href="${safeApple}">`,
    `<meta name="description" content="${safeDescription}">`,
    `<meta property="og:site_name" content="theotel">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${safeTitle}">`,
    `<meta property="og:description" content="${safeDescription}">`,
    `<meta property="og:url" content="${safeUrl}">`,
    `<meta property="og:image" content="${safeImage}">`,
  ].join('\n    ')
  return html.replace(/<\/title>/i, `</title>\n    ${tags}`)
}

const HOTEL_LIST_ATTEMPTS = 6
const HOTEL_LIST_RETRY_MS = 5000

// ตอน deploy หลังบ้านมักรีสตาร์ทพร้อมกับที่หน้าบ้าน build จึงต้องรอแล้วลองใหม่
// ถ้าข้ามขั้นนี้ หน้าโรงแรมชุดเก่าบนเซิร์ฟเวอร์จะยังชี้ไฟล์ JS ของ build ก่อน
async function fetchHotels(api) {
  let lastError
  for (let attempt = 1; attempt <= HOTEL_LIST_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(`${api}/api/hotels`, { signal: AbortSignal.timeout(10000) })
      if (!response.ok) throw new Error(`hotel list ${response.status}`)
      const data = await response.json()
      return Array.isArray(data) ? data : []
    } catch (err) {
      lastError = err
      if (attempt < HOTEL_LIST_ATTEMPTS) {
        console.warn(`[share] hotel list attempt ${attempt} failed (${err.message}), retrying`)
        await new Promise((done) => setTimeout(done, HOTEL_LIST_RETRY_MS))
      }
    }
  }
  throw lastError
}

export async function writeHotelSharePages(distDir) {
  const origin = (process.env.SITE_ORIGIN || 'https://theotel.app').replace(/\/$/, '')
  const api = (process.env.SHARE_API_BASE || process.env.VITE_API_BASE_URL || origin).replace(/\/$/, '')
  const templatePath = resolve(distDir, 'index.html')
  let template
  try {
    template = readFileSync(templatePath, 'utf8')
  } catch (err) {
    console.warn('[share] skip hotel pages:', err.message)
    return
  }
  let hotels = []
  try {
    hotels = await fetchHotels(api)
  } catch (err) {
    console.warn('[share] hotel list unavailable, hotel pages NOT rewritten (old ones on the server keep the previous build):', err.message)
    return
  }
  let written = 0
  for (const hotel of hotels) {
    const slug = String(hotel.slug || '').trim().toLowerCase()
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue
    const title = String(hotel.name || '').trim() || 'theotel'
    const description = String(hotel.description || '').replace(/\s+/g, ' ').trim() || `จองห้องพัก ${title}`
    let version = '0'
    try {
      version = new URL(hotel.logo_url || '', origin).searchParams.get('v') || '0'
      version = version.replace(/\.[^.]+$/, '')
    } catch {
      version = '0'
    }
    const icon = (size) => `${origin}/api/hotels/${encodeURIComponent(slug)}/icon/${size}.png?v=${encodeURIComponent(version)}`
    const image = absoluteUrl(origin, hotel.logo_url || hotel.login_image_url) || icon(512)
    const page = hotelPage(template, {
      title,
      description,
      image,
      favicon: icon(32),
      apple: icon(180),
      url: `${origin}/${slug}`,
    })
    const folders = [
      resolve(distDir, slug),
      resolve(distDir, slug, 'bookings'),
      resolve(distDir, slug, 'booking-site'),
      resolve(distDir, slug, 'admin'),
      resolve(distDir, slug, 'admin', 'config'),
    ]
    for (const folder of folders) {
      mkdirSync(folder, { recursive: true })
      writeFileSync(resolve(folder, 'index.html'), page)
    }
    written += 1
  }
  console.log(`[share] wrote preview pages for ${written} hotels`)
}
