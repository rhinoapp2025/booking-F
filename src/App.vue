<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useHotelStore } from './stores/hotel'
import { useUiSettingsStore } from './stores/uiSettings'
import { useNetworkBrandingStore } from './stores/networkBranding'
import AppUpdateBanner from './components/AppUpdateBanner.vue'
import { useAppUpdate } from './composables/useAppUpdate'
import { applyPageMeta, tabTitle } from './utils/pageMeta'
import { logoIconVersion, syncHotelIcons } from './utils/hotelIcons'
import { apiMediaUrl } from './utils/resolveUiImageUrl'
import {
  initPushNotificationsWhenReady,
} from './utils/pushNotifications'

const route = useRoute()
const auth = useAuthStore()
const hotelStore = useHotelStore()
const uiSettings = useUiSettingsStore()
const networkBranding = useNetworkBrandingStore()
const isAdminRoute = computed(() => /\/admin(\/|$)/.test(route.path) && !route.meta.bookingSite)
const hasAppNav = computed(() => !!route.meta.appNav)
const isLoginRoute = computed(() => /\/login$|\/auth\/callback$/.test(route.path))
const isNetworkSearch = computed(() => route.path === '/')
const isBookingSiteRoute = computed(() => Boolean(route.meta.bookingSite))
const { updateAvailable, reload } = useAppUpdate()

let brandingReq = 0

async function applyThemeForRoute() {
  if (route.path !== '/') {
    if (hotelStore.hotel) uiSettings.applyFromHotel(hotelStore.hotel)
    else uiSettings.reset()
    return
  }
  uiSettings.applyFromNetwork(networkBranding.branding)
  const req = ++brandingReq
  await networkBranding.fetch()
  if (req !== brandingReq || route.path !== '/') return
  uiSettings.applyFromNetwork(networkBranding.branding)
}

watch(
  () => route.path,
  () => { applyThemeForRoute() },
  { immediate: true }
)

watch(
  () => hotelStore.hotel,
  () => {
    if (route.path === '/') return
    if (hotelStore.hotel) uiSettings.applyFromHotel(hotelStore.hotel)
    else uiSettings.reset()
  }
)

watch(
  () => [route.path, route.params.hotelSlug, hotelStore.hotel?.logo_url],
  () => {
    syncHotelIcons({
      hotelSlug: route.path === '/' ? '' : route.params.hotelSlug,
      iconVersion: logoIconVersion(hotelStore.hotel?.logo_url),
    })
  },
  { immediate: true },
)

watch(
  () => [
    route.path,
    hotelStore.hotel?.name,
    hotelStore.hotel?.slug,
    hotelStore.hotel?.logo_url,
    hotelStore.hotel?.description,
  ],
  () => {
    const icon = `${window.location.origin}/favicon.png`
    if (route.path === '/') {
      applyPageMeta({
        title: 'theotel',
        description: 'จองห้องพักออนไลน์กับ theotel',
        image: icon,
        url: window.location.href,
      })
      return
    }
    const hotel = hotelStore.hotel
    const routeSlug = String(route.params.hotelSlug || '').trim().toLowerCase()
    const loadedSlug = String(hotel?.slug || '').trim().toLowerCase()
    const name = routeSlug && loadedSlug === routeSlug ? String(hotel?.name || '').trim() : ''
    applyPageMeta({
      title: tabTitle(name, route.path),
      description: String(hotel?.description || '').trim() || (name ? `จองห้องพัก ${name}` : 'จองห้องพักออนไลน์กับ theotel'),
      image: apiMediaUrl(hotel?.logo_url) || icon,
      url: window.location.href,
    })
  },
  { immediate: true }
)

let stopPushListener = null

function syncPushListener() {
  stopPushListener?.()
  stopPushListener = null
  if (!auth.isLoggedIn) return
  initPushNotificationsWhenReady()
    .then((stop) => {
      if (typeof stop === 'function') stopPushListener = stop
    })
    .catch(() => {})
}

function syncBookingSiteScroll() {
  document.documentElement.classList.toggle('booking-site-open', isBookingSiteRoute.value)
}

onMounted(() => {
  syncPushListener()
  syncBookingSiteScroll()
})

onUnmounted(() => {
  stopPushListener?.()
  document.documentElement.classList.remove('booking-site-open')
})

watch(() => auth.isLoggedIn, () => {
  syncPushListener()
})

watch(isBookingSiteRoute, () => {
  syncBookingSiteScroll()
})
</script>

<template>
  <div
    class="app-shell"
    :class="{
      'app-shell--admin': isAdminRoute,
      'app-shell--nav': hasAppNav,
      'app-shell--login': isLoginRoute,
      'app-shell--search': isNetworkSearch,
      'app-shell--site': isBookingSiteRoute,
    }"
  >
    <AppUpdateBanner :visible="updateAvailable" @reload="reload" />
    <router-view />
  </div>
</template>

<style>
.app-shell {
  min-height: 100svh;
  max-width: var(--page-max-width);
  margin: 0 auto;
  background: var(--color-background);
  position: relative;
  isolation: isolate;
}

.app-shell--admin {
  max-width: min(1200px, 100%);
  width: 100%;
  overflow-x: clip;
  box-sizing: border-box;
  background: var(--color-background);
}

.app-shell--site {
  max-width: none;
  background: transparent;
}

.app-shell--login,
.app-shell--search {
  max-width: none;
  width: 100%;
  margin: 0;
  min-height: 100svh;
  background: var(--color-background);
}

@media (min-width: 431px) {
  body {
    background: var(--color-surface-muted);
  }
}

@media (min-width: 768px) {
  .app-shell--admin {
    padding: 0 var(--space-5);
  }
}

@media (min-width: 900px) {
  .app-shell--nav {
    --sidebar-width: 240px;
    max-width: none;
    width: 100%;
    margin: 0;
  }

  .app-shell--nav .app-update-banner {
    left: var(--sidebar-width);
    width: calc(100% - var(--sidebar-width));
  }

  .app-shell--admin.app-shell--nav {
    max-width: none;
    margin: 0;
    padding: 0;
  }
}
</style>
