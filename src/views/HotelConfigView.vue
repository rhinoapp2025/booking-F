<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useHotelRoute } from '../composables/useHotelRoute'
import { useHotelStore } from '../stores/hotel'
import { useFeaturesStore } from '../stores/features'
import { useUiSettingsStore } from '../stores/uiSettings'
import api from '../api/axios'
import { compressImage } from '../utils/compressChatImage'
import { apiMediaUrl } from '../utils/resolveUiImageUrl'
import { DEFAULT_THEME, fontOptions, applyHotelTheme } from '../utils/applyHotelTheme'
import { LOCATION_TYPE_OPTIONS as DEFAULT_LOCATION_TYPE_OPTIONS } from '../constants/hotelLocationTypes'
import BottomNav from '../components/BottomNav.vue'
import HotelAdminsPanel from '../components/HotelAdminsPanel.vue'

const { hotelSlug, hotelPath } = useHotelRoute()
const hotelStore = useHotelStore()
const features = useFeaturesStore()
const uiSettings = useUiSettingsStore()

const FONT_OPTIONS = fontOptions()
const FONT_SIZE_OPTIONS = [
  { id: 'sm', label: 'เล็ก' },
  { id: 'md', label: 'ปกติ' },
  { id: 'lg', label: 'ใหญ่' },
  { id: 'xl', label: 'ใหญ่มาก' },
]
const COLOR_PRESETS = ['#001529', '#1A56DB', '#0F766E', '#C9A227', '#C4847A', '#1F2937']
const BG_PRESETS = ['#F0F2F5', '#FFFFFF', '#F4F4F5', '#EEF4FF', '#111827', '#1C1917']
const HEX_COLOR_RE = /^#([0-9A-Fa-f]{6})$/

const COUPON_SETTING_KEYS = [
  'coupon_discount_percent',
  'coupon_required_points',
  'coupon_completion_points',
]

const loading = ref(true)
const saving = ref(false)
const message = ref('')
const errorMsg = ref('')
const locationTypeOptions = ref([...DEFAULT_LOCATION_TYPE_OPTIONS])
const logoUrl = ref('')
const loginImageUrl = ref('')
const uploadingKind = ref('')
const tab = ref('info')
const logoFileRef = ref(null)
const heroFileRef = ref(null)

const tabs = computed(() => {
  const items = [
    { id: 'info', label: 'ข้อมูล' },
    { id: 'ui', label: 'UI' },
    { id: 'brand', label: 'รูปภาพ' },
    { id: 'location', label: 'ที่ตั้ง' },
    { id: 'payment', label: 'ชำระเงิน' },
    { id: 'booking', label: 'การจอง' },
  ]
  if (features.couponsEnabled) items.push({ id: 'coupons', label: 'คูปอง' })
  items.push({ id: 'admins', label: 'แอดมิน' })
  return items
})

watch(
  () => features.couponsEnabled,
  (on) => {
    if (!on && tab.value === 'coupons') tab.value = 'info'
  }
)

const hotel = reactive({
  name: '',
  description: '',
  address: '',
  city: '',
  province: '',
  country: 'Thailand',
  phone: '',
  email: '',
  line_url: '',
  star_rating: '',
  check_in_time: '14:00',
  check_out_time: '12:00',
  map_url: '',
  map_embed_url: '',
  location_type: '',
  about_hotel: '',
  is_active: true,
})

const settings = reactive({
  promptpay_number: '',
  bank_name: '',
  bank_account_name: '',
  bank_account_no: '',
  deposit_percent: '30',
  payment_collect_mode: 'deposit',
  service_charge_percent: '0',
  vat_percent: '0',
  auto_cancel_hours: '24',
  unpaid_auto_cancel_enabled: 'true',
  cancellation_policy: '',
  non_smoking: 'false',
  non_smoking_fine: '0',
  require_id_card: 'false',
  book_advance_days: '90',
  coupon_discount_percent: '10',
  coupon_required_points: '100',
  coupon_completion_points: '5',
  ui_color_primary: DEFAULT_THEME.ui_color_primary,
  ui_color_text: DEFAULT_THEME.ui_color_text,
  ui_color_background: DEFAULT_THEME.ui_color_background,
  ui_font_family: DEFAULT_THEME.ui_font_family,
  ui_font_size: DEFAULT_THEME.ui_font_size,
})

const collectFull = computed(() => settings.payment_collect_mode === 'full')

const themeDraft = computed(() => ({
  ui_color_primary: settings.ui_color_primary,
  ui_color_text: settings.ui_color_text,
  ui_color_background: settings.ui_color_background,
  ui_font_family: settings.ui_font_family,
  ui_font_size: settings.ui_font_size,
}))

function snapshotTheme() {
  return { ...themeDraft.value }
}

let savedTheme = snapshotTheme()

watch(themeDraft, (theme) => {
  if (
    !HEX_COLOR_RE.test(theme.ui_color_primary)
    || !HEX_COLOR_RE.test(theme.ui_color_text)
    || !HEX_COLOR_RE.test(theme.ui_color_background)
  ) return
  applyHotelTheme(theme)
}, { deep: true })

function setThemeColor(key, value) {
  const hex = String(value || '').trim()
  if (!HEX_COLOR_RE.test(hex)) return
  settings[key] = hex.toUpperCase()
}

function resetTheme() {
  settings.ui_color_primary = DEFAULT_THEME.ui_color_primary
  settings.ui_color_text = DEFAULT_THEME.ui_color_text
  settings.ui_color_background = DEFAULT_THEME.ui_color_background
  settings.ui_font_family = DEFAULT_THEME.ui_font_family
  settings.ui_font_size = DEFAULT_THEME.ui_font_size
}

onUnmounted(() => {
  applyHotelTheme(savedTheme)
})

function setCollectMode(mode) {
  settings.payment_collect_mode = mode === 'full' ? 'full' : 'deposit'
}

function assignHotel(src = {}) {
  for (const key of Object.keys(hotel)) {
    if (src[key] === undefined || src[key] === null) {
      if (key === 'location_type' || key === 'about_hotel' || key === 'line_url') hotel[key] = ''
      else if (key === 'star_rating') hotel[key] = ''
      continue
    }
    hotel[key] = src[key]
  }
  hotel.is_active = src.is_active !== false
  hotel.location_type = String(src.location_type || '')
  hotel.about_hotel = String(src.about_hotel || '')
  hotel.line_url = String(src.line_url || '')
  hotel.star_rating = src.star_rating == null || src.star_rating === '' ? '' : Number(src.star_rating)
}

function assignSettings(src = {}) {
  for (const key of Object.keys(settings)) {
    if (src[key] === undefined || src[key] === null) continue
    settings[key] = String(src[key])
  }
}

async function loadConfig() {
  loading.value = true
  errorMsg.value = ''
  logoUrl.value = ''
  loginImageUrl.value = ''
  try {
    const { data } = await api.get(`/api/admin/${hotelSlug.value}/config`)
    assignHotel(data.hotel || {})
    assignSettings(data.settings || {})
    if (data.hotel?.theme) assignSettings(data.hotel.theme)
    locationTypeOptions.value = data.hotel?.catalog_options?.location_types?.length
      ? data.hotel.catalog_options.location_types
      : [...DEFAULT_LOCATION_TYPE_OPTIONS]
    savedTheme = snapshotTheme()
    applyHotelTheme(savedTheme)
    logoUrl.value = apiMediaUrl(data.hotel?.logo_url)
    loginImageUrl.value = apiMediaUrl(data.hotel?.login_image_url)
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'โหลดการตั้งค่าไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

async function saveConfig() {
  saving.value = true
  message.value = ''
  errorMsg.value = ''
  try {
    const settingsPayload = { ...settings }
    settingsPayload.payment_collect_mode = collectFull.value ? 'full' : 'deposit'
    if (!features.couponsEnabled) {
      for (const key of COUPON_SETTING_KEYS) delete settingsPayload[key]
    }
    const payload = {
      hotel: {
        ...hotel,
        star_rating: hotel.star_rating ? Number(hotel.star_rating) : null,
      },
      settings: settingsPayload,
    }
    const { data } = await api.patch(`/api/admin/${hotelSlug.value}/config`, payload)
    assignHotel(data.hotel || {})
    assignSettings(data.settings || {})
    if (data.hotel) {
      hotelStore.hotel = {
        ...hotelStore.hotel,
        ...data.hotel,
        cancellation_policy: data.settings?.cancellation_policy || '',
        non_smoking: data.settings?.non_smoking === 'true',
        non_smoking_fine: Number(data.settings?.non_smoking_fine) || 0,
        logo_url: data.hotel?.logo_url || hotelStore.hotel?.logo_url || '',
        login_image_url: data.hotel?.login_image_url || hotelStore.hotel?.login_image_url || '',
        theme: data.hotel?.theme || hotelStore.hotel?.theme,
      }
    }
    savedTheme = snapshotTheme()
    uiSettings.applyFromHotel(hotelStore.hotel)
    logoUrl.value = apiMediaUrl(data.hotel?.logo_url || logoUrl.value)
    loginImageUrl.value = apiMediaUrl(data.hotel?.login_image_url || loginImageUrl.value)
    message.value = 'บันทึกแล้ว'
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'บันทึกไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

async function uploadBrandImage(kind, event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  uploadingKind.value = kind
  errorMsg.value = ''
  try {
    const compressed = await compressImage(file, {
      maxWidth: kind === 'logo' ? 800 : 1400,
      quality: 0.86,
    })
    const { data } = await api.post(`/api/admin/${hotelSlug.value}/ui-image`, {
      kind,
      imageData: compressed.base64,
      imageMime: compressed.mime,
    })
    const url = apiMediaUrl(data.url)
    if (kind === 'logo') logoUrl.value = url
    else loginImageUrl.value = url
    if (hotelStore.hotel) {
      hotelStore.hotel = {
        ...hotelStore.hotel,
        logo_url: kind === 'logo' ? data.url : hotelStore.hotel.logo_url,
        login_image_url: kind === 'hero' ? data.url : hotelStore.hotel.login_image_url,
      }
    }
    message.value = kind === 'logo' ? 'อัปโหลดโลโก้แล้ว' : 'อัปโหลดรูปหน้าล็อกอินแล้ว'
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || err?.message || 'อัปโหลดรูปไม่สำเร็จ'
  } finally {
    uploadingKind.value = ''
  }
}

async function removeBrandImage(kind) {
  uploadingKind.value = kind
  errorMsg.value = ''
  try {
    await api.delete(`/api/admin/${hotelSlug.value}/ui-image/${kind}`)
    if (kind === 'logo') logoUrl.value = ''
    else loginImageUrl.value = ''
    if (hotelStore.hotel) {
      hotelStore.hotel = {
        ...hotelStore.hotel,
        logo_url: kind === 'logo' ? '' : hotelStore.hotel.logo_url,
        login_image_url: kind === 'hero' ? '' : hotelStore.hotel.login_image_url,
      }
    }
    message.value = 'ลบรูปแล้ว'
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'ลบรูปไม่สำเร็จ'
  } finally {
    uploadingKind.value = ''
  }
}

watch(hotelSlug, () => {
  loadConfig()
}, { immediate: true })
</script>

<template>
  <div class="config-page app-page app-page--admin">
    <header class="page-header">
      <router-link :to="hotelPath('/admin')" class="icon-btn admin-back-btn" title="กลับแอดมิน">
        <i class="ti ti-arrow-left"></i>
        <span class="admin-back-label">กลับแอดมิน</span>
      </router-link>
      <h1 class="page-title">ตั้งค่าโรงแรม</h1>
      <span class="header-spacer"></span>
    </header>

    <div v-if="loading" class="state-card">
      <i class="ti ti-loader-2 state-card-icon spin"></i>
      <p class="state-card-title">กำลังโหลด...</p>
    </div>

    <form v-else class="config-body" @submit.prevent="saveConfig">
      <div class="tab-bar" role="tablist" aria-label="หมวดตั้งค่าโรงแรม">
        <button
          v-for="item in tabs"
          :key="item.id"
          type="button"
          class="tab-btn"
          :class="{ active: tab === item.id }"
          role="tab"
          :aria-selected="tab === item.id"
          @click="tab = item.id"
        >
          {{ item.label }}
        </button>
      </div>

      <p v-if="message" class="success-msg">{{ message }}</p>
      <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

      <section v-show="tab === 'info'" class="card config-card">
        <h2 class="info-title">ข้อมูลโรงแรม</h2>
        <div class="form-row">
          <label class="form-label">ชื่อโรงแรม</label>
          <input v-model="hotel.name" class="form-input" required />
        </div>
        <div class="form-row">
          <label class="form-label">คำอธิบาย</label>
          <textarea v-model="hotel.description" class="form-input" rows="3" />
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">โทรศัพท์</label>
            <input v-model="hotel.phone" class="form-input" type="tel" />
          </div>
          <div class="form-row">
            <label class="form-label">อีเมล</label>
            <input v-model="hotel.email" class="form-input" type="email" />
          </div>
          <div class="form-row">
            <label class="form-label">ระดับดาว</label>
            <input
              v-model="hotel.star_rating"
              class="form-input"
              type="number"
              min="1"
              max="1000"
              placeholder="ว่าง = ไม่แสดง"
            />
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">ลิงก์ LINE</label>
          <input
            v-model="hotel.line_url"
            class="form-input"
            type="url"
            placeholder="https://lin.ee/... หรือ https://line.me/..."
          />
          <span class="form-hint">แสดงในหน้าที่ตั้งของแขก — ว่าง = ไม่แสดง</span>
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">เวลาเช็คอิน</label>
            <input v-model="hotel.check_in_time" class="form-input" type="time" />
          </div>
          <div class="form-row">
            <label class="form-label">เวลาเช็คเอาต์</label>
            <input v-model="hotel.check_out_time" class="form-input" type="time" />
          </div>
        </div>
        <label class="toggle-label">
          <input
            type="checkbox"
            class="toggle-input"
            :checked="hotel.is_active"
            @change="hotel.is_active = $event.target.checked"
          />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
          เปิดให้จอง (โรงแรมใช้งานอยู่)
        </label>
      </section>

      <section v-show="tab === 'ui'" class="card config-card">
        <h2 class="info-title">สีและตัวอักษร</h2>
        <p class="muted">ใช้กับทั้งแอปของสาขานี้ — พื้นหลัง ปุ่ม แท็บ หัวข้อ และข้อความ</p>

        <div class="theme-preview">
          <strong class="theme-preview-title">จองห้องพัก</strong>
          <p class="theme-preview-body">ตัวอย่างข้อความในแอป</p>
          <span class="theme-preview-btn">ปุ่มหลัก</span>
        </div>

        <div class="form-row">
          <label class="form-label">สีแอป</label>
          <div class="color-field">
            <input
              class="color-swatch"
              type="color"
              :value="settings.ui_color_primary"
              @input="setThemeColor('ui_color_primary', $event.target.value)"
            />
            <input
              v-model="settings.ui_color_primary"
              class="form-input color-hex"
              maxlength="7"
              spellcheck="false"
              @change="setThemeColor('ui_color_primary', settings.ui_color_primary)"
            />
          </div>
          <div class="color-presets">
            <button
              v-for="hex in COLOR_PRESETS"
              :key="hex"
              type="button"
              class="color-preset"
              :class="{ active: settings.ui_color_primary.toUpperCase() === hex }"
              :style="{ background: hex }"
              :title="hex"
              @click="setThemeColor('ui_color_primary', hex)"
            />
          </div>
        </div>

        <div class="form-row">
          <label class="form-label">สีพื้นหลังแอพ</label>
          <div class="color-field">
            <input
              class="color-swatch"
              type="color"
              :value="settings.ui_color_background"
              @input="setThemeColor('ui_color_background', $event.target.value)"
            />
            <input
              v-model="settings.ui_color_background"
              class="form-input color-hex"
              maxlength="7"
              spellcheck="false"
              @change="setThemeColor('ui_color_background', settings.ui_color_background)"
            />
          </div>
          <div class="color-presets">
            <button
              v-for="hex in BG_PRESETS"
              :key="hex"
              type="button"
              class="color-preset"
              :class="{ active: settings.ui_color_background.toUpperCase() === hex }"
              :style="{ background: hex }"
              :title="hex"
              @click="setThemeColor('ui_color_background', hex)"
            />
          </div>
        </div>

        <div class="form-row">
          <label class="form-label">สีตัวอักษร</label>
          <div class="color-field">
            <input
              class="color-swatch"
              type="color"
              :value="settings.ui_color_text"
              @input="setThemeColor('ui_color_text', $event.target.value)"
            />
            <input
              v-model="settings.ui_color_text"
              class="form-input color-hex"
              maxlength="7"
              spellcheck="false"
              @change="setThemeColor('ui_color_text', settings.ui_color_text)"
            />
          </div>
        </div>

        <div class="form-row">
          <label class="form-label">ชนิดตัวอักษร</label>
          <select v-model="settings.ui_font_family" class="form-input">
            <option v-for="font in FONT_OPTIONS" :key="font.id" :value="font.id">{{ font.label }}</option>
          </select>
        </div>

        <div class="form-row">
          <label class="form-label">ขนาดตัวอักษร</label>
          <div class="mode-slide mode-slide--4" role="tablist" aria-label="ขนาดตัวอักษร">
            <button
              v-for="item in FONT_SIZE_OPTIONS"
              :key="item.id"
              type="button"
              class="mode-slide-btn"
              :class="{ active: settings.ui_font_size === item.id }"
              role="tab"
              :aria-selected="settings.ui_font_size === item.id"
              @click="settings.ui_font_size = item.id"
            >{{ item.label }}</button>
          </div>
        </div>

        <button class="btn btn-outline" type="button" @click="resetTheme">คืนค่าเริ่มต้น</button>
      </section>

      <section v-show="tab === 'brand'" class="card config-card">
        <h2 class="info-title">โลโก้และรูปโรงแรม</h2>
        <p class="muted">รูปนี้แยกตามสาขาที่กำลังตั้งค่า — โลโก้แสดงบนแอป รูปโรงแรมใช้หน้าล็อกอินและการ์ดหน้ารวม</p>
        <div class="brand-upload-grid">
          <div class="form-row">
            <label class="form-label">โลโก้</label>
            <img v-if="logoUrl" :src="logoUrl" alt="โลโก้" class="brand-preview brand-preview--logo" />
            <div class="brand-upload-actions">
              <input
                ref="logoFileRef"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                class="hidden-file"
                :disabled="Boolean(uploadingKind)"
                @change="uploadBrandImage('logo', $event)"
              />
              <button
                class="btn btn-outline"
                type="button"
                :disabled="Boolean(uploadingKind)"
                @click="logoFileRef?.click()"
              >
                {{ uploadingKind === 'logo' ? 'กำลังอัปโหลด...' : 'อัปโหลดโลโก้' }}
              </button>
              <button
                v-if="logoUrl"
                class="btn btn-outline"
                type="button"
                :disabled="Boolean(uploadingKind)"
                @click="removeBrandImage('logo')"
              >
                ลบ
              </button>
            </div>
          </div>
          <div class="form-row">
            <label class="form-label">รูปโรงแรม / หน้าล็อกอิน</label>
            <img v-if="loginImageUrl" :src="loginImageUrl" alt="รูปโรงแรม" class="brand-preview brand-preview--hero" />
            <div class="brand-upload-actions">
              <input
                ref="heroFileRef"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                class="hidden-file"
                :disabled="Boolean(uploadingKind)"
                @change="uploadBrandImage('hero', $event)"
              />
              <button
                class="btn btn-outline"
                type="button"
                :disabled="Boolean(uploadingKind)"
                @click="heroFileRef?.click()"
              >
                {{ uploadingKind === 'hero' ? 'กำลังอัปโหลด...' : 'อัปโหลดรูป' }}
              </button>
              <button
                v-if="loginImageUrl"
                class="btn btn-outline"
                type="button"
                :disabled="Boolean(uploadingKind)"
                @click="removeBrandImage('hero')"
              >
                ลบ
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-show="tab === 'location'" class="card config-card">
        <h2 class="info-title">สถานที่</h2>
        <p class="muted">แขกจะเห็นที่อยู่และแผนที่จากปุ่มที่ตั้งในเมนูล่าง</p>
        <div class="form-row">
          <label class="form-label">ลักษณะที่ตั้ง</label>
          <select v-model="hotel.location_type" class="form-input">
            <option value="">— เลือก —</option>
            <option
              v-for="opt in locationTypeOptions"
              :key="opt.value"
              :value="opt.value"
            >{{ opt.label }}</option>
          </select>
        </div>
        <div class="form-row">
          <label class="form-label">ที่อยู่</label>
          <textarea v-model="hotel.address" class="form-input" rows="2" placeholder="เลขที่ ถนน แขวง/ตำบล" />
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">เมือง</label>
            <input v-model="hotel.city" class="form-input" />
          </div>
          <div class="form-row">
            <label class="form-label">จังหวัด</label>
            <input v-model="hotel.province" class="form-input" />
          </div>
          <div class="form-row">
            <label class="form-label">ประเทศ</label>
            <input v-model="hotel.country" class="form-input" />
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">
            ลิงก์ Google Maps
            <span class="form-hint">เปิดแอปหรือเว็บ Google Maps → แชร์ → คัดลอกลิงก์ แล้ววางที่นี่</span>
          </label>
          <textarea
            v-model="hotel.map_url"
            class="form-input"
            rows="2"
            placeholder="https://maps.app.goo.gl/..."
          />
        </div>
        <div class="form-row">
          <label class="form-label">
            เกี่ยวกับโรงแรม
            <span class="form-hint">ข้อความนี้จะแสดงด้านล่างสุดในหน้าที่ตั้งของแขก</span>
          </label>
          <textarea
            v-model="hotel.about_hotel"
            class="form-input"
            rows="5"
            placeholder="แนะนำโรงแรม สิ่งอำนวยความสะดวก หรือข้อมูลที่แขกควรรู้"
          />
        </div>
      </section>

      <section v-show="tab === 'payment'" class="card config-card">
        <h2 class="info-title">การชำระเงิน</h2>
        <p class="muted">ใช้บนหน้าชำระเงินของแขก — PromptPay QR และบัญชีโอนเงิน</p>
        <div class="form-row">
          <label class="form-label">ยอดที่เก็บจากแขกตอนจอง</label>
          <div class="mode-slide" role="tablist" aria-label="เลือกเก็บมัดจำหรือเต็มจำนวน">
            <button
              type="button"
              class="mode-slide-btn"
              :class="{ active: !collectFull }"
              role="tab"
              :aria-selected="!collectFull"
              @click="setCollectMode('deposit')"
            >เก็บมัดจำ</button>
            <button
              type="button"
              class="mode-slide-btn"
              :class="{ active: collectFull }"
              role="tab"
              :aria-selected="collectFull"
              @click="setCollectMode('full')"
            >เก็บเต็มจำนวน</button>
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">
            PromptPay
            <span class="form-hint">เบอร์โทรหรือเลขบัตรประชาชน</span>
          </label>
          <input v-model="settings.promptpay_number" class="form-input" placeholder="0812345678" />
        </div>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">ธนาคาร</label>
            <input v-model="settings.bank_name" class="form-input" placeholder="เช่น กสิกรไทย" />
          </div>
          <div class="form-row">
            <label class="form-label">ชื่อบัญชี</label>
            <input v-model="settings.bank_account_name" class="form-input" />
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">เลขบัญชี</label>
          <input v-model="settings.bank_account_no" class="form-input" />
        </div>
        <div class="form-grid">
          <div v-if="!collectFull" class="form-row">
            <label class="form-label">มัดจำ (%)</label>
            <input v-model="settings.deposit_percent" class="form-input" type="number" min="0" max="100" />
          </div>
          <div class="form-row">
            <label class="form-label">ยกเลิกอัตโนมัติ (ชม.)</label>
            <input v-model="settings.auto_cancel_hours" class="form-input" type="number" min="1" max="168" />
          </div>
        </div>
        <div v-if="collectFull" class="form-grid">
          <div class="form-row">
            <label class="form-label">Service Charge (%)</label>
            <input v-model="settings.service_charge_percent" class="form-input" type="number" min="0" max="100" step="0.01" />
            <span class="form-hint">คิดจากยอดห้อง + อาหารเช้า ในหน้าจองเมื่อเก็บเต็มจำนวน</span>
          </div>
          <div class="form-row">
            <label class="form-label">VAT (%)</label>
            <input v-model="settings.vat_percent" class="form-input" type="number" min="0" max="100" step="0.01" />
            <span class="form-hint">คิดจากยอดรวมค่าบริการ (ห้อง + อาหารเช้า + Service Charge)</span>
          </div>
        </div>
        <label class="toggle-label">
          <input
            type="checkbox"
            class="toggle-input"
            :checked="settings.unpaid_auto_cancel_enabled === 'true'"
            @change="settings.unpaid_auto_cancel_enabled = $event.target.checked ? 'true' : 'false'"
          />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
          {{ collectFull ? 'ยกเลิกการจองอัตโนมัติถ้าไม่ชำระเงิน' : 'ยกเลิกการจองอัตโนมัติถ้าไม่โอนมัดจำ' }}
        </label>
      </section>

      <section v-show="tab === 'booking'" class="card config-card">
        <h2 class="info-title">การจอง</h2>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">จองล่วงหน้าได้สูงสุด (วัน)</label>
            <input v-model="settings.book_advance_days" class="form-input" type="number" min="1" max="365" />
          </div>
        </div>
        <div class="form-row">
          <label class="form-label">นโยบายยกเลิก</label>
          <textarea
            v-model="settings.cancellation_policy"
            class="form-input"
            rows="4"
            placeholder="เช่น ยกเลิกฟรีภายใน 24 ชั่วโมงก่อนเช็คอิน"
          />
        </div>
        <label class="toggle-label">
          <input
            type="checkbox"
            class="toggle-input"
            :checked="settings.non_smoking === 'true'"
            @change="settings.non_smoking = $event.target.checked ? 'true' : 'false'"
          />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
          Non smoking / ปลอดบุหรี่
        </label>
        <div v-if="settings.non_smoking === 'true'" class="form-row">
          <label class="form-label">ค่าปรับหากสูบบุหรี่ (บาท)</label>
          <input
            v-model="settings.non_smoking_fine"
            class="form-input"
            type="number"
            min="0"
            step="1"
            placeholder="เช่น 5000"
          />
        </div>
        <label class="toggle-label">
          <input
            type="checkbox"
            class="toggle-input"
            :checked="settings.require_id_card === 'true'"
            @change="settings.require_id_card = $event.target.checked ? 'true' : 'false'"
          />
          <span class="toggle-track"><span class="toggle-thumb"></span></span>
          ต้องยืนยันบัตรประชาชนตอนเช็คอิน
        </label>
      </section>

      <section v-show="features.couponsEnabled && tab === 'coupons'" class="card config-card">
        <h2 class="info-title">คูปอง / แต้ม</h2>
        <p class="muted">แต้มและคูปองแยกตามโรงแรมนี้ ไม่ใช้ร่วมกับสาขาอื่น — แขกสะสมแต้มเมื่อเช็คเอาต์ แล้วแลกเป็นคูปองส่วนลด</p>
        <div class="form-grid">
          <div class="form-row">
            <label class="form-label">ส่วนลดคูปอง (%)</label>
            <input v-model="settings.coupon_discount_percent" class="form-input" type="number" min="1" max="100" />
          </div>
          <div class="form-row">
            <label class="form-label">แต้มที่ใช้แลก</label>
            <input v-model="settings.coupon_required_points" class="form-input" type="number" min="1" />
          </div>
          <div class="form-row">
            <label class="form-label">แต้มที่ได้เมื่อเช็คเอาต์</label>
            <input v-model="settings.coupon_completion_points" class="form-input" type="number" min="0" />
          </div>
        </div>
      </section>

      <section v-show="tab === 'admins'" class="card config-card">
        <h2 class="info-title">แอดมินสาขานี้</h2>
        <HotelAdminsPanel :endpoint="`/api/admin/${hotelSlug}/admins`" />
      </section>

      <div v-show="tab !== 'admins'" class="config-save-bar">
        <button class="btn btn-primary save-btn" type="submit" :disabled="saving">
          {{ saving ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า' }}
        </button>
      </div>
    </form>
    <BottomNav active="admin" />
  </div>
</template>

<style scoped>
.config-page { padding-bottom: calc(var(--bottom-nav-total, 64px) + var(--space-8) + 72px); }
.page-header { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--page-padding-x); }
.page-title { font-size: var(--text-h2); font-weight: 700; margin: 0; }
.header-spacer { width: var(--touch-min); height: var(--touch-min); flex-shrink: 0; }
.admin-back-label { display: none; }
.tab-bar {
  display: flex;
  gap: var(--space-2);
  margin: 0 calc(var(--page-padding-x) * -1);
  padding: 0 var(--page-padding-x) var(--space-1);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}
.tab-bar::-webkit-scrollbar { display: none; }
.tab-btn {
  flex: 0 0 auto;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: transparent;
  font-family: inherit;
  cursor: pointer;
  font-size: var(--text-sm);
  white-space: nowrap;
}
.tab-btn.active { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-primary); }
.config-body { padding: 0 var(--page-padding-x) var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
.config-card { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.config-save-bar {
  position: sticky;
  bottom: var(--bottom-nav-total, 0px);
  z-index: 10;
  padding: var(--space-3) 0;
  background: linear-gradient(to top, var(--color-background) 70%, transparent);
}
.info-title { font-size: var(--text-h3); font-weight: 700; margin: 0; }
.muted { color: var(--color-text-muted); font-size: var(--text-sm); margin: 0; }
.form-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-3); }
.form-row { display: flex; flex-direction: column; gap: var(--space-1); }
.form-label { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); display: flex; flex-direction: column; gap: 2px; }
.form-hint { font-size: var(--text-label); font-weight: 400; color: var(--color-text-muted); }
.form-input { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: inherit; font-size: var(--text-sm); background: var(--color-surface); }
.form-input:focus { outline: none; border-color: var(--color-primary); }
.toggle-label { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; font-weight: 600; user-select: none; }
.toggle-input { display: none; }
.toggle-track { width: 44px; height: 24px; background: var(--color-border); border-radius: var(--radius-pill); position: relative; transition: background .2s; flex-shrink: 0; }
.toggle-input:checked + .toggle-track { background: var(--color-primary); }
.toggle-thumb { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: var(--shadow-sm); }
.toggle-input:checked + .toggle-track .toggle-thumb { transform: translateX(20px); }
.mode-slide {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 4px;
  background: var(--color-surface-muted, #f3eee9);
  border-radius: var(--radius-pill);
}
.mode-slide-btn {
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
.mode-slide-btn.active {
  background: var(--color-primary);
  color: var(--color-on-primary);
}
.mode-slide--4 { grid-template-columns: 1fr 1fr; }
.mode-slide--4 .mode-slide-btn { min-height: 36px; padding: var(--space-2) 6px; font-size: var(--text-label); }
.theme-preview {
  padding: var(--space-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-background);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.theme-preview-title {
  font-family: var(--font-body);
  font-size: var(--text-h2);
  color: var(--color-text-primary);
}
.theme-preview-body {
  margin: 0;
  font-size: var(--text-body);
  color: var(--color-text-secondary);
}
.theme-preview-btn {
  align-self: flex-start;
  padding: var(--space-2) var(--space-4);
  border-radius: var(--radius-pill);
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-size: var(--text-sm);
  font-weight: 700;
}
.color-field { display: flex; align-items: center; gap: var(--space-2); }
.color-swatch {
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: transparent;
  cursor: pointer;
}
.color-hex { font-family: ui-monospace, monospace; text-transform: uppercase; }
.color-presets { display: flex; flex-wrap: wrap; gap: 8px; }
.color-preset {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 2px solid transparent;
  box-shadow: inset 0 0 0 1px rgba(45, 36, 36, 0.18);
  cursor: pointer;
  padding: 0;
}
.color-preset.active { border-color: var(--color-text-primary); }
.save-btn { min-height: var(--btn-primary-height); width: 100%; }
.brand-upload-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-4); }
.brand-preview { width: 100%; border-radius: var(--radius-md); border: 1px solid var(--color-border); object-fit: cover; background: var(--color-surface); }
.brand-preview--logo { width: 96px; height: 96px; object-fit: contain; padding: var(--space-2); }
.brand-preview--hero { max-height: 180px; object-fit: cover; }
.brand-upload-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.hidden-file {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.success-msg { color: var(--color-success); font-size: var(--text-sm); margin: 0; }
.error-msg { color: var(--color-error); font-size: var(--text-sm); margin: 0; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (min-width: 720px) {
  .form-grid { grid-template-columns: 1fr 1fr; }
  .mode-slide--4 { grid-template-columns: repeat(4, 1fr); }
}
@media (min-width: 900px) {
  .admin-back-btn {
    width: auto;
    min-width: var(--touch-min);
    padding: 0 12px;
    gap: 8px;
    text-decoration: none;
    font-size: var(--text-sm);
    font-weight: 600;
    color: inherit;
  }
  .admin-back-label { display: inline; }
  .header-spacer { width: 8.5rem; }
}
</style>
