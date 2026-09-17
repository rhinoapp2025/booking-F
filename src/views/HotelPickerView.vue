<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Swal from 'sweetalert2'
import { useAuthStore } from '../stores/auth'
import { useHotelStore } from '../stores/hotel'
import { useBookingStore } from '../stores/booking'
import { useNetworkBrandingStore } from '../stores/networkBranding'
import AccountMenuDrawer from '../components/AccountMenuDrawer.vue'
import BookingPolicyNotes from '../components/BookingPolicyNotes.vue'
import ReviewFormModal from '../components/ReviewFormModal.vue'
import { apiMediaUrl } from '../utils/resolveUiImageUrl'
import api from '../api/axios'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const hotelStore = useHotelStore()
const bookingStore = useBookingStore()
const networkBranding = useNetworkBrandingStore()
const accountMenuRef = ref(null)
const searchFormRef = ref(null)
const formInView = ref(true)
const tab = ref('search')
let formObserver = null

function localYmd(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days)
  return localYmd(dt)
}

const today = localYmd()
const checkIn = ref(today)
const checkOut = ref(addDaysYmd(today, 1))
const numAdults = ref(1)
const numChildren = ref(0)
const province = ref('')
const provinces = ref([])
const searching = ref(false)
const searched = ref(false)
const errorMsg = ref('')
const hotels = ref([])

const nights = computed(() => {
  if (!checkIn.value || !checkOut.value) return 0
  return Math.round((new Date(checkOut.value) - new Date(checkIn.value)) / 86400000)
})
const minCheckOut = computed(() => addDaysYmd(checkIn.value || today, 1))
const showSearchSticky = computed(() => tab.value === 'search' && searched.value && !formInView.value)

watch(checkIn, (value) => {
  if (checkOut.value && checkOut.value <= value) checkOut.value = addDaysYmd(value, 1)
})

const searchReady = ref(false)
watch(province, () => {
  if (!searchReady.value) return
  searchHotels()
})

function stayQuery(extra = {}) {
  const q = {
    checkIn: checkIn.value,
    checkOut: checkOut.value,
    adults: String(numAdults.value),
    children: String(numChildren.value),
    ...extra,
  }
  if (province.value) q.province = province.value
  else delete q.province
  return q
}

function stayReturnPath(extra = {}) {
  const q = new URLSearchParams(stayQuery(extra))
  return `/?${q.toString()}`
}

function hotelBookingsPath(slug) {
  const q = new URLSearchParams(stayQuery())
  return `/${slug}/bookings?${q.toString()}`
}

function loginSlug(preferred) {
  return preferred
    || hotels.value.find((h) => h.slug)?.slug
    || localStorage.getItem('hotelSlug')
    || 'default'
}

function applyQueryFromRoute() {
  const q = route.query
  const qIn = String(q.checkIn || q.check_in || '').slice(0, 10)
  const qOut = String(q.checkOut || q.check_out || '').slice(0, 10)
  const qAdults = parseInt(q.adults, 10)
  const qChildren = parseInt(q.children, 10)
  if (qIn && qIn >= today) checkIn.value = qIn
  if (qOut && qOut > checkIn.value) checkOut.value = qOut
  if (Number.isFinite(qAdults) && qAdults >= 1) numAdults.value = qAdults
  if (Number.isFinite(qChildren) && qChildren >= 0) numChildren.value = qChildren
  const qProvince = String(q.province || '').trim()
  if (qProvince) province.value = qProvince
  if (String(q.tab || '') === 'my') tab.value = 'my'
}

function locationOf(hotel) {
  return [hotel.city, hotel.province].filter(Boolean).join(' · ')
    || hotel.address
    || ''
}

function coverUrl(hotel) {
  return apiMediaUrl(hotel.login_image_url || hotel.cover_image || '')
}

function hotelSearchBanner(hotel) {
  if (!hotel) return ''
  return apiMediaUrl(hotel.banner_url || hotel.login_image_url || '')
}

const searchHeroUrl = computed(() => {
  if (networkBranding.heroUrl) return networkBranding.heroUrl
  const fromStore = hotelSearchBanner(hotelStore.hotel)
  if (fromStore) return fromStore
  const fromList = hotels.value.find((h) => h.banner_url || h.login_image_url)
  return hotelSearchBanner(fromList)
})

function formatDateShort(dateStr) {
  if (!dateStr) return ''
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function isFullPayment(booking) {
  if (!booking) return false
  const total = Number(booking.total_price) || 0
  const due = Number(booking.deposit_amount) || 0
  return total > 0 && due >= total
}

function canCancelBooking(booking) {
  return ['awaiting_payment', 'pending'].includes(booking.status)
}

function canReviewBooking(booking) {
  return booking?.status === 'checked_out' && !booking?.has_review && booking?.hotel_slug
}

const reviewBooking = ref(null)

function openReview(booking) {
  reviewBooking.value = booking
}

async function onReviewSubmitted() {
  reviewBooking.value = null
  await bookingStore.fetchAllMyBookings()
  await Swal.fire({ title: 'ขอบคุณสำหรับรีวิว', icon: 'success', timer: 1500, showConfirmButton: false })
}

function statusLabel(status, booking) {
  if (status === 'awaiting_payment') {
    return isFullPayment(booking) ? 'รอชำระเต็มจำนวน' : 'รอชำระมัดจำ'
  }
  const map = {
    pending: 'รอยืนยัน',
    confirmed: 'ยืนยันแล้ว',
    checked_in: 'เช็คอินแล้ว',
    checked_out: 'เช็คเอาต์แล้ว',
    cancelled: 'ยกเลิกแล้ว',
    no_show: 'ไม่มาตามกำหนด',
  }
  return map[status] || status
}

function bindFormObserver() {
  formObserver?.disconnect()
  formObserver = null
  if (!searchFormRef.value) return
  formObserver = new IntersectionObserver(
    ([entry]) => {
      formInView.value = entry.isIntersecting
    },
    { threshold: 0, rootMargin: '-12px 0px 0px 0px' },
  )
  formObserver.observe(searchFormRef.value)
}

function scrollToSearchForm() {
  searchFormRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function goLogin(redirectPath, hotelSlug) {
  const slug = loginSlug(hotelSlug)
  hotelStore.setSlug(slug)
  await router.push({
    path: `/${slug}/login`,
    query: { redirect: redirectPath },
  })
}

async function promptLogin(redirectPath, hotelSlug) {
  const result = await Swal.fire({
    title: 'ยังไม่ได้เข้าสู่ระบบ',
    text: 'กรุณาเข้าสู่ระบบก่อนจอง แล้วจะไปหน้าจองของสาขานี้ต่อ',
    icon: 'info',
    confirmButtonText: 'เข้าสู่ระบบ',
    showCancelButton: true,
    cancelButtonText: 'ยกเลิก',
  })
  if (!result.isConfirmed) return false
  await goLogin(redirectPath, hotelSlug)
  return true
}

async function searchHotels() {
  errorMsg.value = ''
  if (!checkIn.value || !checkOut.value) {
    errorMsg.value = 'กรุณาเลือกวันเช็คอินและเช็คเอาต์'
    return
  }
  if (checkOut.value <= checkIn.value) {
    errorMsg.value = 'วันเช็คเอาต์ต้องหลังวันเช็คอิน'
    return
  }
  searching.value = true
  searched.value = false
  try {
    await router.replace({
      path: '/',
      query: stayQuery(tab.value === 'my' ? { tab: 'my' } : {}),
    })
    const { data } = await api.get('/api/hotels/search', {
      params: {
        checkIn: checkIn.value,
        checkOut: checkOut.value,
        adults: numAdults.value,
        children: numChildren.value,
        ...(province.value ? { province: province.value } : {}),
      },
    })
    hotels.value = data?.hotels || []
    if (Array.isArray(data?.provinces)) provinces.value = data.provinces
    searched.value = true
    if (!hotels.value.length) {
      errorMsg.value = province.value ? 'ไม่พบโรงแรมในจังหวัดนี้' : 'ยังไม่มีโรงแรมในเครือ'
    }
  } catch (err) {
    hotels.value = []
    errorMsg.value = err?.response?.data?.error || 'ค้นหาไม่สำเร็จ'
  } finally {
    searching.value = false
    await nextTick()
    bindFormObserver()
  }
}

async function bookHotel(hotel) {
  if (!hotel.available) return
  if (!auth.isLoggedIn) {
    await promptLogin(hotelBookingsPath(hotel.slug), hotel.slug)
    return
  }
  hotelStore.setSlug(hotel.slug)
  router.push({
    path: `/${hotel.slug}/bookings`,
    query: stayQuery(),
  })
}

async function onAccountClick() {
  if (auth.isLoggedIn) {
    accountMenuRef.value?.open()
    return
  }
  await promptLogin(stayReturnPath(tab.value === 'my' ? { tab: 'my' } : {}))
}

async function openSearchTab() {
  tab.value = 'search'
  await router.replace({ path: '/', query: stayQuery() })
  await nextTick()
  bindFormObserver()
}

async function openMyBookings() {
  tab.value = 'my'
  await router.replace({ path: '/', query: stayQuery({ tab: 'my' }) })
  if (!auth.isLoggedIn) return
  try {
    await bookingStore.fetchAllMyBookings()
  } catch {
    // error อยู่ใน bookingStore.error
  }
}

async function cancelBooking(booking) {
  const result = await Swal.fire({
    title: 'ยืนยันยกเลิกการจอง?',
    text: `${booking.hotel_name || ''} · เช็คอิน ${booking.check_in_date} → ${booking.check_out_date}`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ยกเลิกการจอง',
    cancelButtonText: 'ไม่ยกเลิก',
  })
  if (!result.isConfirmed) return
  try {
    await bookingStore.cancelBooking(booking.hotel_slug, booking.id)
    await bookingStore.fetchAllMyBookings()
    await Swal.fire({ title: 'ยกเลิกแล้ว', icon: 'success', timer: 1500, showConfirmButton: false })
  } catch {
    Swal.fire({ title: 'เกิดข้อผิดพลาด', text: bookingStore.error, icon: 'error' })
  }
}

onMounted(async () => {
  applyQueryFromRoute()
  networkBranding.fetch()
  await searchHotels()
  searchReady.value = true
  if (tab.value === 'my' && auth.isLoggedIn) {
    try {
      await bookingStore.fetchAllMyBookings()
    } catch {
      // error อยู่ใน bookingStore.error
    }
  }
})

onUnmounted(() => {
  formObserver?.disconnect()
  formObserver = null
})
</script>

<template>
  <div class="network-home app-page">
    <AccountMenuDrawer ref="accountMenuRef" />

    <section
      class="network-hero"
      :class="{ 'has-photo': Boolean(searchHeroUrl), 'is-my': tab === 'my' }"
    >
      <div class="network-hero-media" aria-hidden="true">
        <img v-if="searchHeroUrl" :src="searchHeroUrl" alt="" />
      </div>

      <header class="network-hero-bar">
        <div class="network-hero-brand">
          <img
            v-if="networkBranding.logoUrl"
            :src="networkBranding.logoUrl"
            class="network-hero-logo"
            :alt="networkBranding.name"
          />
        </div>
        <button class="icon-btn network-hero-account" type="button" aria-label="บัญชี" @click="onAccountClick">
          <i class="ti ti-user-circle"></i>
        </button>
      </header>

      <div class="network-hero-inner">
        <h1 class="network-hero-title">{{ networkBranding.name }}</h1>
        <div class="network-tabs" role="tablist" aria-label="หน้ารวม">
          <button
            type="button"
            class="network-tab"
            :class="{ active: tab === 'search' }"
            role="tab"
            :aria-selected="tab === 'search'"
            @click="openSearchTab"
          >
            ค้นหาโรงแรม
          </button>
          <button
            type="button"
            class="network-tab"
            :class="{ active: tab === 'my' }"
            role="tab"
            :aria-selected="tab === 'my'"
            @click="openMyBookings"
          >
            การจองของฉัน
          </button>
        </div>

        <div v-if="tab === 'search'" ref="searchFormRef" class="network-search-card">
          <div class="form-row search-province">
            <label class="form-label">จังหวัด</label>
            <select v-model="province" class="form-input">
              <option value="">ทุกจังหวัด</option>
              <option v-if="province && !provinces.includes(province)" :value="province">{{ province }}</option>
              <option v-for="name in provinces" :key="name" :value="name">{{ name }}</option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-label">เช็คอิน</label>
            <input v-model="checkIn" type="date" class="form-input" :min="today" />
          </div>
          <div class="form-row">
            <label class="form-label">เช็คเอาต์</label>
            <input v-model="checkOut" type="date" class="form-input" :min="minCheckOut" />
          </div>
          <div class="form-row-inline">
            <div class="form-row">
              <label class="form-label">ผู้ใหญ่</label>
              <input v-model.number="numAdults" type="number" class="form-input" min="1" max="10" />
            </div>
            <div class="form-row">
              <label class="form-label">เด็ก</label>
              <input v-model.number="numChildren" type="number" class="form-input" min="0" max="10" />
            </div>
          </div>
          <p v-if="nights > 0" class="nights-label">{{ nights }} คืน</p>
          <button type="button" class="btn btn-primary network-search-btn" :disabled="searching" @click="searchHotels">
            <i class="ti ti-search"></i>
            {{ searching ? 'กำลังค้นหา...' : 'ค้นหา' }}
          </button>
        </div>
      </div>
    </section>

    <button
      v-show="showSearchSticky"
      type="button"
      class="search-sticky"
      aria-label="เลื่อนไปแก้วันที่เช็คอิน เช็คเอาต์"
      @click="scrollToSearchForm"
    >
      <span class="search-sticky-line">
        <i class="ti ti-calendar" aria-hidden="true"></i>
        <span class="search-sticky-text">
          {{ formatDateShort(checkIn) }} → {{ formatDateShort(checkOut) }}
          <template v-if="province"> · {{ province }}</template>
          · ผู้ใหญ่ {{ numAdults }} · เด็ก {{ numChildren }}
          <template v-if="nights > 0"> · {{ nights }} คืน</template>
        </span>
      </span>
      <i class="ti ti-chevron-up search-sticky-edit" aria-hidden="true"></i>
    </button>

    <section v-if="tab === 'search'" class="network-body">
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

      <div v-if="searching && !searched" class="state-card">
        <i class="ti ti-loader-2 state-card-icon spin" aria-hidden="true"></i>
        <p class="state-card-title">กำลังค้นหาโรงแรม...</p>
      </div>

      <div v-else-if="searched && hotels.length" class="room-list">
        <article
          v-for="hotel in hotels"
          :key="hotel.id"
          class="card room-card"
          :class="{ 'is-unavailable': !hotel.available }"
        >
          <div class="room-photo">
            <img v-if="coverUrl(hotel)" :src="coverUrl(hotel)" :alt="hotel.name" />
            <div v-else class="room-photo-fallback" aria-hidden="true">
              <i class="ti ti-building"></i>
            </div>
            <span v-if="hotel.available && hotel.available_types" class="room-photo-count">
              เหลือ {{ hotel.available_types }} ประเภท
            </span>
          </div>
          <div class="room-body">
            <div class="room-header">
              <h3 class="room-name">{{ hotel.name }}</h3>
              <span v-if="hotel.star_rating" class="room-badge">โรงแรม {{ hotel.star_rating }} ดาว</span>
            </div>
            <p v-if="locationOf(hotel)" class="room-desc">
              <i class="ti ti-map-pin" aria-hidden="true"></i>
              {{ locationOf(hotel) }}
            </p>
            <p v-else-if="hotel.description" class="room-desc">{{ hotel.description }}</p>
            <div v-if="hotel.from_room_type" class="room-details">
              <span>{{ hotel.from_room_type }}</span>
            </div>
            <div class="room-footer">
              <template v-if="hotel.available">
                <div class="room-price" :class="{ 'has-promo': hotel.from_discount_percent }">
                  <template v-if="hotel.from_discount_percent && hotel.from_display_price">
                    <div class="price-promo-top">
                      <span class="price-was">฿{{ Number(hotel.from_display_price).toLocaleString() }}</span>
                      <span class="price-off">-{{ Number(hotel.from_discount_percent) }}%</span>
                    </div>
                    <div class="price-promo-now">
                      <span class="price-currency">฿</span>
                      <span class="price-amount promo">{{ Number(hotel.from_price).toLocaleString() }}</span>
                      <span class="price-unit">/ คืน</span>
                    </div>
                  </template>
                  <template v-else>
                    <span class="price-amount">฿{{ Number(hotel.from_price).toLocaleString() }}</span>
                    <span class="price-unit">/ คืน</span>
                  </template>
                </div>
                <div v-if="nights > 1" class="room-total">
                  เริ่มต้น ฿{{ (Number(hotel.from_price) * nights).toLocaleString() }} / {{ nights }} คืน
                </div>
              </template>
              <p v-else class="muted no-room">ไม่มีห้องว่างตามวันที่เลือก</p>
            </div>
            <button
              type="button"
              class="btn btn-primary room-btn"
              :disabled="!hotel.available"
              @click="bookHotel(hotel)"
            >
              จอง
            </button>
          </div>
        </article>
      </div>

      <div v-else-if="searched && !hotels.length && !errorMsg" class="state-card">
        <i class="ti ti-building-off state-card-icon"></i>
        <p class="state-card-title">ไม่พบโรงแรม</p>
        <p class="state-card-sub">{{ province ? 'ลองเลือกจังหวัดอื่น หรือเปลี่ยนวัน' : 'ลองเปลี่ยนวันหรือจำนวนแขก' }}</p>
      </div>
    </section>

    <section v-else class="network-body">
      <div v-if="!auth.isLoggedIn" class="state-card">
        <i class="ti ti-lock state-card-icon"></i>
        <p class="state-card-title">กรุณาเข้าสู่ระบบ</p>
        <button class="btn btn-primary" type="button" @click="goLogin(stayReturnPath({ tab: 'my' }))">เข้าสู่ระบบ</button>
      </div>
      <div v-else-if="bookingStore.loading" class="state-card">
        <i class="ti ti-loader-2 state-card-icon spin"></i>
        <p class="state-card-title">กำลังโหลด...</p>
      </div>
      <div v-else-if="bookingStore.error" class="state-card">
        <i class="ti ti-alert-circle state-card-icon"></i>
        <p class="state-card-title">{{ bookingStore.error }}</p>
      </div>
      <div v-else-if="!bookingStore.myBookings.length" class="state-card">
        <i class="ti ti-calendar-off state-card-icon"></i>
        <p class="state-card-title">ยังไม่มีการจอง</p>
      </div>
      <div v-else class="my-booking-list">
        <article v-for="booking in bookingStore.myBookings" :key="booking.id" class="card my-booking-card">
          <div class="booking-header">
            <span :class="['booking-status', `status-${booking.status}`]">{{ statusLabel(booking.status, booking) }}</span>
            <span class="booking-id">#{{ booking.id.slice(0, 8) }}</span>
          </div>
          <p v-if="booking.hotel_name" class="booking-hotel">{{ booking.hotel_name }}</p>
          <div class="booking-dates">
            <span>{{ formatDate(booking.check_in_date) }}</span>
            <i class="ti ti-arrow-right"></i>
            <span>{{ formatDate(booking.check_out_date) }}</span>
          </div>
          <div v-if="booking.rooms?.length" class="booking-rooms">
            <span v-for="r in booking.rooms" :key="r.room_id || r.room_type_name" class="room-tag">
              {{ r.room_type_name }}<template v-if="r.room_number"> ห้อง {{ r.room_number }}</template>
            </span>
          </div>
          <div class="booking-price">
            ฿{{ Number(booking.total_price).toLocaleString() }}
            <span class="muted">
              · {{ isFullPayment(booking) ? 'ชำระเต็มจำนวน' : 'มัดจำ' }}
              ฿{{ Number(booking.deposit_amount).toLocaleString() }}
            </span>
          </div>
          <p v-if="booking.rate_plan_name" class="muted">เรทแพลน {{ booking.rate_plan_name }}</p>
          <p v-if="booking.include_breakfast" class="muted">อาหารเช้า {{ booking.breakfast_count }} คน</p>
          <div v-if="booking.pms_ota_booking_no" class="stay-code">
            <p class="stay-code-label">เลขจองสำหรับเข้าพัก</p>
            <p class="stay-code-value">{{ booking.pms_ota_booking_no }}</p>
            <p class="stay-code-hint">แสดงเลขนี้ตอนเช็คอินที่โรงแรม</p>
          </div>
          <p v-if="booking.status === 'cancelled' && booking.cancelled_reason" class="muted">
            {{ booking.cancelled_reason }}
          </p>
          <BookingPolicyNotes
            :cancellation-policy="booking.cancellation_policy"
            :non-smoking="Boolean(booking.non_smoking)"
            :non-smoking-fine="booking.non_smoking_fine"
          />
          <div class="booking-actions">
            <button
              v-if="booking.status === 'awaiting_payment' && booking.hotel_slug"
              class="btn btn-primary btn-sm"
              type="button"
              @click="router.push(`/${booking.hotel_slug}/payment/${booking.id}`)"
            >
              {{ isFullPayment(booking) ? 'ชำระเงิน' : 'ชำระมัดจำ' }}
            </button>
            <button
              v-if="canReviewBooking(booking)"
              class="btn btn-primary btn-sm"
              type="button"
              @click="openReview(booking)"
            >
              รีวิว
            </button>
            <button
              v-if="canCancelBooking(booking)"
              class="btn btn-outline-danger btn-sm"
              type="button"
              @click="cancelBooking(booking)"
            >
              ยกเลิก
            </button>
          </div>
        </article>
      </div>
    </section>

    <ReviewFormModal
      :open="Boolean(reviewBooking)"
      :hotel-slug="reviewBooking?.hotel_slug || 'default'"
      :booking="reviewBooking"
      @close="reviewBooking = null"
      @submitted="onReviewSubmitted"
    />
  </div>
</template>

<style scoped>
.network-home {
  max-width: none;
  width: 100%;
  margin: 0;
  background: #fff;
  overflow-x: clip;
  padding-bottom: max(var(--space-6), env(safe-area-inset-bottom, 0px));
}
.network-hero {
  position: relative;
  padding-bottom: 28px;
}
.network-hero.has-photo { padding-bottom: 52px; }
.network-hero.is-my { padding-bottom: 20px; }
.network-hero-media {
  position: absolute;
  inset: 0 0 48px 0;
  overflow: hidden;
  border-radius: 0 0 36px 36px;
  background: linear-gradient(160deg, #0b3a5b 0%, #1a6a8a 45%, #4aa3b8 100%);
}
.network-hero.is-my .network-hero-media { inset: 0; }
.network-hero-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  max-width: none;
}
.network-hero-media::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(to bottom, rgba(0, 13, 26, 0.28) 0%, rgba(0, 13, 26, 0.08) 42%, rgba(255, 255, 255, 0) 72%);
  pointer-events: none;
}
.network-hero-bar {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: calc(env(safe-area-inset-top, 0px) + var(--space-3)) var(--page-padding-x) 0;
}
.network-hero-brand { min-width: 0; }
.network-hero-logo {
  height: 36px;
  width: auto;
  max-width: 120px;
  object-fit: contain;
  display: block;
  filter: drop-shadow(0 1px 6px rgba(0, 0, 0, 0.35));
}
.network-hero-account {
  background: rgba(255, 255, 255, 0.94);
  box-shadow: var(--shadow-sm);
}
.network-hero-inner {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--space-5) var(--page-padding-x) 0;
}
.network-hero-title {
  margin: 0 0 var(--space-4);
  color: #fff;
  text-align: center;
  font-size: clamp(22px, 5vw, 34px);
  font-weight: 700;
  line-height: 1.25;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.35);
  max-width: 16em;
}
.network-tabs {
  display: flex;
  gap: 4px;
  width: min(420px, 100%);
  padding: 4px;
  margin: 0 0 var(--space-4);
  background: #fff;
  border-radius: var(--radius-pill);
  box-shadow: var(--shadow-md);
}
.network-tab {
  flex: 1;
  border: none;
  background: transparent;
  min-height: 40px;
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-pill);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--color-text-secondary);
  cursor: pointer;
}
.network-tab.active {
  background: var(--color-primary);
  color: #fff;
}
.network-search-card {
  position: relative;
  width: min(920px, 100%);
  background: #fff;
  border-radius: 24px;
  padding: var(--space-4) var(--space-4) 36px;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  box-shadow: 0 12px 40px rgba(0, 21, 41, 0.14);
}
.network-search-btn {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translate(-50%, 50%);
  width: auto;
  min-width: 168px;
  border-radius: var(--radius-pill);
  box-shadow: 0 8px 20px color-mix(in srgb, var(--color-primary) 35%, transparent);
}
.network-body {
  width: min(1120px, 100%);
  margin: 0 auto;
  padding: 36px var(--page-padding-x) 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  box-sizing: border-box;
}
.form-row { display: flex; flex-direction: column; gap: var(--space-1); }
.form-row-inline { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.form-label { font-size: var(--text-label); font-weight: 500; color: var(--color-text-secondary); }
.form-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 16px;
  background: var(--color-surface);
  box-sizing: border-box;
  min-height: var(--touch-min);
}
.nights-label { font-size: var(--text-sm); color: var(--color-text-muted); text-align: center; margin: 0; }
.search-sticky {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  z-index: var(--z-sticky);
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-height: 48px;
  padding: calc(env(safe-area-inset-top, 0px) + var(--space-2)) var(--page-padding-x) var(--space-2);
  border: none;
  border-bottom: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface-elevated) 92%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: var(--shadow-md);
  color: var(--color-text-primary);
  font-family: inherit;
  cursor: pointer;
  box-sizing: border-box;
}
.search-sticky-line {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  flex: 1;
  overflow: hidden;
}
.search-sticky-line i { flex-shrink: 0; font-size: 18px; color: var(--color-primary); }
.search-sticky-text {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: var(--text-sm);
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
}
.search-sticky-edit { flex-shrink: 0; font-size: 18px; color: var(--color-text-muted); }
.room-list { display: flex; flex-direction: column; gap: var(--space-3); }
.room-card { padding: 0; overflow: hidden; display: flex; flex-direction: column; height: 100%; }
.room-photo { position: relative; height: 180px; background: var(--color-surface-muted); flex-shrink: 0; }
.room-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
.room-photo-fallback {
  width: 100%;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--color-text-muted);
  font-size: 40px;
}
.room-photo-count {
  position: absolute;
  left: var(--space-3);
  bottom: var(--space-3);
  background: rgba(0,0,0,.65);
  color: #fff;
  font-size: var(--text-label);
  font-weight: 600;
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}
.room-body { padding: var(--space-4); display: flex; flex-direction: column; flex: 1; min-height: 0; }
.room-header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
.room-name { font-weight: 700; font-size: var(--text-h3); margin: 0; min-width: 0; }
.room-badge { font-size: var(--text-label); padding: 2px var(--space-2); border-radius: var(--radius-pill); background: var(--color-accent-light); color: var(--color-accent); white-space: nowrap; margin-left: auto; }
.room-desc { color: var(--color-text-secondary); font-size: var(--text-sm); margin: 0 0 var(--space-2); display: flex; align-items: flex-start; gap: 4px; }
.room-details { display: flex; gap: var(--space-3); font-size: var(--text-sm); color: var(--color-text-muted); margin-bottom: var(--space-3); }
.room-footer { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-3); }
.price-amount { font-size: var(--text-h2); font-weight: 700; color: var(--color-primary); }
.price-unit { font-size: var(--text-sm); color: var(--color-text-muted); }
.room-price.has-promo { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; }
.price-promo-top { display: flex; align-items: baseline; gap: 8px; }
.price-was {
  color: #4b5563;
  font-size: 16px;
  font-weight: 600;
  text-decoration: line-through;
  text-decoration-color: #e11d48;
  text-decoration-thickness: 2px;
}
.price-off { color: #e11d48; font-weight: 700; font-size: 15px; }
.price-promo-now { display: flex; align-items: baseline; gap: 2px; }
.price-currency { color: #374151; font-size: 18px; font-weight: 600; }
.price-amount.promo { color: #e11d48; font-weight: 800; }
.room-total { font-size: var(--text-sm); color: var(--color-text-secondary); width: 100%; }
.room-btn { width: 100%; margin-top: auto; }
.no-room { margin: 0; }
.is-unavailable { opacity: 0.92; }
.my-booking-list { display: flex; flex-direction: column; gap: var(--space-3); }
.my-booking-card { padding: var(--space-4); }
.booking-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.booking-status { font-size: var(--text-label); font-weight: 600; padding: 2px var(--space-2); border-radius: var(--radius-pill); }
.status-awaiting_payment { background: #fff3cd; color: #856404; }
.status-pending { background: #cce5ff; color: #004085; }
.status-confirmed { background: #d4edda; color: #155724; }
.status-checked_in { background: #d1ecf1; color: #0c5460; }
.status-checked_out { background: #e2e3e5; color: #383d41; }
.status-cancelled { background: #f8d7da; color: #721c24; }
.booking-id { font-size: var(--text-label); color: var(--color-text-muted); }
.booking-hotel { margin: 0 0 var(--space-1); font-weight: 700; font-size: var(--text-sm); }
.booking-dates { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); margin-bottom: var(--space-1); }
.booking-rooms { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-bottom: var(--space-1); }
.room-tag { font-size: var(--text-label); padding: 2px var(--space-2); background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-pill); }
.booking-price { font-weight: 600; margin-bottom: var(--space-3); }
.stay-code {
  margin: calc(var(--space-2) * -1) 0 var(--space-3);
  padding: var(--space-3);
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
  overflow: hidden;
}
.stay-code-label { margin: 0; font-size: var(--text-label); color: var(--color-text-muted); }
.stay-code-value {
  margin: 4px 0 0;
  font-size: clamp(0.95rem, 4.2vw, var(--text-h3));
  font-weight: 700;
  letter-spacing: 0.02em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere;
  word-break: break-all;
  line-height: 1.35;
}
.stay-code-hint { margin: 4px 0 0; font-size: var(--text-label); color: var(--color-text-secondary); }
.booking-actions { display: flex; gap: var(--space-2); }
.btn-outline-danger {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--color-error, #c0392b) 40%, transparent);
  color: var(--color-error, #c0392b);
}
.error-msg { color: var(--color-danger, var(--color-error)); font-size: var(--text-sm); margin: 0; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (min-width: 720px) {
  .network-hero { min-height: 340px; }
  .network-hero-media { inset: 0 0 64px 0; border-radius: 0 0 48px 48px; }
  .network-hero-inner { padding-top: var(--space-6); }
  .network-search-card {
    display: grid;
    grid-template-columns: minmax(160px, 1.3fr) minmax(140px, 1fr) minmax(140px, 1fr) minmax(180px, 1.1fr);
    align-items: end;
    gap: var(--space-3) var(--space-4);
    padding: var(--space-5) var(--space-5) 40px;
  }
  .network-search-card .nights-label {
    grid-column: 1 / -1;
    text-align: left;
  }
  .network-search-card .form-input { min-height: var(--btn-primary-height); }
  .room-list,
  .my-booking-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    width: 100%;
  }
}
@media (min-width: 900px) {
  .network-hero { min-height: 380px; }
  .network-hero-title { margin-bottom: var(--space-5); }
  .search-sticky {
    left: 0;
    transform: none;
    width: 100%;
    max-width: none;
  }
}
</style>
