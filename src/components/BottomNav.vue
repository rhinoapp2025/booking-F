<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useHotelStore } from '../stores/hotel'
import { useChatUnread } from '../composables/useChatUnread'
import { useFeaturesStore } from '../stores/features'
import BrandMark from './BrandMark.vue'

defineProps({
  active: { type: String, default: 'bookings' },
})

const route  = useRoute()
const router = useRouter()
const auth   = useAuthStore()
const hotelStore = useHotelStore()
const { unreadCount } = useChatUnread()
const features = useFeaturesStore()

const hotelSlug   = computed(() => route.params.hotelSlug || localStorage.getItem('hotelSlug') || 'default')
const showAdmin   = computed(() => auth.canAccessHotelAdmin(hotelSlug.value))
const showReviews = computed(() => features.showReviews)
const showInfo    = computed(() => features.showInfo)
const showChat    = computed(() => features.showChat)

function go(path) {
  router.push(`/${hotelSlug.value}${path}`)
}
</script>

<template>
  <nav class="app-nav" aria-label="เมนูหลัก">
    <div class="nav-brand">
      <BrandMark />
      <p v-if="hotelStore.hotelName && !hotelStore.hotel?.logo_url" class="nav-hotel">{{ hotelStore.hotelName }}</p>
    </div>
    <div class="nav-items">
      <button type="button" class="nav-item" :class="{ active: active === 'bookings' }" @click="go('/bookings')">
        <i class="ti ti-calendar" aria-hidden="true"></i>
        <span>จอง</span>
      </button>
      <button v-if="showReviews" type="button" class="nav-item" :class="{ active: active === 'reviews' }" @click="go('/reviews')">
        <i class="ti ti-star" aria-hidden="true"></i>
        <span>รีวิว</span>
      </button>
      <button v-if="showInfo" type="button" class="nav-item" :class="{ active: active === 'info' }" @click="go('/info')">
        <i class="ti ti-map-pin" aria-hidden="true"></i>
        <span>ที่ตั้ง</span>
      </button>
      <button v-if="showChat" type="button" class="nav-item" :class="{ active: active === 'chat' }" @click="go('/chat')">
        <i class="ti ti-message-circle" aria-hidden="true"></i>
        <span>แชท</span>
        <span v-if="unreadCount > 0" class="nav-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span>
      </button>
      <button type="button" class="nav-item" :class="{ active: active === 'profile' }" @click="go('/profile')">
        <i class="ti ti-user" aria-hidden="true"></i>
        <span>บัญชี</span>
      </button>
      <button v-if="showAdmin" type="button" class="nav-item" :class="{ active: active === 'admin' }" @click="go('/admin')">
        <i class="ti ti-shield" aria-hidden="true"></i>
        <span>แอดมิน</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.app-nav {
  position: fixed;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--page-max-width);
  min-height: var(--bottom-nav-total);
  padding-bottom: var(--bottom-nav-safe);
  background: color-mix(in srgb, var(--color-surface-elevated) 92%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid var(--color-border);
  box-shadow: var(--shadow-nav);
  display: flex;
  z-index: var(--z-nav);
}
.nav-brand { display: none; }
.nav-items {
  display: flex;
  flex: 1;
  min-width: 0;
}
.nav-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: var(--text-label);
  font-weight: 500;
  color: var(--color-text-muted);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  transition: color var(--transition), background var(--transition);
  position: relative;
  min-height: var(--bottom-nav-height);
  padding: var(--space-1) var(--space-1) var(--space-2);
}
.nav-item i { font-size: 20px; line-height: 1; }
.nav-item span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nav-item.active {
  color: var(--color-primary);
  font-weight: 600;
  background: color-mix(in srgb, var(--color-primary-light) 65%, transparent);
  border-radius: var(--radius-md);
  margin: var(--space-1);
  padding-bottom: var(--space-1);
}
.nav-item.active i { transform: translateY(-1px); }
.nav-item:active:not(.active) { transform: scale(0.96); }
.nav-badge {
  position: absolute;
  top: 6px;
  left: calc(50% + 10px);
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: var(--radius-pill);
  background: var(--color-error);
  color: var(--color-on-primary);
  font-size: 10px;
  font-weight: 700;
  line-height: 16px;
  text-align: center;
  border: 2px solid var(--color-surface-elevated);
}
.nav-item:hover:not(.active) { color: var(--color-text-secondary); }

@media (min-width: 900px) {
  .app-nav {
    --sidebar-width: 240px;
    top: 0;
    bottom: 0;
    left: 0;
    right: auto;
    transform: none;
    width: var(--sidebar-width);
    max-width: none;
    height: 100svh;
    min-height: 100svh;
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-3) var(--space-4);
    border-top: none;
    border-right: 1px solid var(--color-border);
    box-shadow: var(--shadow-md);
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .nav-brand {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: 0 var(--space-2) var(--space-4);
    border-bottom: 1px solid var(--color-border);
  }
  .nav-brand :deep(.brand-logo) {
    max-width: 100%;
    max-height: 48px;
  }
  .nav-hotel {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .nav-items {
    flex-direction: column;
    flex: 1;
    gap: var(--space-1);
  }
  .nav-item {
    flex: 0 0 auto;
    flex-direction: row;
    justify-content: flex-start;
    gap: var(--space-3);
    width: 100%;
    min-height: 48px;
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-md);
    font-size: var(--text-sm);
  }
  .nav-item span { max-width: none; }
  .nav-item.active { margin: 0; padding: var(--space-2) var(--space-3); }
  .nav-item.active i { transform: none; }
  .nav-item:active:not(.active) { transform: none; }
  .nav-badge {
    top: 50%;
    left: auto;
    right: 10px;
    transform: translateY(-50%);
  }
}
</style>
