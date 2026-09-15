<script setup>
import { computed } from 'vue'
import { useHotelStore } from '../stores/hotel'
import BottomNav from '../components/BottomNav.vue'
import HotelLocationCard from '../components/HotelLocationCard.vue'

const hotelStore = useHotelStore()
const hotel = computed(() => hotelStore.hotel)

const lineHref = computed(() => {
  const raw = String(hotel.value?.line_url || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (raw.startsWith('@')) return `https://line.me/R/ti/p/${encodeURIComponent(raw)}`
  if (/^(line\.me|lin\.ee)\//i.test(raw)) return `https://${raw}`
  return raw
})
</script>

<template>
  <main class="hotel-info app-page">
    <header class="page-header">
      <h1 class="page-title">ที่ตั้ง</h1>
    </header>

    <div v-if="!hotel" class="state-card">
      <i class="ti ti-loader-2 state-card-icon" aria-hidden="true"></i>
      <p class="state-card-title">กำลังโหลด...</p>
    </div>

    <div v-else class="hotel-info-body">
      <HotelLocationCard />

      <section class="card hotel-info-card">
        <h2 class="hotel-info-name">{{ hotel.name }}</h2>

        <p v-if="hotel.description" class="hotel-info-description">{{ hotel.description }}</p>

        <dl class="hotel-info-dl">
          <template v-if="hotel.star_rating">
            <dt>ระดับ</dt>
            <dd>โรงแรม {{ hotel.star_rating }} ดาว</dd>
          </template>
          <template v-if="hotel.check_in_time">
            <dt>เช็คอิน</dt>
            <dd>{{ hotel.check_in_time }}</dd>
          </template>
          <template v-if="hotel.check_out_time">
            <dt>เช็คเอาต์</dt>
            <dd>{{ hotel.check_out_time }}</dd>
          </template>
          <template v-if="hotel.phone">
            <dt>โทรศัพท์</dt>
            <dd><a :href="`tel:${hotel.phone}`">{{ hotel.phone }}</a></dd>
          </template>
          <template v-if="hotel.email">
            <dt>อีเมล</dt>
            <dd><a :href="`mailto:${hotel.email}`">{{ hotel.email }}</a></dd>
          </template>
          <template v-if="lineHref">
            <dt>LINE</dt>
            <dd>
              <a class="line-link" :href="lineHref" target="_blank" rel="noopener noreferrer">
                ติดต่อทาง LINE
              </a>
            </dd>
          </template>
        </dl>
      </section>

      <section v-if="hotel.about_hotel" class="card hotel-about-card">
        <h2 class="hotel-about-title">เกี่ยวกับโรงแรม</h2>
        <p class="hotel-about-text">{{ hotel.about_hotel }}</p>
      </section>
    </div>

    <BottomNav active="info" />
  </main>
</template>

<style scoped>
.hotel-info {
  padding-bottom: calc(var(--bottom-nav-height, 64px) + var(--space-4));
}

.page-header {
  padding: var(--space-4) var(--page-padding-x);
}

.page-title {
  font-size: var(--text-h1);
  font-weight: 700;
  margin: 0;
}

.hotel-info-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  padding: 0 var(--page-padding-x);
}

.hotel-info > .state-card {
  margin: 0 var(--page-padding-x);
}

.hotel-info-card {
  padding: var(--space-5);
}

.hotel-info-name {
  font-size: var(--text-h1);
  font-weight: 700;
  margin: 0 0 var(--space-3);
  color: var(--color-text-primary);
}

.hotel-info-description {
  color: var(--color-text-secondary);
  margin: 0 0 var(--space-4);
  line-height: 1.6;
}

.hotel-info-dl {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: var(--space-2) var(--space-4);
}

.hotel-info-dl dt {
  color: var(--color-text-muted);
  font-size: var(--text-label);
  font-weight: 500;
}

.hotel-info-dl dd {
  margin: 0;
  color: var(--color-text-primary);
}

.line-link {
  color: var(--color-primary);
  font-weight: 600;
  text-decoration: none;
}

.line-link:hover {
  text-decoration: underline;
}

.hotel-about-card {
  padding: var(--space-5);
}

.hotel-about-title {
  font-size: var(--text-h3);
  font-weight: 700;
  margin: 0 0 var(--space-3);
  color: var(--color-text-primary);
}

.hotel-about-text {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: var(--text-sm);
  line-height: 1.7;
  white-space: pre-wrap;
}

@media (min-width: 900px) {
  .hotel-info {
    max-width: none;
    width: 100%;
    padding-bottom: var(--space-6);
  }
}
</style>
