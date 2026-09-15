import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useHotelStore } from '../stores/hotel'
import { useFeaturesStore } from '../stores/features'
import { dismissBlockingOverlays, scheduleOverlayCleanup } from '../utils/dismissBlockingOverlays'
import { releaseAllBodyScrollLocks } from '../utils/bodyScrollLock'
import { safeInternalPath } from '../utils/safeInternalPath'

import HotelPickerView from '../views/HotelPickerView.vue'
import LoginView       from '../views/LoginView.vue'
import BookingView     from '../views/BookingView.vue'
import ProfileView     from '../views/ProfileView.vue'
import ReviewsView     from '../views/ReviewsView.vue'
import AdminView       from '../views/AdminView.vue'
import HotelConfigView from '../views/HotelConfigView.vue'
import PlatformSettingsView from '../views/PlatformSettingsView.vue'
import PaymentView     from '../views/PaymentView.vue'
import ChatView        from '../views/ChatView.vue'
import HotelInfoView   from '../views/HotelInfoView.vue'

const hotelChildren = [
  { path: 'login',    component: LoginView,    meta: { guest: true } },
  { path: 'bookings', component: BookingView,  meta: { appNav: true } },
  { path: 'reviews',  component: ReviewsView,  meta: { requiresAuth: true, appNav: true } },
  { path: 'info',     component: HotelInfoView, meta: { appNav: true } },
  { path: 'chat',     component: ChatView,     meta: { requiresAuth: true, appNav: true } },
  { path: 'profile',  component: ProfileView,  meta: { requiresAuth: true, appNav: true } },
  { path: 'payment/:bookingId', component: PaymentView, meta: { requiresAuth: true } },
  { path: 'admin',    component: AdminView,    meta: { requiresAuth: true, requiresAdmin: true, appNav: true } },
  { path: 'admin/config', component: HotelConfigView, meta: { requiresAuth: true, requiresAdmin: true, appNav: true } },
  { path: 'admin/platform', component: PlatformSettingsView, meta: { requiresAuth: true, requiresSuperAdmin: true, appNav: true } },
  { path: 'auth/callback', component: LoginView, meta: { guest: true } },
  { path: '', redirect: (to) => ({ path: `/${to.params.hotelSlug}/bookings` }) },
]

const router = createRouter({
  history: createWebHistory(),
  scrollBehavior() {
    return { left: 0, top: 0 }
  },
  routes: [
    { path: '/', component: HotelPickerView },
    { path: '/:hotelSlug', children: hotelChildren },
    // Legacy redirects
    { path: '/login',   redirect: '/default/login' },
    { path: '/bookings', redirect: '/default/bookings' },
    { path: '/reviews', redirect: '/default/reviews' },
    { path: '/chat',    redirect: '/default/chat' },
    { path: '/profile', redirect: '/default/profile' },
    { path: '/admin',   redirect: '/default/admin' },
    { path: '/auth/callback', redirect: '/default/auth/callback' },
    { path: '/payment/:bookingId', redirect: (to) => `/default/payment/${to.params.bookingId}` },
  ],
})

function hotelPath(hotelSlug, suffix) {
  return `/${hotelSlug}${suffix}`
}

router.beforeEach(async (to) => {
  releaseAllBodyScrollLocks()
  dismissBlockingOverlays()

  const auth       = useAuthStore()
  const hotelStore = useHotelStore()
  const features   = useFeaturesStore()
  const hotelSlug  = to.params.hotelSlug

  if (hotelSlug) {
    const loadedSlug = String(hotelStore.hotel?.slug || '').trim().toLowerCase()
    if (loadedSlug !== String(hotelSlug).trim().toLowerCase()) {
      try {
        await hotelStore.loadHotel(hotelSlug)
      } catch {
        return '/'
      }
    }
    await features.fetch(hotelSlug, { force: true })
  }

  if (auth.token) {
    const slugChanged = Boolean(hotelSlug) && auth.pointsHotelSlug !== hotelSlug
    if (!auth.user || slugChanged) {
      try {
        await auth.fetchMe()
      } catch {
        if (hotelSlug) return hotelPath(hotelSlug, '/login')
        return '/'
      }
    }
  }

  if (to.meta.requiresAuth && !auth.isLoggedIn) {
    if (hotelSlug) {
      return { path: hotelPath(hotelSlug, '/login'), query: { redirect: to.fullPath } }
    }
    return '/'
  }
  if (to.meta.requiresAdmin && !auth.canAccessHotelAdmin(hotelSlug)) {
    if (hotelSlug) return hotelPath(hotelSlug, '/bookings')
    return '/'
  }
  if (to.meta.requiresSuperAdmin && !auth.isSuperAdmin) {
    if (hotelSlug) return hotelPath(hotelSlug, '/admin')
    return '/'
  }
  if (to.meta.guest && auth.isLoggedIn) {
    const fallback = hotelSlug ? hotelPath(hotelSlug, '/bookings') : '/'
    return safeInternalPath(to.query.redirect, fallback)
  }

  const path = String(to.path || '')
  if (hotelSlug && features.loadedForSlug === hotelSlug) {
    if (path.endsWith('/reviews') && !features.enabled('nav_reviews')) return hotelPath(hotelSlug, '/bookings')
    if (path.endsWith('/info') && !features.enabled('nav_info')) return hotelPath(hotelSlug, '/bookings')
    if (path.endsWith('/chat') && !features.enabled('nav_chat')) return hotelPath(hotelSlug, '/bookings')
  }

  return true
})

router.afterEach(() => {
  releaseAllBodyScrollLocks()
  dismissBlockingOverlays()
  scheduleOverlayCleanup()
  window.scrollTo(0, 0)
})

export default router
