<script setup>
import { computed } from 'vue'
import { useHotelStore } from '../stores/hotel'
import { locationTypeLabel } from '../constants/hotelLocationTypes'

const hotelStore = useHotelStore()
const hotel = computed(() => hotelStore.hotel)

const mapSrc = computed(() => {
  const h = hotel.value
  if (!h) return ''
  if (h.map_embed_url) return h.map_embed_url
  const q = [h.address, h.city, h.province].filter(Boolean).join(' ')
  if (!q) return ''
  return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&hl=th&z=16&output=embed`
})

const mapsLink = computed(() => hotel.value?.map_url || '')
const fullAddress = computed(() => {
  const h = hotel.value
  if (!h) return ''
  return [h.address, h.city, h.province, h.country].filter(Boolean).join(' ')
})

const locationLabel = computed(() => {
  const h = hotel.value
  if (!h) return ''
  return h.location_type_label || locationTypeLabel(h.location_type)
})

const visible = computed(() => Boolean(mapSrc.value || fullAddress.value || locationLabel.value))
</script>

<template>
  <section v-if="visible" class="card hotel-location-card">
    <h2 class="hotel-location-title">
      <i class="ti ti-map-pin" aria-hidden="true"></i>
      ที่ตั้งโรงแรม
    </h2>
    <p v-if="locationLabel" class="hotel-location-tag">{{ locationLabel }}</p>
    <p v-if="fullAddress" class="hotel-location-address">{{ fullAddress }}</p>
    <div v-if="mapSrc" class="hotel-location-embed">
      <iframe
        :src="mapSrc"
        title="แผนที่โรงแรม"
        width="100%"
        height="240"
        style="border:0"
        allowfullscreen
        loading="lazy"
        referrerpolicy="no-referrer-when-downgrade"
      ></iframe>
    </div>
    <a v-if="mapsLink" class="hotel-location-link" :href="mapsLink" target="_blank" rel="noopener">
      เปิดใน Google Maps
    </a>
  </section>
</template>

<style scoped>
.hotel-location-card {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.hotel-location-title {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-h3);
  font-weight: 700;
  margin: 0;
}

.hotel-location-tag {
  margin: 0;
  display: inline-flex;
  align-self: flex-start;
  padding: 4px var(--space-3);
  border-radius: var(--radius-pill);
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: var(--text-sm);
  font-weight: 600;
}

.hotel-location-address {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.hotel-location-embed {
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px solid var(--color-border);
}

.hotel-location-link {
  text-align: center;
  font-size: var(--text-sm);
  font-weight: 600;
}
</style>
