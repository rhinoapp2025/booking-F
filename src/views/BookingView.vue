<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Swal from 'sweetalert2'
import { useAuthStore } from '../stores/auth'
import { useBookingStore } from '../stores/booking'
import { useHotelStore } from '../stores/hotel'
import { useHotelRoute } from '../composables/useHotelRoute'
import { roomCoverUrl } from '../utils/roomTypeImage'
import { apiMediaUrl } from '../utils/resolveUiImageUrl'
import { useFeaturesStore } from '../stores/features'
import api from '../api/axios'
import BottomNav from '../components/BottomNav.vue'
import AccountMenuDrawer from '../components/AccountMenuDrawer.vue'
import BookingPolicyNotes from '../components/BookingPolicyNotes.vue'
import ReviewFormModal from '../components/ReviewFormModal.vue'
import { applyStayCharges } from '../utils/stayCharges'
import {
  GUEST_NATIONS,
  GUEST_TITLES,
  guestProfileFromUser,
} from '../constants/guestProfile'

const ROOM_VIEW_LABELS = {
  garden: 'วิวสวน',
  sea: 'วิวทะเล',
  mountain: 'วิวภูเขา',
  river: 'วิวแม่น้ำ',
}

const router       = useRouter()
const route        = useRoute()
const auth         = useAuthStore()
const hotelStore   = useHotelStore()
const bookingStore = useBookingStore()
const { hotelSlug, hotelPath } = useHotelRoute()
const accountMenuRef = ref(null)
const features = useFeaturesStore()
const hotelLogoUrl = computed(() => apiMediaUrl(hotelStore.hotel?.logo_url || ''))
const hotelBannerUrl = computed(() => apiMediaUrl(hotelStore.hotel?.banner_url || hotelStore.hotel?.login_image_url || ''))
const lightboxIndex = ref(-1)
const lightboxRoom = ref(null)
const lightboxTouchX = ref(null)

function roomImages(room) {
  const list = Array.isArray(room?.images) ? room.images.filter(Boolean) : []
  if (list.length) return list.map((u) => apiMediaUrl(u))
  return [apiMediaUrl(room?.cover_image || roomCoverUrl(room))].filter(Boolean)
}

function viewLabel(room) {
  return room?.view_type_label || ROOM_VIEW_LABELS[room?.view_type] || ''
}

const lightboxImages = computed(() => {
  const room = lightboxRoom.value || selectedRoomType.value
  if (!room) return []
  return roomImages(room)
})

const lightboxOpen = computed(() => lightboxIndex.value >= 0 && lightboxImages.value.length > 0)

const lightboxUrl = computed(() => {
  if (!lightboxOpen.value) return ''
  return lightboxImages.value[lightboxIndex.value] || ''
})

function openLightbox(idx = 0, room = null) {
  lightboxRoom.value = room || selectedRoomType.value
  const list = roomImages(lightboxRoom.value)
  if (!list.length) {
    lightboxIndex.value = -1
    return
  }
  const i = Number(idx)
  lightboxIndex.value = Number.isFinite(i) ? Math.min(Math.max(0, i), list.length - 1) : 0
}

function closeLightbox() {
  lightboxIndex.value = -1
  lightboxRoom.value = null
  lightboxTouchX.value = null
}

function lightboxPrev() {
  const n = lightboxImages.value.length
  if (n < 2) return
  lightboxIndex.value = (lightboxIndex.value - 1 + n) % n
}

function lightboxNext() {
  const n = lightboxImages.value.length
  if (n < 2) return
  lightboxIndex.value = (lightboxIndex.value + 1) % n
}

function onLightboxTouchStart(e) {
  lightboxTouchX.value = e.changedTouches?.[0]?.clientX ?? null
}

function onLightboxTouchEnd(e) {
  const start = lightboxTouchX.value
  lightboxTouchX.value = null
  if (start == null) return
  const end = e.changedTouches?.[0]?.clientX
  if (end == null) return
  const dx = end - start
  if (Math.abs(dx) < 40) return
  if (dx < 0) lightboxNext()
  else lightboxPrev()
}

function onLightboxKeydown(e) {
  if (!lightboxOpen.value) return
  if (e.key === 'Escape') closeLightbox()
  if (e.key === 'ArrowLeft') lightboxPrev()
  if (e.key === 'ArrowRight') lightboxNext()
}

function goNetworkSearch() {
  router.push({
    path: '/',
    query: {
      checkIn: checkIn.value,
      checkOut: checkOut.value,
      adults: String(numAdults.value),
      children: String(numChildren.value),
      ...(String(route.query.province || '').trim()
        ? { province: String(route.query.province).trim() }
        : {}),
    },
  })
}

// ── form state ─────────────────────────────────────────────────────────────
function localYmd(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function addDaysYmd(ymd, days) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const dt = new Date(y, (m || 1) - 1, (d || 1) + days)
  return localYmd(dt)
}

const browserToday = localYmd()
const today        = ref(browserToday)
const checkIn      = ref(browserToday)
const checkOut     = ref(addDaysYmd(browserToday, 1))
const minCheckOut = computed(() => addDaysYmd(checkIn.value || today.value, 1))
const numAdults   = ref(1)
const numChildren = ref(0)
const searchDone  = ref(false)
const busy        = ref(false)
const errorMsg    = ref('')

// ── booking modal ───────────────────────────────────────────────────────────
const showModal         = ref(false)
const bookingStep       = ref('details')
const selectedRoomType  = ref(null)
const selectedPlanId    = ref('')
const wantBreakfast     = ref(false)
const breakfastCount    = ref(1)
const specialRequests   = ref('')
const guestTitle        = ref('')
const guestFirstName    = ref('')
const guestLastName     = ref('')
const guestSex          = ref('')
const guestNation       = ref('TH')
const guestNationalId   = ref('')
const guestPassport     = ref('')
const guestBirthday     = ref('')
const guestPhone        = ref('')
const guestEmail        = ref('')
const guestCarNo        = ref('')
const guestAddress1     = ref('')
const guestAddress2     = ref('')
const guestAddress3     = ref('')

// ── tab: search / my bookings ───────────────────────────────────────────────
const tab = ref('search')
const searchFormRef = ref(null)
const formInView = ref(true)
let formObserver = null

const showSearchSticky = computed(() => tab.value === 'search' && !formInView.value)

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

const nights = computed(() => {
  if (!checkIn.value || !checkOut.value) return 0
  const diff = new Date(checkOut.value) - new Date(checkIn.value)
  return Math.round(diff / 86400000)
})

const guestCount = computed(() => Math.max(1, Number(numAdults.value) + Number(numChildren.value)))
const selectablePlans = computed(() => selectedRoomType.value?.rate_plans || [])
const selectedPlan = computed(() =>
  selectablePlans.value.find((p) => p.id === selectedPlanId.value) || null
)
const breakfastOffered = computed(() => {
  if (selectablePlans.value.length) return Boolean(selectedPlan.value?.includes_breakfast)
  return Boolean(selectedRoomType.value?.breakfast_available)
})
const breakfastLockedIn = computed(() =>
  Boolean(selectablePlans.value.length && selectedPlan.value?.includes_breakfast)
)
const abfPerPerson = computed(() => {
  if (!breakfastOffered.value) return 0
  if (selectedPlan.value) return Number(selectedPlan.value.abf_per_person_per_night) || 0
  return Number(selectedRoomType.value?.abf_per_person_per_night) || 0
})
  const pricePerNight = computed(() =>
    Number(selectedPlan.value?.price_per_night ?? selectedRoomType.value?.price_per_night ?? 0)
  )
const roomStayTotal = computed(() => pricePerNight.value * nights.value)
const breakfastStayTotal = computed(() => {
  if (!breakfastOffered.value) return 0
  if (breakfastLockedIn.value) return abfPerPerson.value * Number(breakfastCount.value) * nights.value
  if (!wantBreakfast.value) return 0
  return abfPerPerson.value * Number(breakfastCount.value) * nights.value
})
const staySubtotal = computed(() => roomStayTotal.value + breakfastStayTotal.value)
const stayCharges = computed(() => applyStayCharges(staySubtotal.value, {
  collectFull: bookingStore.collectFull,
  serviceChargePercent: bookingStore.serviceChargePercent,
  vatPercent: bookingStore.vatPercent,
}))
const stayTotal = computed(() => stayCharges.value.total)
const modalTitle = computed(() => (bookingStep.value === 'plan' ? 'เลือกเรทแพลน' : 'ยืนยันการจอง'))

function setBreakfastCount(n) {
  const max = guestCount.value
  breakfastCount.value = Math.min(max, Math.max(1, Number(n) || 1))
}

watch([wantBreakfast, guestCount, breakfastLockedIn], () => {
  if (wantBreakfast.value || breakfastLockedIn.value) {
    setBreakfastCount(breakfastCount.value || guestCount.value)
  }
})

watch(checkIn, (value) => {
  if (checkOut.value && checkOut.value <= checkIn.value) {
    checkOut.value = addDaysYmd(checkIn.value, 1)
  }
})

const searchReady = ref(false)
let searchTimer = null
function queueSearch() {
  if (!searchReady.value || tab.value !== 'search') return
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => { searchRooms() }, 250)
}
watch([checkIn, checkOut, numAdults, numChildren], queueSearch)

function staySearchKey() {
  return `${checkIn.value}|${checkOut.value}|${numAdults.value}|${numChildren.value}`
}
const lastSearchKey = ref('')

async function searchRooms() {
  errorMsg.value = ''
  if (checkOut.value <= checkIn.value) {
    errorMsg.value = 'วันเช็คเอาต์ต้องหลังวันเช็คอิน'
    return
  }
  searchDone.value = false
  await bookingStore.fetchAvailableRooms(hotelSlug.value, {
    checkIn: checkIn.value,
    checkOut: checkOut.value,
    adults: numAdults.value,
    children: numChildren.value,
  })
  lastSearchKey.value = staySearchKey()
  searchDone.value = true
  if (!bookingStore.availableRooms.length) {
    errorMsg.value = 'ไม่มีห้องว่างในช่วงวันที่เลือก'
  }
}

async function openBookingModal(roomType) {
  if (!auth.isLoggedIn) {
    const result = await Swal.fire({
      title: 'ยังไม่ได้เข้าสู่ระบบ',
      text: 'กรุณาเข้าสู่ระบบก่อนจอง แล้วจะกลับมาหน้านี้ต่อได้',
      icon: 'info',
      confirmButtonText: 'เข้าสู่ระบบ',
      showCancelButton: true,
      cancelButtonText: 'ยกเลิก',
    })
    if (!result.isConfirmed) return
    router.push({ path: hotelPath('/login'), query: { redirect: route.fullPath } })
    return
  }
  if (lastSearchKey.value !== staySearchKey()) {
    await searchRooms()
  }
  const fresh = bookingStore.availableRooms.find((r) => r.id === roomType.id) || null
  if (!fresh) {
    errorMsg.value = 'ไม่มีห้องว่างในช่วงวันที่เลือก'
    return
  }
  roomType = fresh
  selectedRoomType.value = roomType
  const plans = roomType.rate_plans || []
  selectedPlanId.value = plans.length === 1 ? plans[0].id : ''
  bookingStep.value = plans.length > 1 ? 'plan' : 'details'
  wantBreakfast.value = plans.length === 1
    ? Boolean(plans[0].includes_breakfast)
    : false
  breakfastCount.value = Math.max(1, Number(numAdults.value) + Number(numChildren.value))
  const saved = guestProfileFromUser(auth.user || {})
  guestTitle.value = saved.guest_title
  guestFirstName.value = saved.guest_first_name
  guestLastName.value = saved.guest_last_name
  guestSex.value = saved.guest_sex
  guestNation.value = saved.guest_nation || 'TH'
  guestNationalId.value = saved.guest_national_id
  guestPassport.value = saved.guest_passport
  guestBirthday.value = saved.guest_birthday
  guestPhone.value = saved.guest_phone
  guestEmail.value = saved.email
  guestCarNo.value = saved.guest_car_no
  guestAddress1.value = saved.guest_address1
  guestAddress2.value = saved.guest_address2
  guestAddress3.value = saved.guest_address3
  specialRequests.value = saved.guest_special_requests
  errorMsg.value = ''
  showModal.value  = true
}

async function openMyTab() {
  tab.value = 'my'
  if (!auth.isLoggedIn) return
  await bookingStore.fetchMyBookings(hotelSlug.value)
}

function selectPlan(plan) {
  selectedPlanId.value = plan.id
  wantBreakfast.value = Boolean(plan.includes_breakfast)
  setBreakfastCount(guestCount.value)
  errorMsg.value = ''
  bookingStep.value = 'details'
}

function backToPlans() {
  bookingStep.value = 'plan'
  errorMsg.value = ''
}

function missingRequiredFieldLabel() {
  if (selectablePlans.value.length > 1 && !selectedPlanId.value) return 'เรทแพลน'
  if (!guestTitle.value) return 'คำนำหน้า'
  if (!guestSex.value) return 'เพศ'
  if (!guestFirstName.value.trim()) return 'ชื่อ'
  if (!guestLastName.value.trim()) return 'นามสกุล'
  return ''
}

async function alertRequiredField(label) {
  await Swal.fire({
    title: `กรุณากรอก ${label}`,
    icon: 'warning',
    confirmButtonText: 'ตกลง',
  })
}

async function confirmBooking() {
  if (!selectedRoomType.value) return
  const missing = missingRequiredFieldLabel()
  if (missing) {
    if (missing === 'เรทแพลน') bookingStep.value = 'plan'
    await alertRequiredField(missing)
    return
  }
  busy.value    = true
  errorMsg.value = ''
  try {
    const includeBreakfast = breakfastLockedIn.value
      || Boolean(wantBreakfast.value && breakfastOffered.value)
    const booking = await bookingStore.createBooking(hotelSlug.value, {
      check_in_date:   checkIn.value,
      check_out_date:  checkOut.value,
      num_adults:      numAdults.value,
      num_children:    numChildren.value,
      room_type_id:    selectedRoomType.value.id,
      rate_plan_id:    selectedPlanId.value || undefined,
      include_breakfast: includeBreakfast,
      breakfast_count: includeBreakfast ? breakfastCount.value : 0,
      special_requests: specialRequests.value || undefined,
      guest_title:     guestTitle.value || undefined,
      guest_first_name: guestFirstName.value.trim(),
      guest_last_name: guestLastName.value.trim(),
      guest_sex:       guestSex.value || undefined,
      guest_nation:    guestNation.value || undefined,
      guest_national_id: guestNationalId.value.trim() || undefined,
      guest_passport:  guestPassport.value.trim() || undefined,
      guest_birthday:  guestBirthday.value || undefined,
      guest_phone:     guestPhone.value.trim() || undefined,
      guest_email:     guestEmail.value.trim() || undefined,
      guest_car_no:    guestCarNo.value.trim() || undefined,
      guest_address1:  guestAddress1.value.trim() || undefined,
      guest_address2:  guestAddress2.value.trim() || undefined,
      guest_address3:  guestAddress3.value.trim() || undefined,
      guest_name:      [guestTitle.value, guestFirstName.value.trim(), guestLastName.value.trim()].filter(Boolean).join(' '),
    })
    auth.fetchMe().catch(() => null)
  showModal.value = false
    if (booking?.status === 'awaiting_payment' && features.paymentEnabled) {
      router.push(`/${hotelSlug.value}/payment/${booking.id}?checkIn=${checkIn.value}&checkOut=${checkOut.value}`)
    } else {
      tab.value = 'my'
      await bookingStore.fetchMyBookings(hotelSlug.value)
      const pendingPms = booking?.status === 'pending'
      await Swal.fire({
        title: pendingPms ? 'บันทึกการจองแล้ว' : 'จองสำเร็จ',
        text: pendingPms ? 'รอแอดมินยืนยันชำระก่อนส่งเข้า PMS' : undefined,
        icon: 'success',
        timer: 1800,
        showConfirmButton: false,
      })
    }
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || bookingStore.error || 'จองไม่สำเร็จ'
  } finally {
    busy.value = false
  }
}

async function cancelBooking(booking) {
  const result = await Swal.fire({
    title: 'ยืนยันยกเลิกการจอง?',
    text: `เช็คอิน ${booking.check_in_date} → ${booking.check_out_date}`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ยกเลิกการจอง',
    cancelButtonText: 'ไม่ยกเลิก',
  })
  if (!result.isConfirmed) return
  try {
    await bookingStore.cancelBooking(hotelSlug.value, booking.id)
    await Swal.fire({ title: 'ยกเลิกแล้ว', icon: 'success', timer: 1500, showConfirmButton: false })
  } catch (err) {
    Swal.fire({ title: 'เกิดข้อผิดพลาด', text: bookingStore.error, icon: 'error' })
  }
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateShort(dateStr) {
  if (!dateStr) return ''
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function statusLabel(status, booking) {
  if (status === 'awaiting_payment') {
    return isFullPayment(booking) ? 'รอชำระเต็มจำนวน' : 'รอชำระมัดจำ'
  }
  const map = {
    pending:          'รอยืนยัน',
    confirmed:        'ยืนยันแล้ว',
    checked_in:       'เช็คอินแล้ว',
    checked_out:      'เช็คเอาต์แล้ว',
    cancelled:        'ยกเลิกแล้ว',
    no_show:          'ไม่มาตามกำหนด',
  }
  return map[status] || status
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
  return booking?.status === 'checked_out' && !booking?.has_review
}

const reviewBooking = ref(null)
const showReviewModal = computed({
  get: () => Boolean(reviewBooking.value),
  set: (v) => { if (!v) reviewBooking.value = null },
})

function openReview(booking) {
  reviewBooking.value = booking
}

async function onReviewSubmitted() {
  reviewBooking.value = null
  await bookingStore.fetchMyBookings(hotelSlug.value)
  await Swal.fire({ title: 'ขอบคุณสำหรับรีวิว', icon: 'success', timer: 1500, showConfirmButton: false })
}

watch(tab, async (value) => {
  if (value !== 'search') {
    formInView.value = true
    formObserver?.disconnect()
    formObserver = null
    return
  }
  if (!searchDone.value && !bookingStore.loading) await searchRooms()
  await nextTick()
  bindFormObserver()
})

onMounted(async () => {
  window.addEventListener('keydown', onLightboxKeydown)
  await bookingStore.fetchHotelSettings(hotelSlug.value)

  const q = route.query
  const qIn = String(q.checkIn || q.check_in || '').slice(0, 10)
  const qOut = String(q.checkOut || q.check_out || '').slice(0, 10)
  const qAdults = parseInt(q.adults, 10)
  const qChildren = parseInt(q.children, 10)
  if (qIn && qIn >= today.value) checkIn.value = qIn
  if (qOut && qOut > checkIn.value) checkOut.value = qOut
  if (Number.isFinite(qAdults) && qAdults >= 1) numAdults.value = qAdults
  if (Number.isFinite(qChildren) && qChildren >= 0) numChildren.value = qChildren
  if (String(q.tab || '') === 'my') tab.value = 'my'

  if (auth.isLoggedIn) {
    await bookingStore.fetchMyBookings(hotelSlug.value)
  }
  if (tab.value === 'search') await searchRooms()
  searchReady.value = true
  await nextTick()
  bindFormObserver()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onLightboxKeydown)
  clearTimeout(searchTimer)
  formObserver?.disconnect()
  formObserver = null
})
</script>

<template>
  <div class="booking-page app-page">
    <AccountMenuDrawer ref="accountMenuRef" />

    <header class="page-header">
      <button class="icon-btn" type="button" aria-label="กลับหน้ารวม" @click="goNetworkSearch">
        <i class="ti ti-arrow-left"></i>
      </button>
      <div class="hotel-heading">
        <img
          v-if="hotelLogoUrl"
          :src="hotelLogoUrl"
          class="hotel-logo"
          :alt="hotelStore.hotelName"
        />
        <h1 class="page-title">{{ hotelStore.hotelName }}</h1>
      </div>
      <button class="icon-btn" type="button" aria-label="บัญชี" @click="accountMenuRef?.open()">
        <i class="ti ti-user-circle"></i>
      </button>
    </header>

    <div v-if="tab === 'search'" class="search-hero" :class="{ 'has-photo': Boolean(hotelBannerUrl) }">
      <div v-if="hotelBannerUrl" class="search-hero-media">
        <img :src="hotelBannerUrl" :alt="hotelStore.hotelName" />
      </div>
      <div class="search-hero-front">
        <div class="tab-bar">
          <button :class="['tab-btn', { active: tab === 'search' }]" @click="tab = 'search'">ค้นหาห้อง</button>
          <button :class="['tab-btn', { active: tab === 'my' }]" @click="openMyTab">การจองของฉัน</button>
        </div>
        <div ref="searchFormRef" class="card search-form">
          <div class="form-row">
            <label class="form-label">เช็คอิน</label>
            <input
              v-model="checkIn"
              type="date"
              class="form-input"
              :min="today"
            />
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
          <button class="btn btn-primary search-btn" :disabled="bookingStore.loading" @click="searchRooms">
            <i class="ti ti-search"></i>
            {{ bookingStore.loading ? 'กำลังค้นหา...' : 'ค้นหาห้องว่าง' }}
          </button>
        </div>
      </div>
    </div>

    <div v-else class="tab-bar">
      <button :class="['tab-btn', { active: tab === 'search' }]" @click="tab = 'search'">ค้นหาห้อง</button>
      <button :class="['tab-btn', { active: tab === 'my' }]" @click="openMyTab">การจองของฉัน</button>
    </div>

    <!-- Search Tab -->
    <button
      v-show="showSearchSticky"
      type="button"
      class="search-sticky"
      aria-label="เลื่อนไปแก้วันที่เช็คอิน เช็คเอาต์"
      @click="scrollToSearchForm"
    >
      <span class="search-sticky-line">
        <i class="ti ti-calendar" aria-hidden="true"></i>
        <span class="search-sticky-text">{{ formatDateShort(checkIn) }} → {{ formatDateShort(checkOut) }} · ผู้ใหญ่ {{ numAdults }} · เด็ก {{ numChildren }}<template v-if="nights > 0"> · {{ nights }} คืน</template></span>
      </span>
      <i class="ti ti-chevron-up search-sticky-edit" aria-hidden="true"></i>
    </button>

    <section v-if="tab === 'search'" class="booking-section">
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

      <div v-if="searchDone && bookingStore.availableRooms.length" class="room-list">
        <div v-for="room in bookingStore.availableRooms" :key="room.id" class="card room-card">
          <div class="room-photo">
            <img
              :src="apiMediaUrl(room.cover_image || roomCoverUrl(room))"
              :alt="room.name"
              @click="openLightbox(0, room)"
            />
            <span v-if="room.available_count" class="room-photo-count">เหลือ {{ room.available_count }} ห้อง</span>
          </div>
          <div class="room-body">
          <div class="room-header">
            <h3 class="room-name">{{ room.name }}</h3>
          </div>
          <p v-if="viewLabel(room)" class="room-view"><i class="ti ti-eye"></i> {{ viewLabel(room) }}</p>
          <p v-if="room.description" class="room-desc">{{ room.description }}</p>
          <div v-if="room.size_sqm" class="room-details">
            <span><i class="ti ti-maximize"></i> {{ room.size_sqm }} ตร.ม.</span>
          </div>
          <div class="room-footer">
            <div class="room-price" :class="{ 'has-promo': room.discount_percent }">
              <template v-if="room.discount_percent && room.display_price_per_night">
                <div class="price-promo-top">
                  <span class="price-was">฿{{ Number(room.display_price_per_night).toLocaleString() }}</span>
                  <span class="price-off">-{{ Number(room.discount_percent) }}%</span>
                </div>
                <div class="price-promo-now">
                  <span v-if="(room.rate_plans || []).length > 1" class="price-from">เริ่มต้น</span>
                  <span class="price-currency">฿</span>
                  <span class="price-amount promo">{{ Number(room.price_per_night).toLocaleString() }}</span>
                  <span class="price-unit">/ คืน</span>
                </div>
              </template>
              <template v-else>
                <span v-if="(room.rate_plans || []).length > 1" class="price-from">เริ่มต้น</span>
                <span class="price-amount">฿{{ Number(room.price_per_night).toLocaleString() }}</span>
                <span class="price-unit">/ คืน</span>
              </template>
          </div>
            <div v-if="(room.rate_plans || []).length > 1" class="room-abf">
              {{ room.rate_plans.length }} เรทแพลน
              <span v-if="room.rate_plans.some((p) => p.includes_breakfast)"> · มีอาหารเช้าในบางเรท</span>
            </div>
            <div v-else-if="(room.rate_plans || []).length === 1 && room.rate_plans[0].includes_breakfast" class="room-abf">
              รวมอาหารเช้า ฿{{ Number(room.rate_plans[0].abf_per_person_per_night || 0).toLocaleString() }} / คน / คืน
            </div>
            <div v-else-if="!(room.rate_plans || []).length && room.breakfast_available" class="room-abf">
              อาหารเช้าได้ ฿{{ Number(room.abf_per_person_per_night || 0).toLocaleString() }} / คน / คืน
            </div>
            <div class="room-total" v-if="nights > 1">
              ห้อง ฿{{ (Number(room.price_per_night) * nights).toLocaleString() }} / {{ nights }} คืน
            </div>
              </div>
          <button class="btn btn-primary room-btn" @click="openBookingModal(room)">
            จองห้องนี้
          </button>
              </div>
              </div>
            </div>

      <div v-if="searchDone && !bookingStore.availableRooms.length && !errorMsg" class="state-card">
        <i class="ti ti-building-off state-card-icon"></i>
        <p class="state-card-title">ไม่มีห้องว่าง</p>
        <p class="state-card-sub">ลองเปลี่ยนวันหรือจำนวนแขก</p>
            </div>
    </section>

    <!-- My Bookings Tab -->
    <section v-else class="booking-section">
      <div v-if="!auth.isLoggedIn" class="state-card">
        <i class="ti ti-lock state-card-icon"></i>
        <p class="state-card-title">กรุณาเข้าสู่ระบบ</p>
        <button class="btn btn-primary" @click="router.push({ path: hotelPath('/login'), query: { redirect: route.fullPath } })">เข้าสู่ระบบ</button>
            </div>
      <div v-else-if="bookingStore.loading" class="state-card">
        <i class="ti ti-loader-2 state-card-icon spin"></i>
        <p class="state-card-title">กำลังโหลด...</p>
                  </div>
      <div v-else-if="!bookingStore.myBookings.length" class="state-card">
        <i class="ti ti-calendar-off state-card-icon"></i>
        <p class="state-card-title">ยังไม่มีการจอง</p>
                  </div>
      <div v-else class="my-booking-list">
        <div v-for="booking in bookingStore.myBookings" :key="booking.id" class="card my-booking-card">
          <div class="booking-header">
            <span :class="['booking-status', `status-${booking.status}`]">{{ statusLabel(booking.status, booking) }}</span>
            <span class="booking-id">#{{ booking.id.slice(0, 8) }}</span>
                  </div>
          <div class="booking-dates">
            <span>{{ formatDate(booking.check_in_date) }}</span>
            <i class="ti ti-arrow-right"></i>
            <span>{{ formatDate(booking.check_out_date) }}</span>
                </div>
          <div class="booking-rooms" v-if="booking.rooms?.length">
            <span v-for="r in booking.rooms" :key="r.room_id" class="room-tag">
              {{ r.room_type_name }} ห้อง {{ r.room_number }}
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
              v-if="booking.status === 'awaiting_payment'"
              class="btn btn-primary btn-sm"
              @click="router.push(`/${hotelSlug}/payment/${booking.id}`)"
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
              @click="cancelBooking(booking)"
            >
              ยกเลิก
                      </button>
                </div>
        </div>
      </div>
    </section>

    <ReviewFormModal
      :open="showReviewModal"
      :hotel-slug="hotelSlug"
      :booking="reviewBooking"
      @close="reviewBooking = null"
      @submitted="onReviewSubmitted"
    />

    <!-- Booking Confirm Modal -->
    <div v-if="showModal" class="modal-backdrop" @click.self="showModal = false">
      <div class="modal-sheet">
        <div class="modal-header">
          <h2 class="modal-title">{{ modalTitle }}</h2>
          <button class="icon-btn" @click="showModal = false"><i class="ti ti-x"></i></button>
                </div>
        <div class="modal-body">
          <template v-if="bookingStep === 'plan'">
            <p class="plan-intro">เลือกเรทแพลนของ {{ selectedRoomType?.name }}</p>
            <div class="plan-list">
              <button
                v-for="plan in selectablePlans"
                :key="plan.id"
                type="button"
                class="plan-card"
                :class="{ active: selectedPlanId === plan.id }"
                @click="selectPlan(plan)"
              >
                <div class="plan-card-top">
                  <span class="plan-name">{{ plan.name }}</span>
                  <div v-if="plan.discount_percent && plan.display_price_per_night" class="plan-price-promo">
                    <div class="price-promo-top">
                      <span class="price-was">฿{{ Number(plan.display_price_per_night).toLocaleString() }}</span>
                      <span class="price-off">-{{ Number(plan.discount_percent) }}%</span>
                    </div>
                    <div class="price-promo-now">
                      <span class="price-currency">฿</span>
                      <span class="plan-price promo">{{ Number(plan.price_per_night).toLocaleString() }}</span>
                      <small>/ คืน</small>
                    </div>
                  </div>
                  <span v-else class="plan-price">฿{{ Number(plan.price_per_night).toLocaleString() }} <small>/ คืน</small></span>
                </div>
                <p v-if="plan.includes_breakfast" class="plan-bf">
                  รวมอาหารเช้า ฿{{ Number(plan.abf_per_person_per_night || 0).toLocaleString() }} / คน / คืน
                </p>
                <p v-else class="plan-bf muted">ไม่มีอาหารเช้า</p>
                <p v-if="nights > 1" class="plan-stay">
                  ห้อง ฿{{ (Number(plan.price_per_night) * nights).toLocaleString() }} / {{ nights }} คืน
                </p>
              </button>
            </div>
          </template>

          <template v-else>
          <div class="confirm-summary">
            <div v-if="selectedRoomType" class="confirm-gallery">
              <div class="gallery-track">
                <button
                  v-for="(img, idx) in roomImages(selectedRoomType)"
                  :key="`${selectedRoomType.id}-${idx}`"
                  type="button"
                  class="gallery-item"
                  @click="openLightbox(idx)"
                >
                  <img :src="img" :alt="`${selectedRoomType.name} ${idx + 1}`" />
                </button>
              </div>
              <p v-if="roomImages(selectedRoomType).length > 1" class="gallery-hint muted">เลื่อนดูรูป · แตะขยายแล้วปัดซ้ายขวาได้</p>
            </div>
            <div class="summary-row">
              <span class="summary-label">ห้องพัก</span>
              <span class="summary-value">{{ selectedRoomType?.name }}</span>
            </div>
            <div v-if="viewLabel(selectedRoomType)" class="summary-row">
              <span class="summary-label">วิว</span>
              <span class="summary-value">{{ viewLabel(selectedRoomType) }}</span>
            </div>
            <div v-if="selectedPlan" class="summary-row">
              <span class="summary-label">เรทแพลน</span>
              <span class="summary-value">{{ selectedPlan.name }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">เช็คอิน</span>
              <span class="summary-value">{{ formatDate(checkIn) }}</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">เช็คเอาต์</span>
              <span class="summary-value">{{ formatDate(checkOut) }}</span>
        </div>
            <div class="summary-row">
              <span class="summary-label">จำนวนคืน</span>
              <span class="summary-value">{{ nights }} คืน</span>
      </div>
            <div class="summary-row">
              <span class="summary-label">ผู้ใหญ่</span>
              <span class="summary-value">{{ numAdults }} คน</span>
            </div>
            <div class="summary-row">
              <span class="summary-label">ราคาห้อง / คืน</span>
              <span class="summary-value">฿{{ pricePerNight.toLocaleString() }}</span>
            </div>
            <div v-if="breakfastOffered" class="breakfast-box">
              <p class="guest-form-title">อาหารเช้า</p>
              <template v-if="breakfastLockedIn">
                <p class="plan-bf">รวมในเรทแพลนนี้</p>
                <div class="breakfast-qty">
                  <span class="summary-label">จำนวนคน</span>
                  <div class="qty-stepper">
                    <button type="button" class="icon-btn" :disabled="breakfastCount <= 1" @click="setBreakfastCount(breakfastCount - 1)">−</button>
                    <span class="qty-value">{{ breakfastCount }} / {{ guestCount }}</span>
                    <button type="button" class="icon-btn" :disabled="breakfastCount >= guestCount" @click="setBreakfastCount(breakfastCount + 1)">+</button>
                  </div>
                  <span class="muted">฿{{ abfPerPerson.toLocaleString() }} / คน / คืน</span>
                </div>
                <div class="summary-row">
                  <span class="summary-label">อาหารเช้า {{ breakfastCount }} คน × {{ nights }} คืน</span>
                  <span class="summary-value">฿{{ breakfastStayTotal.toLocaleString() }}</span>
                </div>
              </template>
              <template v-else>
              <div class="breakfast-choices">
                <button
                  type="button"
                  class="breakfast-choice"
                  :class="{ active: !wantBreakfast }"
                  @click="wantBreakfast = false"
                >ไม่เอา</button>
                <button
                  type="button"
                  class="breakfast-choice"
                  :class="{ active: wantBreakfast }"
                  @click="wantBreakfast = true"
                >เอาอาหารเช้า</button>
              </div>
              <div v-if="wantBreakfast" class="breakfast-qty">
                <span class="summary-label">จำนวนคน</span>
                <div class="qty-stepper">
                  <button type="button" class="icon-btn" :disabled="breakfastCount <= 1" @click="setBreakfastCount(breakfastCount - 1)">−</button>
                  <span class="qty-value">{{ breakfastCount }} / {{ guestCount }}</span>
                  <button type="button" class="icon-btn" :disabled="breakfastCount >= guestCount" @click="setBreakfastCount(breakfastCount + 1)">+</button>
                </div>
                <span class="muted">฿{{ abfPerPerson.toLocaleString() }} / คน / คืน</span>
              </div>
              <div v-if="wantBreakfast" class="summary-row">
                <span class="summary-label">อาหารเช้า {{ breakfastCount }} คน × {{ nights }} คืน</span>
                <span class="summary-value">฿{{ breakfastStayTotal.toLocaleString() }}</span>
              </div>
              </template>
            </div>
            <div v-if="stayCharges.service_charge" class="summary-row">
              <span class="summary-label">Service Charge {{ stayCharges.service_charge_percent }}%</span>
              <span class="summary-value">฿{{ stayCharges.service_charge.toLocaleString() }}</span>
            </div>
            <div v-if="stayCharges.vat" class="summary-row">
              <span class="summary-label">VAT {{ stayCharges.vat_percent }}%</span>
              <span class="summary-value">฿{{ stayCharges.vat.toLocaleString() }}</span>
            </div>
            <div class="summary-row summary-total">
              <span class="summary-label">ราคารวม</span>
              <span class="summary-value price">฿{{ stayTotal.toLocaleString() }}</span>
            </div>
            <BookingPolicyNotes
              :cancellation-policy="hotelStore.hotel?.cancellation_policy"
              :non-smoking="Boolean(hotelStore.hotel?.non_smoking)"
              :non-smoking-fine="hotelStore.hotel?.non_smoking_fine"
            />
          </div>

          <div class="guest-form">
            <p class="guest-form-title">ข้อมูลผู้เข้าพัก</p>
            <div class="form-row-inline">
              <div class="form-row">
                <label class="form-label">คำนำหน้า <span class="req">*</span></label>
                <select v-model="guestTitle" class="form-input" required>
                  <option value="" disabled>เลือก</option>
                  <option v-for="t in GUEST_TITLES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">เพศ <span class="req">*</span></label>
                <select v-model="guestSex" class="form-input" required>
                  <option value="" disabled>เลือก</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>
            </div>
            <div class="form-row-inline">
              <div class="form-row">
                <label class="form-label">ชื่อ <span class="req">*</span></label>
                <input v-model="guestFirstName" type="text" class="form-input" placeholder="ชื่อ" required />
              </div>
              <div class="form-row">
                <label class="form-label">นามสกุล <span class="req">*</span></label>
                <input v-model="guestLastName" type="text" class="form-input" placeholder="นามสกุล" required />
              </div>
            </div>
            <div class="form-row-inline">
              <div class="form-row">
                <label class="form-label">สัญชาติ</label>
                <select v-model="guestNation" class="form-input">
                  <option v-for="n in GUEST_NATIONS" :key="n.code" :value="n.code">{{ n.name }}</option>
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">วันเกิด</label>
                <input v-model="guestBirthday" type="date" class="form-input" />
              </div>
            </div>
            <div class="form-row-inline">
              <div class="form-row">
                <label class="form-label">เลขบัตรประชาชน</label>
                <input v-model="guestNationalId" type="text" class="form-input" maxlength="13" placeholder="เลข 13 หลัก" />
              </div>
              <div class="form-row">
                <label class="form-label">เลขพาสปอร์ต</label>
                <input v-model="guestPassport" type="text" class="form-input" placeholder="ถ้ามี" />
              </div>
            </div>
            <div class="form-row-inline">
              <div class="form-row">
                <label class="form-label">เบอร์โทรศัพท์</label>
                <input v-model="guestPhone" type="tel" class="form-input" placeholder="0812345678" />
              </div>
              <div class="form-row">
                <label class="form-label">ทะเบียนรถ</label>
                <input v-model="guestCarNo" type="text" class="form-input" placeholder="กก 1234" />
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">อีเมล</label>
              <input v-model="guestEmail" type="email" class="form-input" placeholder="email@example.com" />
            </div>
            <div class="form-row">
              <label class="form-label">ที่อยู่ <span class="muted-hint">ไม่เกิน 60 ตัวอักษรต่อช่อง</span></label>
              <input v-model="guestAddress1" type="text" class="form-input" maxlength="60" placeholder="ที่อยู่บรรทัด 1" />
            </div>
            <div class="form-row">
              <input v-model="guestAddress2" type="text" class="form-input" maxlength="60" placeholder="ที่อยู่บรรทัด 2" />
            </div>
            <div class="form-row">
              <input v-model="guestAddress3" type="text" class="form-input" maxlength="60" placeholder="ที่อยู่บรรทัด 3" />
            </div>
            <div class="form-row">
              <label class="form-label">ความต้องการพิเศษ</label>
              <textarea v-model="specialRequests" class="form-input" rows="2" placeholder="เช่น ห้องชั้นสูง ห้องไม่สูบบุหรี่"></textarea>
            </div>
          </div>

          </template>

          <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        </div>
        <div class="modal-footer">
          <button
            v-if="bookingStep === 'details' && selectablePlans.length > 1"
            class="btn btn-outline"
            type="button"
            @click="backToPlans"
          >ย้อนกลับ</button>
          <button class="btn btn-outline" type="button" @click="showModal = false">ยกเลิก</button>
          <button
            v-if="bookingStep === 'details'"
            class="btn btn-primary"
            :disabled="busy"
            @click="confirmBooking"
          >
            {{ busy ? 'กำลังจอง...' : 'ยืนยันการจอง' }}
          </button>
          </div>
        </div>
      </div>

    <BottomNav active="bookings" />

    <Teleport to="body">
      <div
        v-if="lightboxOpen"
        class="lightbox"
        role="dialog"
        aria-modal="true"
        aria-label="ดูรูปห้องขยาย"
        @click.self="closeLightbox"
        @touchstart.passive="onLightboxTouchStart"
        @touchend.passive="onLightboxTouchEnd"
      >
        <button type="button" class="lightbox-close icon-btn" aria-label="ปิด" @click="closeLightbox">
          <i class="ti ti-x"></i>
        </button>
        <button
          v-if="lightboxImages.length > 1"
          type="button"
          class="lightbox-nav lightbox-prev icon-btn"
          aria-label="รูปก่อนหน้า"
          @click.stop="lightboxPrev"
        >
          <i class="ti ti-chevron-left"></i>
        </button>
        <img :src="lightboxUrl" alt="ขยายรูปห้อง" class="lightbox-img" @click.stop />
        <button
          v-if="lightboxImages.length > 1"
          type="button"
          class="lightbox-nav lightbox-next icon-btn"
          aria-label="รูปถัดไป"
          @click.stop="lightboxNext"
        >
          <i class="ti ti-chevron-right"></i>
        </button>
        <p v-if="lightboxImages.length > 1" class="lightbox-counter">
          {{ lightboxIndex + 1 }} / {{ lightboxImages.length }}
        </p>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.booking-page { padding-bottom: calc(var(--bottom-nav-height, 64px) + var(--space-4)); }
.page-header { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-4) var(--page-padding-x); }
.hotel-heading { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.hotel-logo {
  height: 36px;
  width: auto;
  max-width: 40px;
  object-fit: contain;
  flex-shrink: 0;
}
.page-title  { font-size: var(--text-h1); font-weight: 700; margin: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-hero .tab-bar { padding: 0; }
.tab-bar     { display: flex; gap: var(--space-2); padding: 0 var(--page-padding-x) var(--space-3); }
.tab-btn     { flex: 1; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: transparent; font-family: inherit; cursor: pointer; font-size: var(--text-sm); }
.tab-btn.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
.search-hero.has-photo .tab-btn {
  background: color-mix(in srgb, #fff 90%, transparent);
  border-color: transparent;
}
.search-hero.has-photo .tab-btn.active {
  background: #fff;
  color: var(--color-primary);
  border-color: transparent;
  box-shadow: var(--shadow-sm);
}
.booking-section { padding: 0 var(--page-padding-x); display: flex; flex-direction: column; gap: var(--space-4); }
.search-form { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.form-row    { display: flex; flex-direction: column; gap: var(--space-1); }
.form-row-inline { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.form-label  { font-size: var(--text-label); font-weight: 500; color: var(--color-text-secondary); }
.muted-hint { font-weight: 400; color: var(--color-text-muted); }
.req { color: var(--color-error, #c0392b); }
.form-input  { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: inherit; font-size: var(--text-sm); background: var(--color-surface); }
.nights-label { font-size: var(--text-sm); color: var(--color-text-muted); text-align: center; }
.search-btn  { width: 100%; }
.search-sticky {
  position: fixed;
  top: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 100%;
  max-width: var(--page-max-width);
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
.room-list   { display: flex; flex-direction: column; gap: var(--space-3); }
.room-card   { padding: 0; overflow: hidden; display: flex; flex-direction: column; height: 100%; }
.room-photo  { position: relative; height: 180px; background: var(--color-surface-elevated); flex-shrink: 0; }
.room-photo img { width: 100%; height: 100%; object-fit: cover; display: block; cursor: zoom-in; }
.room-photo-count { position: absolute; left: var(--space-3); bottom: var(--space-3); background: rgba(0,0,0,.65); color: #fff; font-size: var(--text-label); font-weight: 600; padding: 4px 10px; border-radius: var(--radius-pill); }
.room-view { margin: 0 0 var(--space-2); font-size: var(--text-sm); color: var(--color-text-secondary); display: flex; align-items: center; gap: 4px; }
.room-body   { padding: var(--space-4); display: flex; flex-direction: column; flex: 1; min-height: 0; }
.room-header { display: flex; align-items: center; gap: var(--space-2); margin-bottom: var(--space-1); }
.room-name   { font-weight: 700; font-size: var(--text-h3); margin: 0; }
.room-badge  { font-size: var(--text-label); padding: 2px var(--space-2); border-radius: var(--radius-pill); background: var(--color-accent-light); color: var(--color-accent); }
.room-desc   { color: var(--color-text-secondary); font-size: var(--text-sm); margin: 0 0 var(--space-2); }
.room-details { display: flex; gap: var(--space-3); font-size: var(--text-sm); color: var(--color-text-muted); margin-bottom: var(--space-3); }
.room-footer { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); margin-bottom: var(--space-3); }
.price-amount { font-size: var(--text-h2); font-weight: 700; color: var(--color-primary); }
.price-unit  { font-size: var(--text-sm); color: var(--color-text-muted); }
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
.price-amount.promo,
.plan-price.promo { color: #e11d48; font-weight: 800; }
.plan-price-promo { text-align: right; }
.plan-price-promo .price-promo-top { justify-content: flex-end; }
.plan-price-promo .price-promo-now { justify-content: flex-end; }
.price-from { font-size: var(--text-sm); color: var(--color-text-muted); margin-right: 4px; }
.room-abf    { font-size: var(--text-sm); color: var(--color-text-secondary); width: 100%; }
.plan-intro { margin: 0 0 var(--space-3); color: var(--color-text-secondary); font-size: var(--text-sm); }
.plan-list { display: flex; flex-direction: column; gap: var(--space-3); }
.plan-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  text-align: left;
  padding: var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-family: inherit;
  cursor: pointer;
  min-height: 44px;
}
.plan-card.active {
  border-color: var(--color-primary);
  background: var(--color-primary-light);
}
.plan-card-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--space-3);
}
.plan-name { font-weight: 700; font-size: var(--text-h3); }
.plan-price { font-weight: 700; color: var(--color-primary); white-space: nowrap; }
.plan-price small { font-weight: 500; color: var(--color-text-muted); }
.plan-bf { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); }
.plan-stay { margin: 0; font-size: var(--text-sm); color: var(--color-text-muted); }
.breakfast-box {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-elevated);
}
.breakfast-choices { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.breakfast-choice {
  flex: 1;
  min-width: 120px;
  min-height: 44px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.breakfast-choice.active {
  background: var(--color-primary);
  color: var(--color-on-primary);
  border-color: var(--color-primary);
}
.breakfast-qty {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.qty-stepper {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.qty-value { font-weight: 700; min-width: 64px; text-align: center; }
.room-btn    { width: 100%; margin-top: auto; }
.my-booking-list { display: flex; flex-direction: column; gap: var(--space-3); }
.my-booking-card { padding: var(--space-4); }
.booking-header  { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.booking-status  { font-size: var(--text-label); font-weight: 600; padding: 2px var(--space-2); border-radius: var(--radius-pill); }
.status-awaiting_payment { background: #fff3cd; color: #856404; }
.status-pending    { background: #cce5ff; color: #004085; }
.status-confirmed  { background: #d4edda; color: #155724; }
.status-checked_in { background: #d1ecf1; color: #0c5460; }
.status-checked_out { background: #e2e3e5; color: #383d41; }
.status-cancelled  { background: #f8d7da; color: #721c24; }
.booking-id        { font-size: var(--text-label); color: var(--color-text-muted); }
.booking-dates     { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-sm); margin-bottom: var(--space-1); }
.booking-rooms     { display: flex; flex-wrap: wrap; gap: var(--space-1); margin-bottom: var(--space-1); }
.room-tag          { font-size: var(--text-label); padding: 2px var(--space-2); background: var(--color-surface-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-pill); }
.booking-price     { font-weight: 600; margin-bottom: var(--space-3); }
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
.booking-actions   { display: flex; gap: var(--space-2); }
.error-msg  { color: var(--color-danger); font-size: var(--text-sm); }
.modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 500; display: flex; align-items: flex-end; }
.modal-sheet { background: var(--color-surface); border-radius: var(--radius-card) var(--radius-card) 0 0; width: 100%; max-height: 90vh; overflow-y: auto; }
.modal-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4); border-bottom: 1px solid var(--color-border); position: sticky; top: 0; background: var(--color-surface); }
.modal-title  { font-size: var(--text-h2); font-weight: 700; margin: 0; }
.modal-body   { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.guest-form { display: flex; flex-direction: column; gap: var(--space-3); }
.guest-form-title { margin: 0; font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); }
.modal-footer { padding: var(--space-4); border-top: 1px solid var(--color-border); display: flex; gap: var(--space-3); }
.modal-footer .btn { flex: 1; }
.confirm-summary { background: var(--color-surface-elevated); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.confirm-photo { width: 100%; height: 140px; object-fit: cover; border-radius: var(--radius-md); }
.confirm-gallery { margin: calc(var(--space-3) * -1) calc(var(--space-3) * -1) var(--space-2); }
.gallery-track {
  display: flex;
  gap: 0;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
}
.gallery-item {
  flex: 0 0 100%;
  width: 100%;
  aspect-ratio: 16 / 9;
  min-height: 160px;
  border: none;
  padding: 0;
  background: var(--color-surface-muted);
  overflow: hidden;
  scroll-snap-align: start;
  cursor: zoom-in;
}
.gallery-item:first-child {
  border-radius: var(--radius-md) var(--radius-md) 0 0;
}
.gallery-item img {
  width: 100%;
  height: 100%;
  max-width: none;
  object-fit: cover;
  object-position: center;
  display: block;
}
.gallery-hint { margin: var(--space-1) 0 0; font-size: var(--text-label); }
.lightbox {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
  touch-action: pan-y;
}
.lightbox-img {
  max-width: min(100%, 920px);
  max-height: 85vh;
  object-fit: contain;
  border-radius: var(--radius-md);
  user-select: none;
  -webkit-user-drag: none;
}
.lightbox-close {
  position: absolute;
  top: max(var(--space-3), env(safe-area-inset-top));
  right: max(var(--space-3), env(safe-area-inset-right));
  z-index: 2;
  color: #fff;
  background: rgba(255,255,255,.12);
}
.lightbox-nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2;
  color: #fff;
  background: rgba(255,255,255,.14);
  width: 44px;
  height: 44px;
}
.lightbox-prev { left: max(var(--space-2), env(safe-area-inset-left)); }
.lightbox-next { right: max(var(--space-2), env(safe-area-inset-right)); }
.lightbox-counter {
  position: absolute;
  bottom: max(var(--space-4), env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  color: rgba(255,255,255,.9);
  font-size: var(--text-sm);
  background: rgba(0,0,0,.35);
  padding: 4px 10px;
  border-radius: var(--radius-pill);
}
.summary-row  { display: flex; justify-content: space-between; font-size: var(--text-sm); }
.summary-label { color: var(--color-text-muted); }
.summary-total { border-top: 1px solid var(--color-border); padding-top: var(--space-2); font-weight: 600; }
.price { color: var(--color-primary); font-size: var(--text-lg); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (min-width: 900px) {
  .booking-page {
    max-width: none;
    width: 100%;
  }
  .page-header,
  .tab-bar,
  .booking-section {
    max-width: none;
    width: 100%;
    box-sizing: border-box;
  }
  .hotel-logo { display: none; }
  .tab-bar { justify-content: flex-start; }
  .tab-btn { flex: 0 0 auto; min-width: 168px; }
  .search-sticky {
    left: var(--sidebar-width, 240px);
    transform: none;
    width: calc(100% - var(--sidebar-width, 240px));
    max-width: none;
  }
  .search-form {
    max-width: none;
    width: 100%;
    display: grid;
    grid-template-columns: minmax(160px, 1fr) minmax(160px, 1fr) minmax(220px, 1.2fr) auto;
    align-items: end;
    gap: var(--space-3) var(--space-4);
  }
  .search-form .form-input {
    min-height: var(--btn-primary-height);
    box-sizing: border-box;
  }
  .search-form .nights-label {
    grid-column: 1 / 4;
    grid-row: 2;
    text-align: left;
    margin: 0;
  }
  .search-form .search-btn {
    grid-column: 4;
    grid-row: 1;
    align-self: end;
    width: auto;
    min-width: 180px;
    height: var(--btn-primary-height);
    min-height: var(--btn-primary-height);
    white-space: nowrap;
  }
  .room-list,
  .my-booking-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    width: 100%;
  }
  .modal-backdrop { align-items: center; }
  .modal-sheet {
    max-width: 480px;
    margin: 0 auto;
    border-radius: var(--radius-card);
    max-height: 85vh;
  }
}
</style>
