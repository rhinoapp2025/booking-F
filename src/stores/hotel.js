import { defineStore } from 'pinia'
import api from '../api/axios'

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export const useHotelStore = defineStore('hotel', {
  state: () => ({
    slug:    localStorage.getItem('hotelSlug') || '',
    hotel:   null,
    hotels:  [],
    loading: false,
    error:   '',
  }),
  getters: {
    isReady:   (state) => Boolean(state.slug && state.hotel),
    hotelName: (state) => state.hotel?.name || state.slug,
  },
  actions: {
    setSlug(slug) {
      const normalized = String(slug || '').trim().toLowerCase()
      if (this.slug !== normalized) this.hotel = null
      this.slug = normalized
      if (normalized) {
        localStorage.setItem('hotelSlug', normalized)
      } else {
        localStorage.removeItem('hotelSlug')
      }
    },

    async fetchHotels() {
      this.loading = true
      this.error = ''
      try {
        const { data } = await api.get('/api/hotels')
        this.hotels = data || []
        return this.hotels
      } catch (err) {
        this.error = err?.response?.data?.error || 'โหลดรายการโรงแรมไม่สำเร็จ'
        throw err
      } finally {
        this.loading = false
      }
    },

    async loadHotel(slug, { retries = 2 } = {}) {
      const normalized = String(slug || '').trim().toLowerCase()
      if (!normalized) {
        this.hotel = null
        this.slug  = ''
        localStorage.removeItem('hotelSlug')
        return null
      }
      this.setSlug(normalized)
      this.loading = true
      this.error   = ''

      let lastError = null
      try {
        for (let attempt = 0; attempt <= retries; attempt++) {
          try {
            const { data } = await api.get(`/api/hotels/${encodeURIComponent(normalized)}`)
            this.hotel = data
            return data
          } catch (err) {
            lastError = err
            const isNetworkError = !err?.response
            if (!isNetworkError || attempt >= retries) break
            await sleep(1200 * (attempt + 1))
          }
        }
        this.hotel = null
        this.error = lastError?.response?.data?.error || 'ไม่พบโรงแรม'
        throw lastError
      } finally {
        this.loading = false
      }
    },

    clear() {
      this.slug  = ''
      this.hotel = null
      this.error = ''
      localStorage.removeItem('hotelSlug')
    },
  },
})
