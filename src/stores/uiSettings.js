import { defineStore } from 'pinia'
import { applyHotelTheme, DEFAULT_THEME } from '../utils/applyHotelTheme'
import { formatUiText } from '../utils/formatUiText'
import { resolveUiImageUrl } from '../utils/resolveUiImageUrl'
import { applyPageMeta } from '../utils/pageMeta'
import { useHotelStore } from './hotel'

const FALLBACK = {
  ui_brand_main:          'Hotel',
  ui_brand_accent:        '',
  ui_tagline:             'จองห้องพักออนไลน์',
  ui_page_title:          'Hotel Booking',
  ui_logo_url:            '',
  ui_hero_image_url:      '',
  ...DEFAULT_THEME,
}

function applyTheme(settings, hotelSlug = '', hotelName = '') {
  applyHotelTheme(settings)

  let name = String(hotelName || '').trim()
  if (!name) {
    try {
      name = String(useHotelStore().hotel?.name || '').trim()
    } catch {
      name = ''
    }
  }
  const pageTitle   = settings.ui_page_title || FALLBACK.ui_page_title
  const title       = name || pageTitle
  const description = settings.ui_tagline || FALLBACK.ui_tagline
  const image       = resolveUiImageUrl(settings.ui_logo_url, hotelSlug)
  applyPageMeta({
    title,
    description,
    image,
    url: typeof window !== 'undefined' ? window.location.href : '',
  })
}

export const useUiSettingsStore = defineStore('uiSettings', {
  state: () => ({
    settings:     { ...FALLBACK },
    loadedForSlug: '',
    loading:      false,
  }),
  getters: {
    t:          (state) => (key, vars) => formatUiText(state.settings[key] ?? '', vars),
    brandMain:  (state) => state.settings.ui_brand_main  || FALLBACK.ui_brand_main,
    brandAccent:(state) => state.settings.ui_brand_accent || FALLBACK.ui_brand_accent,
    tagline:    (state) => state.settings.ui_tagline      || FALLBACK.ui_tagline,
    logoUrl:    (state) => resolveUiImageUrl(state.settings.ui_logo_url, state.loadedForSlug),
    heroImageUrl:(state)=> resolveUiImageUrl(state.settings.ui_hero_image_url, state.loadedForSlug),
    get:        (state) => (key, fallback = '') => state.settings[key] ?? fallback,
  },
  actions: {
    applyFromHotel(hotel) {
      const slug = hotel?.slug || ''
      this.settings = { ...FALLBACK, ...(hotel?.theme || {}) }
      this.loadedForSlug = slug
      applyTheme(this.settings, slug, hotel?.name || '')
      return this.settings
    },
    applyFromNetwork(branding) {
      const name = String(branding?.name || '').trim() || 'ค้นหาโรงแรม'
      this.settings = {
        ...FALLBACK,
        ...(branding?.theme || {}),
        ui_brand_main: name,
        ui_logo_url: branding?.logo_url || '',
        ui_hero_image_url: branding?.hero_url || '',
      }
      this.loadedForSlug = ''
      applyTheme(this.settings, '', name)
      return this.settings
    },
    applyLocal(partial) {
      this.settings = { ...this.settings, ...partial }
      applyTheme(this.settings, this.loadedForSlug)
    },
    reset() {
      this.settings = { ...FALLBACK }
      this.loadedForSlug = ''
      applyTheme(FALLBACK)
    },
  },
})
