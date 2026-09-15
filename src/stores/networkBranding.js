import { defineStore } from 'pinia'
import api from '../api/axios'
import { apiMediaUrl } from '../utils/resolveUiImageUrl'
import { DEFAULT_THEME } from '../utils/applyHotelTheme'

const EMPTY = {
  name: 'ค้นหาโรงแรม',
  logo_url: '',
  hero_url: '',
  theme: { ...DEFAULT_THEME },
}

export const useNetworkBrandingStore = defineStore('networkBranding', {
  state: () => ({
    branding: { ...EMPTY, theme: { ...DEFAULT_THEME } },
    loaded: false,
    loading: false,
  }),
  getters: {
    name: (state) => state.branding.name || EMPTY.name,
    logoUrl: (state) => apiMediaUrl(state.branding.logo_url),
    heroUrl: (state) => apiMediaUrl(state.branding.hero_url),
  },
  actions: {
    applyPayload(data) {
      this.branding = {
        name: String(data?.name || '').trim() || EMPTY.name,
        logo_url: data?.logo_url || '',
        hero_url: data?.hero_url || '',
        theme: { ...DEFAULT_THEME, ...(data?.theme || {}) },
      }
      this.loaded = true
    },
    async fetch({ force = false } = {}) {
      if (this.loaded && !force) return this.branding
      this.loading = true
      try {
        const { data } = await api.get('/api/hotels/network-branding')
        this.applyPayload(data)
      } catch {
        if (!this.loaded) this.branding = { ...EMPTY, theme: { ...DEFAULT_THEME } }
      } finally {
        this.loading = false
      }
      return this.branding
    },
  },
})
