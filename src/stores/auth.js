import { defineStore } from 'pinia'
import api from '../api/axios'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token:   localStorage.getItem('token') || '',
    user:    null,
    loading: false,
    pointsHotelSlug: '',
  }),
  getters: {
    isLoggedIn:   (state) => Boolean(state.token),
    isAdmin:      (state) => Boolean(state.user?.is_admin),
    isSuperAdmin: (state) => Boolean(state.user?.is_super_admin),
    hotelSlug:    (state) => state.user?.hotel_slug || null,
    canAccessHotelAdmin: (state) => (slug) => {
      if (!state.user) return false
      if (state.user.is_super_admin) return true
      if (!state.user.is_admin) return false
      const slugs = state.user.hotel_slugs
      if (Array.isArray(slugs) && slugs.length) return slugs.includes(slug)
      return state.user.hotel_slug === slug
    },
  },
  actions: {
    setToken(token) {
      this.token = token || ''
      if (this.token) {
        localStorage.setItem('token', this.token)
      } else {
        localStorage.removeItem('token')
      }
    },
    async fetchMe() {
      if (!this.token) return null
      this.loading = true
      try {
        const { data } = await api.get('/api/auth/me')
        const { token, ...profile } = data
        this.user = profile
        this.pointsHotelSlug = localStorage.getItem('hotelSlug') || profile.points_hotel_slug || ''
        if (token) this.setToken(token)
        return profile
      } catch (error) {
        this.logout()
        throw error
      } finally {
        this.loading = false
      }
    },
    logout() {
      this.user = null
      this.pointsHotelSlug = ''
      this.setToken('')
    },
  },
})
