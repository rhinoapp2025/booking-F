<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import QRCode from 'qrcode'
import generatePayload from 'promptpay-qr'
import { useHotelRoute } from '../composables/useHotelRoute'
import { useBookingStore } from '../stores/booking'
import api from '../api/axios'
import { compressImage } from '../utils/compressChatImage'
import BookingPolicyNotes from '../components/BookingPolicyNotes.vue'
import { applyStayCharges } from '../utils/stayCharges'

const route        = useRoute()
const router       = useRouter()
const { hotelSlug, hotelPath } = useHotelRoute()
const bookingStore = useBookingStore()

const bookingId    = computed(() => route.params.bookingId)
const booking      = ref(null)
const loading      = ref(true)
const errorMsg     = ref('')

const promptpayId     = ref('')
const bankName        = ref('')
const bankAccountName = ref('')
const bankAccountNo   = ref('')
const payMode = ref('deposit')
const servicePercent = ref(0)
const vatPercent = ref(0)
const checkout = ref(null)
const isCheckout = computed(() => String(bookingId.value) === 'checkout')
const depositAmount  = computed(() => {
  if (checkout.value) return Number(checkout.value.summary?.deposit) || 0
  return Number(booking.value?.deposit_amount) || 0
})
const collectFull = computed(() => {
  if (checkout.value?.summary) return Boolean(checkout.value.summary.collectFull) || payMode.value === 'full'
  const total = Number(booking.value?.total_price) || 0
  const due = depositAmount.value
  if (total > 0 && due >= total) return true
  return payMode.value === 'full'
})
const payTitle = computed(() => collectFull.value ? 'ชำระเงิน' : 'ชำระมัดจำ')
const payAmountLabel = computed(() => collectFull.value ? 'ยอดชำระ' : 'ยอดมัดจำ')

const priceLines = computed(() => {
  if (checkout.value?.summary) {
    const s = checkout.value.summary
    return {
      roomTotal: Number(s.roomTotal) || 0,
      breakfastTotal: Number(s.breakfastTotal) || 0,
      subtotal: Number(s.subtotal) || 0,
      serviceCharge: Number(s.serviceCharge) || 0,
      servicePercent: Number(s.servicePercent) || 0,
      vat: Number(s.vat) || 0,
      vatPercent: Number(s.vatPercent) || 0,
      total: Number(s.total) || 0,
    }
  }
  const rooms = Array.isArray(booking.value?.rooms) ? booking.value.rooms : []
  const subtotal = rooms.reduce((sum, room) => sum + (Number(room.subtotal) || 0), 0)
  const charged = applyStayCharges(subtotal, {
    collectFull: collectFull.value,
    serviceChargePercent: servicePercent.value,
    vatPercent: vatPercent.value,
  })
  return {
    roomTotal: subtotal,
    breakfastTotal: 0,
    subtotal,
    serviceCharge: charged.service_charge,
    servicePercent: charged.service_charge_percent,
    vat: charged.vat,
    vatPercent: charged.vat_percent,
    total: charged.total || Number(booking.value?.total_price) || 0,
  }
})

const qrCodeImage = ref('')
const slipPreview  = ref('')
const slipObjectUrl = ref('')
const uploadBusy   = ref(false)
const uploadSuccess = ref(false)

function setSlipPreview(url, { objectUrl = false } = {}) {
  if (slipObjectUrl.value) {
    URL.revokeObjectURL(slipObjectUrl.value)
    slipObjectUrl.value = ''
  }
  if (objectUrl) slipObjectUrl.value = url
  slipPreview.value = url || ''
}

async function loadSavedSlip() {
  try {
    const response = await api.get(
      `/api/bookings/${hotelSlug.value}/${bookingId.value}/slip`,
      { responseType: 'blob' },
    )
    setSlipPreview(URL.createObjectURL(response.data), { objectUrl: true })
    uploadSuccess.value = true
  } catch {
    // ยังไม่มีสลิป
  }
}

function applyPaySettings(pay) {
  promptpayId.value = pay?.promptpay_number || ''
  bankName.value = pay?.bank_name || ''
  bankAccountName.value = pay?.bank_account_name || ''
  bankAccountNo.value = pay?.bank_account_no || ''
  payMode.value = pay?.payment_collect_mode === 'full' ? 'full' : 'deposit'
  servicePercent.value = Number(pay?.service_charge_percent) || 0
  vatPercent.value = Number(pay?.vat_percent) || 0
}

async function loadCheckout() {
  const raw = sessionStorage.getItem(`booking-checkout:${hotelSlug.value}`)
  if (!raw) {
    errorMsg.value = 'ไม่พบข้อมูลการจอง กรุณากลับไปยืนยันการจองใหม่'
    return
  }
  const draft = JSON.parse(raw)
  if (draft.hotelSlug !== hotelSlug.value || !draft.payload) {
    errorMsg.value = 'ไม่พบข้อมูลการจอง กรุณากลับไปยืนยันการจองใหม่'
    return
  }
  checkout.value = draft
  booking.value = {
    status: 'awaiting_payment',
    check_in_date: draft.summary?.checkIn,
    check_out_date: draft.summary?.checkOut,
    deposit_amount: draft.summary?.deposit,
    cancellation_policy: null,
  }
  const pay = await api.get(`/api/hotels/${hotelSlug.value}/payment`).catch(() => ({ data: {} }))
  applyPaySettings(pay.data)
  const due = Number(draft.summary?.deposit) || 0
  if (promptpayId.value && due > 0) {
    try {
      const payload = generatePayload(promptpayId.value, { amount: due })
      qrCodeImage.value = await QRCode.toDataURL(payload)
    } catch {
      // no QR available
    }
  }
}

async function loadBooking() {
  if (isCheckout.value) {
    try {
      await loadCheckout()
    } catch (err) {
      errorMsg.value = err?.message || 'โหลดหน้าชำระไม่สำเร็จ'
      checkout.value = null
      booking.value = null
    } finally {
      loading.value = false
    }
    return
  }
  try {
    const [{ data }, pay] = await Promise.all([
      api.get(`/api/bookings/${hotelSlug.value}/${bookingId.value}`),
      api.get(`/api/hotels/${hotelSlug.value}/payment`).catch(() => ({ data: {} })),
    ])
    booking.value = data
    applyPaySettings(pay.data)
    if (data.slip_status && !slipPreview.value) await loadSavedSlip()
    if (promptpayId.value && data.deposit_amount) {
      try {
        const payload = generatePayload(promptpayId.value, { amount: Number(data.deposit_amount) })
        qrCodeImage.value = await QRCode.toDataURL(payload)
      } catch {
        // no QR available
      }
    }
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'โหลดข้อมูลการจองไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

async function handleSlipFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  errorMsg.value = ''
  uploadBusy.value = true
  try {
    const compressed = await compressImage(file, { maxWidth: 1200, quality: 0.8 })
    const dataUrl = `data:${compressed.mime};base64,${compressed.base64}`
    setSlipPreview(dataUrl)
    if (isCheckout.value) {
      const created = await bookingStore.createBooking(hotelSlug.value, {
        ...checkout.value.payload,
        imageData: compressed.base64,
        imageMime: compressed.mime,
      })
      sessionStorage.removeItem(`booking-checkout:${hotelSlug.value}`)
      checkout.value = null
      uploadSuccess.value = true
      await router.replace(`/${hotelSlug.value}/payment/${created.id}`)
      loading.value = true
      await loadBooking()
      uploadSuccess.value = true
      return
    }
    await bookingStore.uploadPaymentSlip(hotelSlug.value, bookingId.value, {
      imageData: compressed.base64,
      imageMime: compressed.mime,
    })
    uploadSuccess.value = true
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || err?.message || bookingStore.error || 'อัปโหลดสลิปไม่สำเร็จ'
  } finally {
    uploadBusy.value = false
  }
}

function formatDate(d) {
  if (!d) return ''
  const raw = String(d).slice(0, 10)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00`) : new Date(d)
  return date.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatBaht(n) {
  return Number(n || 0).toLocaleString('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function saveQrCode() {
  if (!qrCodeImage.value) return
  const id = String(bookingId.value || '').replace(/-/g, '').slice(0, 8) || 'booking'
  const link = document.createElement('a')
  link.href = qrCodeImage.value
  link.download = `promptpay-qr-${id}.png`
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

onMounted(loadBooking)
onUnmounted(() => {
  if (slipObjectUrl.value) URL.revokeObjectURL(slipObjectUrl.value)
})
</script>

<template>
  <main class="payment-page app-page">
    <header class="page-header">
      <button class="icon-btn" @click="router.push(hotelPath('/bookings'))">
        <i class="ti ti-arrow-left"></i>
      </button>
      <h1 class="page-title">{{ payTitle }}</h1>
      <span></span>
    </header>

    <div v-if="loading" class="state-card">
      <i class="ti ti-loader-2 state-card-icon spin"></i>
      <p class="state-card-title">กำลังโหลด...</p>
    </div>

    <div v-else-if="errorMsg && !booking" class="state-card">
      <i class="ti ti-alert-circle state-card-icon"></i>
      <p class="state-card-title">{{ errorMsg }}</p>
    </div>

    <template v-else-if="booking">
      <!-- Booking Summary -->
      <section class="card payment-summary">
        <h2 class="section-title">รายละเอียดการจอง</h2>
        <div class="summary-rows">
          <div v-if="booking.id" class="summary-row">
            <span class="summary-label">รหัสจอง</span>
            <span class="summary-value mono">{{ booking.id.slice(0, 8) }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">เช็คอิน</span>
            <span class="summary-value">{{ formatDate(booking.check_in_date) }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">เช็คเอาต์</span>
            <span class="summary-value">{{ formatDate(booking.check_out_date) }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">ราคาห้อง</span>
            <span class="summary-value">฿{{ formatBaht(priceLines.roomTotal) }}</span>
          </div>
          <div v-if="priceLines.breakfastTotal" class="summary-row">
            <span class="summary-label">อาหารเช้า</span>
            <span class="summary-value">฿{{ formatBaht(priceLines.breakfastTotal) }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Service {{ priceLines.servicePercent }}%</span>
            <span class="summary-value">฿{{ formatBaht(priceLines.serviceCharge) }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">VAT {{ priceLines.vatPercent }}%</span>
            <span class="summary-value">฿{{ formatBaht(priceLines.vat) }}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">ราคารวม</span>
            <span class="summary-value">฿{{ formatBaht(priceLines.total) }}</span>
          </div>
          <div class="summary-row summary-total">
            <span class="summary-label">{{ payAmountLabel }}</span>
            <span class="summary-value price">฿{{ formatBaht(depositAmount) }}</span>
          </div>
        </div>
        <BookingPolicyNotes
          :cancellation-policy="booking.cancellation_policy"
          :non-smoking="Boolean(booking.non_smoking)"
          :non-smoking-fine="booking.non_smoking_fine"
        />
      </section>

      <!-- Already paid -->
      <div v-if="['confirmed','checked_in','checked_out'].includes(booking.status)" class="state-card success-state">
        <i class="ti ti-circle-check state-card-icon"></i>
        <p class="state-card-title">ยืนยันการจองแล้ว</p>
        <p class="state-card-sub">โรงแรมได้รับการจองของคุณแล้ว</p>
        <p v-if="booking.pms_ota_booking_no" class="stay-code-value">{{ booking.pms_ota_booking_no }}</p>
        <p v-if="booking.pms_ota_booking_no" class="state-card-sub">เลขจองสำหรับเข้าพัก — แสดงตอนเช็คอิน</p>
        <div v-if="slipPreview" class="slip-preview">
          <img :src="slipPreview" alt="สลิปโอนเงิน" class="slip-img" />
        </div>
      </div>

      <!-- Payment section -->
      <template v-else-if="booking.status === 'awaiting_payment'">
        <!-- PromptPay QR -->
        <section v-if="qrCodeImage || (promptpayId && depositAmount > 0)" class="card payment-qr">
          <h2 class="section-title">สแกน QR PromptPay</h2>
          <div class="qr-wrap">
            <img v-if="qrCodeImage" :src="qrCodeImage" alt="QR PromptPay" class="qr-img" />
          </div>
          <p class="qr-amount">฿{{ formatBaht(depositAmount) }}</p>
          <p v-if="bankAccountName" class="qr-name">{{ bankAccountName }}</p>
          <p class="qr-id">{{ promptpayId }}</p>
          <button
            v-if="qrCodeImage"
            type="button"
            class="btn btn-outline qr-save-btn"
            @click="saveQrCode"
          >
            <i class="ti ti-download"></i>
            บันทึก QR Code
          </button>
        </section>

        <!-- Bank transfer -->
        <section v-if="bankAccountNo" class="card payment-bank">
          <h2 class="section-title">โอนเงินผ่านธนาคาร</h2>
          <div class="bank-info">
            <p class="bank-name">{{ bankName }}</p>
            <p class="bank-account-name">{{ bankAccountName }}</p>
            <p class="bank-account-no">{{ bankAccountNo }}</p>
          </div>
        </section>

        <!-- Slip upload -->
        <section class="card payment-slip">
          <h2 class="section-title">แนบสลิปโอนเงิน</h2>

          <div v-if="slipPreview" class="slip-preview">
            <img :src="slipPreview" alt="สลิปโอนเงิน" class="slip-img" />
          </div>
          <div v-if="uploadSuccess" class="upload-success">
            <i class="ti ti-check"></i> ส่งสลิปแล้ว — รอแอดมินตรวจสอบ
          </div>
          <label class="slip-upload-btn" :class="{ busy: uploadBusy }">
            <i class="ti ti-upload"></i>
            {{ uploadBusy ? 'กำลังอัปโหลด...' : (slipPreview ? 'เปลี่ยนรูปสลิป' : 'เลือกรูปสลิป') }}
            <input type="file" accept="image/*" class="hidden" :disabled="uploadBusy" @change="handleSlipFile" />
          </label>
          <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        </section>
      </template>

      <div v-else class="state-card">
        <i class="ti ti-calendar-off state-card-icon"></i>
        <p class="state-card-title">การจองนี้ไม่พร้อมรับการชำระ</p>
        <p class="state-card-sub">สถานะ: {{ booking.status }}</p>
      </div>
    </template>
  </main>
</template>

<style scoped>
.payment-page { padding: 0 0 var(--space-6); }
.page-header  { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--page-padding-x); }
.page-title   { font-size: var(--text-h2); font-weight: 700; margin: 0; }
.card         { margin: 0 var(--page-padding-x) var(--space-4); padding: var(--space-4); border-radius: var(--radius-card); background: var(--color-surface-elevated); box-shadow: var(--shadow-sm); }
.section-title { font-size: var(--text-h3); font-weight: 700; margin: 0 0 var(--space-3); }
.summary-rows  { display: flex; flex-direction: column; gap: var(--space-2); }
.summary-row   { display: flex; justify-content: space-between; font-size: var(--text-sm); }
.summary-label { color: var(--color-text-muted); }
.summary-total { border-top: 1px solid var(--color-border); padding-top: var(--space-2); font-weight: 700; }
.price         { color: var(--color-primary); font-size: var(--text-h3); }
.mono          { font-family: monospace; }
.qr-wrap   { display: flex; justify-content: center; margin-bottom: var(--space-2); }
.qr-img    { width: 200px; height: 200px; border-radius: var(--radius-md); }
.qr-amount { text-align: center; font-size: var(--text-h2); font-weight: 700; color: var(--color-primary); margin: 0; }
.qr-name   { text-align: center; font-size: var(--text-h3); font-weight: 600; color: var(--color-text); margin: var(--space-1) 0 0; }
.qr-id     { text-align: center; font-size: var(--text-sm); color: var(--color-text-muted); }
.qr-save-btn { display: flex; align-items: center; justify-content: center; gap: var(--space-2); width: 100%; margin-top: var(--space-3); }
.bank-info { display: flex; flex-direction: column; gap: var(--space-1); }
.bank-name, .bank-account-name { color: var(--color-text-secondary); margin: 0; }
.bank-account-no { font-size: var(--text-h3); font-weight: 700; font-family: monospace; margin: 0; }
.slip-preview { margin-bottom: var(--space-3); }
.slip-img     { max-width: 100%; max-height: 360px; border-radius: var(--radius-md); display: block; margin: 0 auto; }
.slip-upload-btn { display: flex; align-items: center; justify-content: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border: 2px dashed var(--color-border); border-radius: var(--radius-md); cursor: pointer; color: var(--color-primary); font-weight: 600; }
.slip-upload-btn.busy { opacity: 0.7; cursor: wait; }
.hidden       { display: none; }
.upload-success { display: flex; align-items: center; gap: var(--space-2); color: var(--color-success, green); font-weight: 600; }
.success-state { text-align: center; }
.stay-code-value {
  margin: var(--space-3) 0 0;
  font-size: clamp(0.95rem, 4.2vw, var(--text-h2));
  font-weight: 700;
  letter-spacing: 0.02em;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  overflow-wrap: anywhere;
  word-break: break-all;
  line-height: 1.35;
  padding: 0 var(--space-3);
}
.error-msg    { color: var(--color-danger); font-size: var(--text-sm); margin-top: var(--space-2); }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
