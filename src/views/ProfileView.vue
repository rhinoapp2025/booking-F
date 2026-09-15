<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useHotelRoute } from '../composables/useHotelRoute'
import { useCoupons } from '../composables/useCoupons'
import { useFeaturesStore } from '../stores/features'
import BottomNav from '../components/BottomNav.vue'
import AccountMenuDrawer from '../components/AccountMenuDrawer.vue'
import BookingPolicyNotes from '../components/BookingPolicyNotes.vue'
import {
  GUEST_NATIONS,
  GUEST_TITLES,
  guestProfileFromUser,
} from '../constants/guestProfile'
import api from '../api/axios'

const auth   = useAuthStore()
const router = useRouter()
const { hotelSlug, hotelPath } = useHotelRoute()
const accountMenuRef = ref(null)
const features = useFeaturesStore()
const {
  myCoupons,
  couponSettings,
  canRedeem,
  loadCouponSettings,
  loadMyCoupons,
  redeemCoupon,
} = useCoupons()
const points = computed(() => Number(auth.user?.total_points ?? 0))

const form = ref(guestProfileFromUser())
const saving         = ref(false)
const message        = ref('')
const errorMessage   = ref('')
const history        = ref([])
const loadingHistory = ref(false)

const showCredModal = ref(false)
const credSaving = ref(false)
const credError = ref('')
const credMessage = ref('')
const credForm = ref({
  login_id: '',
  current_password: '',
  password: '',
  password_confirm: '',
})

const canEditCredentials = computed(() => Boolean(auth.user?.can_edit_credentials))
const displayLoginId = computed(() => auth.user?.login_id || auth.user?.provider_id || '-')
const passwordMask = computed(() => (auth.user?.has_password ? '••••••••' : 'ยังไม่ได้ตั้ง'))

const initials = computed(() => {
  const n = displayLoginId.value || auth.user?.name || form.value.guest_first_name || ''
  return n.trim().charAt(0).toUpperCase() || '?'
})

function openCredModal() {
  if (!canEditCredentials.value) return
  credError.value = ''
  credMessage.value = ''
  credForm.value = {
    login_id: auth.user?.login_id || auth.user?.provider_id || '',
    current_password: '',
    password: '',
    password_confirm: '',
  }
  showCredModal.value = true
}

function closeCredModal() {
  showCredModal.value = false
}

async function saveCredentials() {
  if (credSaving.value) return
  credError.value = ''
  credMessage.value = ''
  const loginId = credForm.value.login_id.trim()
  if (!loginId) {
    credError.value = 'กรุณากรอกไอดี'
    return
  }
  if (credForm.value.password && credForm.value.password !== credForm.value.password_confirm) {
    credError.value = 'ยืนยันรหัสผ่านไม่ตรงกัน'
    return
  }
  if (auth.user?.has_password && !credForm.value.current_password) {
    credError.value = 'กรุณากรอกรหัสผ่านปัจจุบัน'
    return
  }
  const body = { login_id: loginId }
  if (auth.user?.has_password) body.current_password = credForm.value.current_password
  if (credForm.value.password) {
    body.password = credForm.value.password
    body.password_confirm = credForm.value.password_confirm
  }
  credSaving.value = true
  try {
    await api.patch('/api/auth/credentials', body)
    await auth.fetchMe()
    credMessage.value = 'บันทึกไอดี/รหัสผ่านแล้ว'
    showCredModal.value = false
  } catch (err) {
    credError.value = err?.response?.data?.error || 'บันทึกไม่สำเร็จ'
  } finally {
    credSaving.value = false
  }
}

function fillFromAuth() {
  form.value = guestProfileFromUser(auth.user || {})
}

async function saveProfile() {
  if (saving.value) return
  message.value      = ''
  errorMessage.value = ''
  if (!form.value.guest_first_name?.trim() || !form.value.guest_last_name?.trim()) {
    errorMessage.value = 'กรอกชื่อและนามสกุล'
    return
  }
  saving.value = true
  try {
    await api.patch('/api/auth/profile', {
      ...form.value,
      guest_first_name: form.value.guest_first_name.trim(),
      guest_last_name: form.value.guest_last_name.trim(),
      guest_phone: form.value.guest_phone || '',
      email: form.value.email || '',
    })
    await auth.fetchMe()
    fillFromAuth()
    message.value = 'บันทึกแล้ว'
  } catch (err) {
    errorMessage.value = err?.response?.data?.error || 'บันทึกไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

async function loadHistory() {
  loadingHistory.value = true
  try {
    const { data } = await api.get(`/api/bookings/${hotelSlug.value}/my`)
    history.value = data || []
  } finally {
    loadingHistory.value = false
  }
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
}

function statusLabel(s, booking) {
  if (s === 'awaiting_payment') {
    const total = Number(booking?.total_price) || 0
    const due = Number(booking?.deposit_amount) || 0
    return total > 0 && due >= total ? 'รอชำระเต็มจำนวน' : 'รอมัดจำ'
  }
  return { pending: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', checked_in: 'เช็คอินแล้ว', checked_out: 'เช็คเอาต์แล้ว', cancelled: 'ยกเลิก' }[s] || s
}

function logout() {
  auth.logout()
  router.replace(hotelPath('/login'))
}

watch(() => auth.user, () => fillFromAuth(), { immediate: true })

onMounted(() => {
  fillFromAuth()
  loadHistory()
  if (features.couponsEnabled) {
    loadCouponSettings()
    loadMyCoupons()
  }
})
</script>

<template>
  <div class="profile-page app-page">
    <AccountMenuDrawer ref="accountMenuRef" />

    <header class="page-header">
      <h1 class="page-title">โปรไฟล์</h1>
      <button class="icon-btn" @click="accountMenuRef?.open()">
        <i class="ti ti-user-circle"></i>
      </button>
    </header>

    <section class="card profile-card">
      <div class="avatar-wrap">
        <div class="avatar">{{ initials }}</div>
        <div class="avatar-info">
          <p class="avatar-name">{{ displayLoginId }}</p>
          <p class="avatar-provider muted">{{ passwordMask }}</p>
        </div>
        <div class="avatar-actions">
          <button
            v-if="canEditCredentials"
            type="button"
            class="icon-btn"
            title="แก้ไขไอดี / รหัสผ่าน"
            aria-label="แก้ไขไอดีและรหัสผ่าน"
            @click="openCredModal"
          >
            <i class="ti ti-pencil"></i>
          </button>
          <button
            type="button"
            class="icon-btn logout-icon-btn"
            title="ออกจากระบบ"
            aria-label="ออกจากระบบ"
            @click="logout"
          >
            <i class="ti ti-logout"></i>
          </button>
        </div>
      </div>

      <form class="profile-form guest-form" @submit.prevent="saveProfile">
        <p class="guest-form-title">ข้อมูลผู้เข้าพัก</p>
        <p class="guest-form-hint muted">ใช้กรอกอัตโนมัติตอนจองห้อง</p>

        <div class="form-row-inline">
          <div class="form-row">
            <label class="form-label">คำนำหน้า</label>
            <select v-model="form.guest_title" class="form-input">
              <option value="">เลือก</option>
              <option v-for="t in GUEST_TITLES" :key="t" :value="t">{{ t }}</option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-label">เพศ</label>
            <select v-model="form.guest_sex" class="form-input">
              <option value="">เลือก</option>
              <option value="male">ชาย</option>
              <option value="female">หญิง</option>
            </select>
          </div>
        </div>

        <div class="form-row-inline">
          <div class="form-row">
            <label class="form-label">ชื่อ <span class="req">*</span></label>
            <input v-model="form.guest_first_name" type="text" class="form-input" placeholder="ชื่อ" required />
          </div>
          <div class="form-row">
            <label class="form-label">นามสกุล <span class="req">*</span></label>
            <input v-model="form.guest_last_name" type="text" class="form-input" placeholder="นามสกุล" required />
          </div>
        </div>

        <div class="form-row-inline">
          <div class="form-row">
            <label class="form-label">สัญชาติ</label>
            <select v-model="form.guest_nation" class="form-input">
              <option v-for="n in GUEST_NATIONS" :key="n.code" :value="n.code">{{ n.name }}</option>
            </select>
          </div>
          <div class="form-row">
            <label class="form-label">วันเกิด</label>
            <input v-model="form.guest_birthday" type="date" class="form-input" />
          </div>
        </div>

        <div class="form-row-inline">
          <div class="form-row">
            <label class="form-label">เลขบัตรประชาชน</label>
            <input v-model="form.guest_national_id" type="text" class="form-input" maxlength="13" placeholder="เลข 13 หลัก" />
          </div>
          <div class="form-row">
            <label class="form-label">เลขพาสปอร์ต</label>
            <input v-model="form.guest_passport" type="text" class="form-input" placeholder="ถ้ามี" />
          </div>
        </div>

        <div class="form-row-inline">
          <div class="form-row">
            <label class="form-label">เบอร์โทรศัพท์</label>
            <input v-model="form.guest_phone" type="tel" class="form-input" placeholder="0812345678" />
          </div>
          <div class="form-row">
            <label class="form-label">ทะเบียนรถ</label>
            <input v-model="form.guest_car_no" type="text" class="form-input" placeholder="กก 1234" />
          </div>
        </div>

        <div class="form-row">
          <label class="form-label">อีเมล</label>
          <input v-model="form.email" type="email" class="form-input" placeholder="email@example.com" />
        </div>

        <div class="form-row">
          <label class="form-label">ที่อยู่ <span class="muted-hint">ไม่เกิน 60 ตัวอักษรต่อช่อง</span></label>
          <input v-model="form.guest_address1" type="text" class="form-input" maxlength="60" placeholder="ที่อยู่บรรทัด 1" />
        </div>
        <div class="form-row">
          <input v-model="form.guest_address2" type="text" class="form-input" maxlength="60" placeholder="ที่อยู่บรรทัด 2" />
        </div>
        <div class="form-row">
          <input v-model="form.guest_address3" type="text" class="form-input" maxlength="60" placeholder="ที่อยู่บรรทัด 3" />
        </div>

        <div class="form-row">
          <label class="form-label">ความต้องการพิเศษ</label>
          <textarea
            v-model="form.guest_special_requests"
            class="form-input"
            rows="2"
            placeholder="เช่น ห้องชั้นสูง ห้องไม่สูบบุหรี่"
          ></textarea>
        </div>

        <p v-if="message" class="success-msg">{{ message }}</p>
        <p v-if="errorMessage" class="error-msg">{{ errorMessage }}</p>
        <button type="submit" class="btn btn-primary" :disabled="saving">
          {{ saving ? 'กำลังบันทึก...' : 'บันทึก' }}
        </button>
      </form>
    </section>

    <section v-if="features.couponsEnabled" class="card loyalty-card">
      <h2 class="section-title">แต้ม / คูปอง</h2>
      <p class="loyalty-points">
        <strong>{{ points.toLocaleString('th-TH') }}</strong>
        <span class="muted">แต้มของโรงแรมนี้</span>
      </p>
      <p class="muted loyalty-hint">
        ใช้ {{ Number(couponSettings.requiredPoints).toLocaleString('th-TH') }} แต้ม
        แลกคูปองลด {{ couponSettings.discountPercent }}%
      </p>
      <div class="loyalty-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="!canRedeem"
          @click="redeemCoupon"
        >
          แลกคูปอง
        </button>
      </div>
      <div v-if="myCoupons.length" class="coupon-list">
        <p class="coupon-list-label">คูปองที่ใช้ได้</p>
        <div v-for="c in myCoupons" :key="c.id" class="coupon-item">
          <strong class="mono">{{ c.coupon_code }}</strong>
          <span>ลด {{ c.discount_percent }}%</span>
        </div>
      </div>
      <p v-else class="muted loyalty-empty">ยังไม่มีคูปองของโรงแรมนี้</p>
    </section>

    <section class="booking-history">
      <h2 class="section-title">ประวัติการจอง</h2>
      <div v-if="loadingHistory" class="state-card">
        <i class="ti ti-loader-2 state-card-icon spin"></i>
      </div>
      <div v-else-if="!history.length" class="state-card">
        <i class="ti ti-calendar-off state-card-icon"></i>
        <p class="state-card-title">ยังไม่มีประวัติการจอง</p>
      </div>
      <div v-else class="history-list">
        <div v-for="b in history" :key="b.id" class="card history-card">
          <div class="history-header">
            <span :class="['history-status', `status-${b.status}`]">{{ statusLabel(b.status, b) }}</span>
            <span class="history-id muted mono">#{{ b.id.slice(0, 8) }}</span>
          </div>
          <p class="history-dates">{{ formatDate(b.check_in_date) }} → {{ formatDate(b.check_out_date) }}</p>
          <p class="history-price">฿{{ Number(b.total_price).toLocaleString() }}</p>
          <p v-if="b.pms_ota_booking_no" class="stay-code-line">
            เลขจองเข้าพัก <span class="mono">{{ b.pms_ota_booking_no }}</span>
          </p>
          <BookingPolicyNotes
            :cancellation-policy="b.cancellation_policy"
            :non-smoking="Boolean(b.non_smoking)"
            :non-smoking-fine="b.non_smoking_fine"
          />
        </div>
      </div>
    </section>

    <BottomNav active="profile" />

    <div v-if="showCredModal" class="cred-backdrop" @click.self="closeCredModal">
      <div class="cred-modal card" role="dialog" aria-modal="true" aria-labelledby="cred-title">
        <div class="cred-modal-head">
          <h2 id="cred-title" class="cred-title">แก้ไขไอดี / รหัสผ่าน</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" @click="closeCredModal">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <form class="cred-form" @submit.prevent="saveCredentials">
          <div class="form-row">
            <label class="form-label">ไอดี</label>
            <input v-model="credForm.login_id" type="text" class="form-input" autocomplete="username" required />
          </div>
          <div v-if="auth.user?.has_password" class="form-row">
            <label class="form-label">รหัสผ่านปัจจุบัน</label>
            <input
              v-model="credForm.current_password"
              type="password"
              class="form-input"
              autocomplete="current-password"
              required
            />
          </div>
          <div class="form-row">
            <label class="form-label">รหัสผ่านใหม่ <span class="muted-hint">(ว่างไว้ถ้าไม่เปลี่ยน)</span></label>
            <input
              v-model="credForm.password"
              type="password"
              class="form-input"
              autocomplete="new-password"
              placeholder="อย่างน้อย 4 ตัวอักษร"
            />
          </div>
          <div class="form-row">
            <label class="form-label">ยืนยันรหัสผ่านใหม่</label>
            <input
              v-model="credForm.password_confirm"
              type="password"
              class="form-input"
              autocomplete="new-password"
            />
          </div>
          <p v-if="credMessage" class="success-msg">{{ credMessage }}</p>
          <p v-if="credError" class="error-msg">{{ credError }}</p>
          <div class="cred-actions">
            <button type="button" class="btn btn-outline" @click="closeCredModal">ยกเลิก</button>
            <button type="submit" class="btn btn-primary" :disabled="credSaving">
              {{ credSaving ? 'กำลังบันทึก...' : 'บันทึก' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.profile-page { padding-bottom: calc(var(--bottom-nav-height, 64px) + var(--space-4)); }
.page-header  { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--page-padding-x); }
.page-title   { font-size: var(--text-h1); font-weight: 700; margin: 0; }
.profile-card { margin: 0 var(--page-padding-x) var(--space-4); padding: var(--space-4); }
.loyalty-card { margin: 0 var(--page-padding-x) var(--space-4); padding: var(--space-4); }
.loyalty-points { display: flex; align-items: baseline; gap: var(--space-2); margin: 0 0 var(--space-2); font-size: var(--text-h2); }
.loyalty-hint, .loyalty-empty { margin: 0 0 var(--space-3); font-size: var(--text-sm); }
.loyalty-actions { display: flex; gap: var(--space-2); margin-bottom: var(--space-3); }
.coupon-list { display: flex; flex-direction: column; gap: var(--space-2); }
.coupon-list-label { margin: 0; font-size: var(--text-label); font-weight: 600; color: var(--color-text-secondary); }
.coupon-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
}
.avatar-wrap  { display: flex; align-items: center; gap: var(--space-3); margin-bottom: var(--space-4); }
.avatar       { width: 60px; height: 60px; border-radius: 50%; background: var(--color-accent-light); color: var(--color-accent); display: flex; align-items: center; justify-content: center; font-size: 1.5rem; font-weight: 700; flex-shrink: 0; }
.avatar-info  { min-width: 0; flex: 1; }
.avatar-name  { font-weight: 700; margin: 0; overflow-wrap: anywhere; }
.avatar-provider { margin: 0; font-size: var(--text-sm); letter-spacing: 0.08em; }
.avatar-actions { display: flex; align-items: center; gap: var(--space-1); flex-shrink: 0; }
.logout-icon-btn { color: var(--color-danger, #c0392b); }
.profile-form { display: flex; flex-direction: column; gap: var(--space-3); }
.guest-form-title { margin: 0; font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); }
.guest-form-hint { margin: calc(var(--space-1) * -1) 0 0; font-size: var(--text-label); }
.form-row-inline { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.form-row     { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; }
.form-label   { font-size: var(--text-label); font-weight: 500; color: var(--color-text-secondary); }
.form-input   { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: inherit; font-size: var(--text-sm); background: #fff; width: 100%; box-sizing: border-box; }
.req { color: var(--color-danger, #c0392b); }
.muted-hint { font-weight: 400; color: var(--color-text-secondary); }
.success-msg  { color: var(--color-success, green); font-size: var(--text-sm); }
.error-msg    { color: var(--color-danger); font-size: var(--text-sm); }
.booking-history { padding: 0 var(--page-padding-x) var(--space-4); }
.section-title { font-size: var(--text-h3); font-weight: 700; margin: 0 0 var(--space-3); }
.history-list { display: flex; flex-direction: column; gap: var(--space-2); }
.history-card { padding: var(--space-3); }
.history-header { display: flex; justify-content: space-between; margin-bottom: var(--space-1); }
.history-status { font-size: var(--text-label); font-weight: 600; padding: 2px var(--space-2); border-radius: var(--radius-pill); }
.status-awaiting_payment { background: #fff3cd; color: #856404; }
.status-pending    { background: #cce5ff; color: #004085; }
.status-confirmed  { background: #d4edda; color: #155724; }
.status-checked_in { background: #d1ecf1; color: #0c5460; }
.status-checked_out { background: #e2e3e5; color: #383d41; }
.status-cancelled  { background: #f8d7da; color: #721c24; }
.history-id    { font-size: var(--text-label); }
.history-dates { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0 0 var(--space-1); }
.history-price { font-weight: 700; margin: 0; }
.stay-code-line { margin: var(--space-1) 0 0; font-size: var(--text-sm); color: var(--color-text-secondary); overflow-wrap: anywhere; word-break: break-all; }
.mono { font-family: monospace; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 420px) {
  .form-row-inline { grid-template-columns: 1fr; }
}
.cred-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: var(--space-4);
}
.cred-modal {
  width: min(100%, 420px);
  max-height: min(90vh, 640px);
  overflow: auto;
  padding: var(--space-4);
  margin-bottom: env(safe-area-inset-bottom, 0);
}
.cred-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.cred-title { margin: 0; font-size: var(--text-h3); font-weight: 700; }
.cred-form { display: flex; flex-direction: column; gap: var(--space-3); }
.cred-actions { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
@media (min-width: 600px) {
  .cred-backdrop { align-items: center; }
}
</style>
