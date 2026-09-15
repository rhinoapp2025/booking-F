const FONT_CATALOG = {
  noto: {
    label: 'Noto Sans Thai',
    css: "'Noto Sans Thai', sans-serif",
    href: '',
  },
  sarabun: {
    label: 'Sarabun',
    css: "'Sarabun', 'Noto Sans Thai', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Sarabun:wght@400;500;600;700&display=swap',
  },
  prompt: {
    label: 'Prompt',
    css: "'Prompt', 'Noto Sans Thai', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap',
  },
  kanit: {
    label: 'Kanit',
    css: "'Kanit', 'Noto Sans Thai', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=Kanit:wght@400;500;600;700&display=swap',
  },
  ibm: {
    label: 'IBM Plex Sans Thai',
    css: "'IBM Plex Sans Thai', 'Noto Sans Thai', sans-serif",
    href: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&display=swap',
  },
  system: {
    label: 'System',
    css: "system-ui, 'Segoe UI', 'Noto Sans Thai', sans-serif",
    href: '',
  },
}

const FONT_SIZE_SCALE = {
  sm: 0.9,
  md: 1,
  lg: 1.12,
  xl: 1.24,
}

const DEFAULT_THEME = {
  ui_color_primary: '#001529',
  ui_color_text: '#1A2332',
  ui_color_background: '#F0F2F5',
  ui_font_family: 'noto',
  ui_font_size: 'md',
}

const FONT_LINK_ID = 'hotel-theme-font'

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function hexToRgb(hex) {
  const raw = String(hex || '').replace('#', '')
  if (raw.length !== 6) return { r: 45, g: 36, b: 36 }
  return {
    r: parseInt(raw.slice(0, 2), 16),
    g: parseInt(raw.slice(2, 4), 16),
    b: parseInt(raw.slice(4, 6), 16),
  }
}

function rgbToHex({ r, g, b }) {
  const h = (n) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, '0')
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase()
}

function mix(hex, withHex, amount) {
  const a = hexToRgb(hex)
  const b = hexToRgb(withHex)
  const t = clamp(amount, 0, 1)
  return rgbToHex({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  })
}

function luminance(hex) {
  const { r, g, b } = hexToRgb(hex)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

function ensureFontLink(href) {
  if (typeof document === 'undefined') return
  let el = document.getElementById(FONT_LINK_ID)
  if (!href) {
    el?.remove()
    return
  }
  if (!el) {
    el = document.createElement('link')
    el.id = FONT_LINK_ID
    el.rel = 'stylesheet'
    document.head.appendChild(el)
  }
  if (el.getAttribute('href') !== href) el.setAttribute('href', href)
}

export function fontOptions() {
  return Object.entries(FONT_CATALOG).map(([id, item]) => ({ id, label: item.label }))
}

function normalizeHex(value, fallback) {
  const raw = String(value || '').trim()
  const short = raw.match(/^#([0-9a-fA-F]{3})$/)
  if (short) {
    const [r, g, b] = short[1].split('')
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase()
  }
  const full = raw.match(/^#([0-9a-fA-F]{6})$/)
  if (full) return `#${full[1]}`.toUpperCase()
  return fallback
}

export function normalizeTheme(partial = {}) {
  const family = FONT_CATALOG[partial.ui_font_family] ? partial.ui_font_family : DEFAULT_THEME.ui_font_family
  const size = FONT_SIZE_SCALE[partial.ui_font_size] ? partial.ui_font_size : DEFAULT_THEME.ui_font_size
  return {
    ui_color_primary: normalizeHex(partial.ui_color_primary, DEFAULT_THEME.ui_color_primary),
    ui_color_text: normalizeHex(partial.ui_color_text, DEFAULT_THEME.ui_color_text),
    ui_color_background: normalizeHex(partial.ui_color_background, DEFAULT_THEME.ui_color_background),
    ui_font_family: family,
    ui_font_size: size,
  }
}

export function applyHotelTheme(partial = {}) {
  if (typeof document === 'undefined') return normalizeTheme(partial)
  const theme = normalizeTheme(partial)
  const root = document.documentElement
  const primary = theme.ui_color_primary
  const text = theme.ui_color_text
  const bg = theme.ui_color_background
  const font = FONT_CATALOG[theme.ui_font_family]
  const scale = FONT_SIZE_SCALE[theme.ui_font_size]
  const lightBg = luminance(bg) > 0.45

  root.style.setProperty('--color-primary', primary)
  root.style.setProperty('--color-primary-hover', mix(primary, '#000000', 0.12))
  root.style.setProperty('--color-primary-dark', mix(primary, '#000000', 0.22))
  root.style.setProperty('--color-primary-light', mix(primary, lightBg ? '#FFFFFF' : bg, 0.86))
  root.style.setProperty('--color-on-primary', luminance(primary) > 0.62 ? '#2D2424' : '#FFFFFF')
  root.style.setProperty('--slot-mine-border', primary)
  root.style.setProperty('--color-text-primary', text)
  root.style.setProperty('--color-text-secondary', mix(text, bg, 0.38))
  root.style.setProperty('--color-text-muted', mix(text, bg, 0.55))
  root.style.setProperty('--color-background', bg)
  root.style.setProperty('--color-bg', bg)
  root.style.setProperty('--color-surface', mix(bg, '#FFFFFF', lightBg ? 0.45 : 0.08))
  root.style.setProperty('--color-surface-elevated', mix(bg, '#FFFFFF', lightBg ? 0.85 : 0.14))
  root.style.setProperty('--color-surface-muted', mix(bg, '#000000', lightBg ? 0.04 : 0.18))
  root.style.setProperty('--color-border', mix(bg, text, 0.12))
  root.style.setProperty('--color-border-strong', mix(bg, text, 0.22))
  root.style.setProperty('--font-body', font.css)
  root.style.setProperty('--font-display', font.css)
  root.style.setProperty('--font-scale', String(scale))
  ensureFontLink(font.href)
  return theme
}

export function resetHotelTheme() {
  return applyHotelTheme(DEFAULT_THEME)
}

export { DEFAULT_THEME, FONT_CATALOG, FONT_SIZE_SCALE }
