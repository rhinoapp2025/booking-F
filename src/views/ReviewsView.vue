<script setup>
import { onMounted, ref, computed } from 'vue'
import Swal from 'sweetalert2'
import { useHotelRoute } from '../composables/useHotelRoute'
import { useAuthStore } from '../stores/auth'
import BottomNav from '../components/BottomNav.vue'
import AccountMenuDrawer from '../components/AccountMenuDrawer.vue'
import api from '../api/axios'

const { hotelSlug } = useHotelRoute()
const auth = useAuthStore()
const accountMenuRef = ref(null)

const reviews  = ref([])
const summary  = ref(null)
const loading  = ref(true)
const errorMsg = ref('')
const deletingId = ref('')

const isHotelAdmin = computed(() => auth.canAccessHotelAdmin(hotelSlug.value))

async function loadReviews() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [rReviews, rSummary] = await Promise.all([
      api.get(`/api/reviews/${hotelSlug.value}`),
      api.get(`/api/reviews/${hotelSlug.value}/summary`),
    ])
    reviews.value = rReviews.data
    summary.value = rSummary.data
  } catch (err) {
    errorMsg.value = 'โหลดรีวิวไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

function starCount(n) {
  return Array.from({ length: 5 }, (_, i) => i < n)
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function reviewImages(row) {
  const list = row?.images
  if (Array.isArray(list)) return list.filter(Boolean)
  return []
}

function reviewImageUrl(filename) {
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001').replace(/\/$/, '')
  return `${base}/api/reviews/${encodeURIComponent(hotelSlug.value)}/images/${encodeURIComponent(filename)}`
}

async function deleteReview(row) {
  if (!isHotelAdmin.value || deletingId.value) return
  const result = await Swal.fire({
    title: 'ลบรีวิวนี้?',
    text: row.guest_name ? `รีวิวของ ${row.guest_name}` : undefined,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#dc3545',
  })
  if (!result.isConfirmed) return

  deletingId.value = row.id
  try {
    await api.delete(`/api/admin/${hotelSlug.value}/reviews/${row.id}`)
    await loadReviews()
    await Swal.fire({ title: 'ลบแล้ว', icon: 'success', timer: 1200, showConfirmButton: false })
  } catch (err) {
    Swal.fire({
      title: 'ลบไม่สำเร็จ',
      text: err?.response?.data?.error || 'เกิดข้อผิดพลาด',
      icon: 'error',
    })
  } finally {
    deletingId.value = ''
  }
}

onMounted(loadReviews)
</script>

<template>
  <div class="reviews-page app-page">
    <AccountMenuDrawer ref="accountMenuRef" />

    <header class="page-header">
      <h1 class="page-title">รีวิว</h1>
      <button class="icon-btn" @click="accountMenuRef?.open()">
        <i class="ti ti-user-circle"></i>
      </button>
    </header>

    <div v-if="loading" class="state-card">
      <i class="ti ti-loader-2 state-card-icon spin"></i>
    </div>

    <template v-else-if="!errorMsg">
      <!-- Summary -->
      <section v-if="summary" class="card review-summary">
        <div class="summary-rating">
          <span class="rating-big">{{ summary.avg_rating || '-' }}</span>
          <div class="rating-stars" aria-hidden="true">
            <span
              v-for="(filled, i) in starCount(Math.round(summary.avg_rating))"
              :key="i"
              class="star-glyph"
              :class="{ on: filled }"
            >★</span>
          </div>
          <span class="review-count">{{ summary.total }} รีวิว</span>
        </div>
        <div v-if="summary.total > 0" class="sub-ratings">
          <div class="sub-row"><span>ความสะอาด</span><span>{{ summary.avg_cleanliness || '-' }}</span></div>
          <div class="sub-row"><span>การบริการ</span><span>{{ summary.avg_service || '-' }}</span></div>
          <div class="sub-row"><span>ทำเล</span><span>{{ summary.avg_location || '-' }}</span></div>
        </div>
      </section>

      <!-- Reviews list -->
      <div v-if="reviews.length" class="review-list">
        <div v-for="r in reviews" :key="r.id" class="card review-card">
          <div class="review-header">
            <div class="reviewer-info">
              <div class="reviewer-avatar">{{ r.guest_name?.[0] || '?' }}</div>
              <div>
                <p class="reviewer-name">{{ r.guest_name }}</p>
                <p class="review-date muted">{{ formatDate(r.created_at) }}</p>
              </div>
            </div>
            <div class="review-header-right">
              <div class="review-stars" aria-hidden="true">
                <span
                  v-for="(f, i) in starCount(r.rating)"
                  :key="i"
                  class="star-glyph"
                  :class="{ on: f }"
                >★</span>
              </div>
              <button
                v-if="isHotelAdmin"
                type="button"
                class="btn btn-outline-danger btn-sm review-delete-btn"
                :disabled="deletingId === r.id"
                @click="deleteReview(r)"
              >
                {{ deletingId === r.id ? 'กำลังลบ...' : 'ลบ' }}
              </button>
            </div>
          </div>
          <p v-if="r.comment" class="review-comment">{{ r.comment }}</p>
          <div v-if="reviewImages(r).length" class="review-photos">
            <img
              v-for="name in reviewImages(r)"
              :key="name"
              :src="reviewImageUrl(name)"
              alt="รูปรีวิว"
              class="review-photo"
              loading="lazy"
            />
          </div>
        </div>
      </div>

      <div v-else class="state-card">
        <i class="ti ti-star state-card-icon"></i>
        <p class="state-card-title">ยังไม่มีรีวิว</p>
      </div>
    </template>

    <div v-else class="state-card">
      <i class="ti ti-alert-circle state-card-icon"></i>
      <p class="state-card-title">{{ errorMsg }}</p>
    </div>

    <BottomNav active="reviews" />
  </div>
</template>

<style scoped>
.reviews-page { padding-bottom: calc(var(--bottom-nav-height, 64px) + var(--space-4)); }
.page-header  { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--page-padding-x); }
.page-title   { font-size: var(--text-h1); font-weight: 700; margin: 0; }
.review-summary { margin: 0 var(--page-padding-x) var(--space-4); padding: var(--space-4); }
.summary-rating { display: flex; align-items: center; gap: var(--space-3); }
.rating-big { font-size: 3rem; font-weight: 800; color: var(--color-primary); line-height: 1; }
.rating-stars { display: flex; gap: 2px; font-size: 22px; line-height: 1; }
.review-count { font-size: var(--text-sm); color: var(--color-text-muted); }
.sub-ratings { margin-top: var(--space-3); display: flex; flex-direction: column; gap: var(--space-1); }
.sub-row { display: flex; justify-content: space-between; font-size: var(--text-sm); color: var(--color-text-secondary); }
.review-list { padding: 0 var(--page-padding-x); display: flex; flex-direction: column; gap: var(--space-3); }
.review-card { padding: var(--space-4); }
.review-header { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-2); }
.review-header-right { display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-2); flex-shrink: 0; }
.reviewer-info { display: flex; align-items: center; gap: var(--space-2); min-width: 0; }
.reviewer-avatar { width: 36px; height: 36px; border-radius: 50%; background: var(--color-accent-light); color: var(--color-accent); display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; }
.reviewer-name { font-weight: 600; margin: 0; font-size: var(--text-sm); }
.review-date { font-size: var(--text-label); margin: 0; }
.review-stars { display: flex; gap: 1px; font-size: 16px; line-height: 1; }
.star-glyph { color: #cfc8c2; }
.star-glyph.on { color: #d97706; }
.review-delete-btn { white-space: nowrap; }
.review-comment { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.5; white-space: pre-wrap; }
.review-photos { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); }
.review-photo {
  width: 96px;
  height: 96px;
  object-fit: cover;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
}
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
