import { defineStore } from 'pinia'
import api from '../api/axios'

export const useFeaturesStore = defineStore('features', {
  state: () => ({
    flags: {},
    loadedForSlug: '',
    loading: false,
  }),
  getters: {
    showReviews: (state) => Boolean(state.loadedForSlug) && state.flags.nav_reviews !== false,
    showInfo:    (state) => Boolean(state.loadedForSlug) && state.flags.nav_info !== false,
    showChat:    (state) => Boolean(state.loadedForSlug) && state.flags.nav_chat !== false,
    showRoomsTab: (state) => !state.loadedForSlug || state.flags.tab_rooms !== false,
    showKioskTab: (state) => Boolean(state.loadedForSlug) && state.flags.tab_kiosk !== false,
    showSettingsTab: (state) => !state.loadedForSlug || state.flags.tab_settings !== false,
    paymentEnabled: (state) => !state.loadedForSlug || state.flags.feat_payment_slip !== false,
    couponsEnabled: (state) => !state.loadedForSlug || state.flags.feat_coupons !== false,
  },
  actions: {
    enabled(key) {
      return this.flags[key] !== false
    },
    invalidate() {
      this.loadedForSlug = ''
    },
    async fetch(slug, { force = false } = {}) {
      const hotelSlug = String(slug || '').trim()
      if (!hotelSlug) return this.flags
      if (!force && this.loadedForSlug === hotelSlug && Object.keys(this.flags).length) {
        return this.flags
      }
      this.loading = true
      try {
        const { data } = await api.get(`/api/hotels/${encodeURIComponent(hotelSlug)}/features`)
        this.flags = { ...(data?.features || {}) }
        this.loadedForSlug = hotelSlug
        return this.flags
      } catch {
        this.flags = {}
        this.loadedForSlug = hotelSlug
        return this.flags
      } finally {
        this.loading = false
      }
    },
    reset() {
      this.flags = {}
      this.loadedForSlug = ''
    },
  },
})
