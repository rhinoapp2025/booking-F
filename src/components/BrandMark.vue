<script setup>
import { computed } from 'vue'
import { useUiSettingsStore } from '../stores/uiSettings'
import { useHotelStore } from '../stores/hotel'
import { apiMediaUrl } from '../utils/resolveUiImageUrl'

defineProps({
  showSparkle: { type: Boolean, default: false },
})

const ui = useUiSettingsStore()
const hotelStore = useHotelStore()
const brandMain = computed(() => hotelStore.hotel?.name || ui.brandMain)
const brandAccent = computed(() => ui.brandAccent)
const brandLabel = computed(() => {
  const main = brandMain.value || ''
  const accent = brandAccent.value || ''
  return accent ? `${main}${accent}` : main
})
const logoUrl = computed(() => apiMediaUrl(hotelStore.hotel?.logo_url || ui.logoUrl))
</script>

<template>
  <div class="brand" :title="brandLabel">
    <img v-if="logoUrl" :src="logoUrl" class="brand-logo" :alt="brandLabel" />
    <span v-else class="brand-text">
      {{ brandMain }}<span v-if="brandAccent" class="brand-accent">{{ brandAccent }}</span>
      <i v-if="showSparkle" class="ti ti-sparkles brand-icon-sm" aria-hidden="true"></i>
    </span>
  </div>
</template>

<style scoped>
.brand {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
}

.brand-logo {
  display: block;
  max-width: 180px;
  max-height: 64px;
  width: auto;
  height: auto;
  object-fit: contain;
}

.brand-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-h3);
  font-weight: 600;
  color: var(--color-text-primary);
  letter-spacing: -0.3px;
  line-height: 1.2;
}

.brand-accent {
  color: var(--color-primary);
}

.brand-icon-sm {
  display: inline;
  font-size: 16px;
  color: var(--color-primary);
  vertical-align: -2px;
}
</style>
