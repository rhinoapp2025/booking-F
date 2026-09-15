<script setup>
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from './stores/auth'
import { useHotelStore } from './stores/hotel'
import { useUiSettingsStore } from './stores/uiSettings'
import { useNetworkBrandingStore } from './stores/networkBranding'
import AppUpdateBanner from './components/AppUpdateBanner.vue'
import { useAppUpdate } from './composables/useAppUpdate'
import { syncBrowserTitle } from './utils/pageMeta'
import {
  initPushNotificationsWhenReady,
} from './utils/pushNotifications'

const route = useRoute()
const auth = useAuthStore()
const hotelStore = useHotelStore()
const uiSettings = useUiSettingsStore()
const networkBranding = useNetworkBrandingStore()
const isAdminRoute = computed(() => /\/admin(\/|$)/.test(route.path))
const hasAppNav = computed(() => !!route.meta.appNav)
const isLoginRoute = computed(() => /\/login$|\/auth\/callback$/.test(route.path))
const isNetworkSearch = computed(() => route.path === '/')
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
  () => (isNetworkSearch.value ? networkBranding.name : hotelStore.hotel?.name),
  (name) => syncBrowserTitle(name),
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

onMounted(() => {
  syncPushListener()
})

onUnmounted(() => {
  stopPushListener?.()
})

watch(() => auth.isLoggedIn, () => {
  syncPushListener()
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
