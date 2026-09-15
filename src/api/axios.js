import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001',
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`

  const hotelSlug = localStorage.getItem('hotelSlug')
  const headers = config.headers || {}
  const existing = headers['X-Hotel-Slug']
    ?? (typeof headers.get === 'function' ? headers.get('X-Hotel-Slug') : undefined)
  if (hotelSlug && (existing == null || existing === '')) {
    if (typeof headers.set === 'function') {
      headers.set('X-Hotel-Slug', hotelSlug)
    } else {
      headers['X-Hotel-Slug'] = hotelSlug
    }
    config.headers = headers
  }
  return config
})

export default api
