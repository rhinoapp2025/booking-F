<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, toRaw, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useHotelRoute } from '../composables/useHotelRoute'
import { useFeaturesStore } from '../stores/features'
import { useHotelStore } from '../stores/hotel'
import { useUiSettingsStore } from '../stores/uiSettings'
import { useNetworkBrandingStore } from '../stores/networkBranding'
import api from '../api/axios'
import { compressImage } from '../utils/compressChatImage'
import { apiMediaUrl } from '../utils/resolveUiImageUrl'
import { DEFAULT_THEME, fontOptions, applyHotelTheme } from '../utils/applyHotelTheme'
import BottomNav from '../components/BottomNav.vue'
import HotelAdminsPanel from '../components/HotelAdminsPanel.vue'

const router = useRouter()
const { hotelPath, hotelSlug } = useHotelRoute()
const featuresStore = useFeaturesStore()
const hotelStore = useHotelStore()
const uiSettings = useUiSettingsStore()
const networkStore = useNetworkBrandingStore()

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

const loading = ref(true)
const savingDefaults = ref(false)
const savingHotel = ref(false)
const creating = ref(false)
const savingNetwork = ref(false)
const uploadingKind = ref('')
const message = ref('')
const errorMsg = ref('')

const catalog = ref([])
const defaults = reactive({})
const hotels = ref([])
const selectedHotelId = ref('')
const hotelFlags = reactive({})
const locationOptions = ref([])
const viewOptions = ref([])
const catalogLoading = ref(false)
const showCatalogModal = ref(false)
const savingCatalog = ref(false)
const catalogDraftLoc = ref([])
const catalogDraftView = ref([])
const catalogModalError = ref('')
const catalogModalMsg = ref('')
const logoFileRef = ref(null)
const heroFileRef = ref(null)
const networkLogoUrl = ref('')
const networkHeroUrl = ref('')

const networkForm = reactive({
  name: 'ค้นหาโรงแรม',
  ui_color_primary: DEFAULT_THEME.ui_color_primary,
  ui_color_text: DEFAULT_THEME.ui_color_text,
  ui_color_background: DEFAULT_THEME.ui_color_background,
  ui_font_family: DEFAULT_THEME.ui_font_family,
  ui_font_size: DEFAULT_THEME.ui_font_size,
})

const newHotel = reactive({
  slug: '',
  name: '',
  city: '',
})

const tab = ref('network')
const tabs = [
  { id: 'network', label: 'หน้ารวม' },
  { id: 'branches', label: 'สาขา' },
  { id: 'create', label: 'สร้างสาขา' },
  { id: 'defaults', label: 'ค่าเริ่มต้น' },
  { id: 'features', label: 'ต่อสาขา' },
  { id: 'admins', label: 'แอดมิน' },
]

const selectedHotel = computed(() => hotels.value.find((h) => h.id === selectedHotelId.value) || null)

const themeDraft = computed(() => ({
  ui_color_primary: networkForm.ui_color_primary,
  ui_color_text: networkForm.ui_color_text,
  ui_color_background: networkForm.ui_color_background,
  ui_font_family: networkForm.ui_font_family,
  ui_font_size: networkForm.ui_font_size,
}))

function applyDefaults(src = {}) {
  for (const key of Object.keys(defaults)) delete defaults[key]
  Object.assign(defaults, src)
}

function applyHotelFlags(src = {}) {
  for (const key of Object.keys(hotelFlags)) delete hotelFlags[key]
  Object.assign(hotelFlags, src)
}

async function loadPlatform() {
  loading.value = true
  errorMsg.value = ''
  try {
    const { data } = await api.get('/api/admin/platform/features')
    catalog.value = data.catalog || []
    applyDefaults(data.defaults || {})
    hotels.value = data.hotels || []
    if (!selectedHotelId.value && hotels.value[0]) selectedHotelId.value = hotels.value[0].id
    syncSelectedFlags()
    try {
      await loadNetwork()
    } catch (netErr) {
      errorMsg.value = netErr?.response?.data?.error || 'โหลดตั้งค่าหน้ารวมไม่สำเร็จ'
    }
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'โหลดตั้งค่าแพลตฟอร์มไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

function syncSelectedFlags() {
  const hotel = selectedHotel.value
  applyHotelFlags(hotel?.features || { ...defaults })
  showCatalogModal.value = false
  loadCatalogOptions()
}

async function loadCatalogOptions() {
  if (!selectedHotelId.value) {
    locationOptions.value = []
    viewOptions.value = []
    return
  }
  catalogLoading.value = true
  try {
    const { data } = await api.get(`/api/admin/platform/hotels/${selectedHotelId.value}/catalog-options`)
    locationOptions.value = (data.location_types || []).map((o) => ({
      value: o.value,
      label: o.label,
    }))
    viewOptions.value = (data.view_types || []).map((o) => ({
      value: o.value,
      label: o.label,
    }))
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'โหลดลักษณะที่ตั้ง/วิวไม่สำเร็จ'
  } finally {
    catalogLoading.value = false
  }
}

function openCatalogModal() {
  catalogDraftLoc.value = locationOptions.value.map((o) => ({
    value: o.value,
    label: o.label,
    savedLabel: o.label,
  }))
  catalogDraftView.value = viewOptions.value.map((o) => ({
    value: o.value,
    label: o.label,
    savedLabel: o.label,
  }))
  catalogModalError.value = ''
  catalogModalMsg.value = ''
  showCatalogModal.value = true
}

function closeCatalogModal() {
  showCatalogModal.value = false
}

function addCatalogOption(kind) {
  const list = kind === 'view' ? catalogDraftView : catalogDraftLoc
  list.value.push({ value: '', label: '', savedLabel: null })
}

function isCatalogRowDirty(opt) {
  const label = String(opt?.label || '').trim()
  if (!label) return false
  if (opt.savedLabel == null) return true
  return label !== String(opt.savedLabel).trim()
}

function catalogRowKey(kind, idx) {
  return `${kind}:${idx}`
}

async function persistCatalogDraft() {
  if (!selectedHotelId.value) return false
  const pendingLoc = catalogDraftLoc.value.filter((o) => !String(o.label || '').trim() && o.savedLabel == null)
  const pendingView = catalogDraftView.value.filter((o) => !String(o.label || '').trim() && o.savedLabel == null)
  const loc = catalogDraftLoc.value
    .map((o) => ({ value: String(o.value || '').trim(), label: String(o.label || '').trim() }))
    .filter((o) => o.label)
  const views = catalogDraftView.value
    .map((o) => ({ value: String(o.value || '').trim(), label: String(o.label || '').trim() }))
    .filter((o) => o.label)
  catalogModalError.value = ''
  catalogModalMsg.value = ''
  if (!loc.length) {
    catalogModalError.value = 'ต้องมีลักษณะที่ตั้งอย่างน้อย 1 รายการ'
    return false
  }
  if (!views.length) {
    catalogModalError.value = 'ต้องมีวิวอย่างน้อย 1 รายการ'
    return false
  }
  const { data } = await api.put(`/api/admin/platform/hotels/${selectedHotelId.value}/catalog-options`, {
    location_types: loc,
    view_types: views,
  })
  locationOptions.value = (data.location_types || []).map((o) => ({ value: o.value, label: o.label }))
  viewOptions.value = (data.view_types || []).map((o) => ({ value: o.value, label: o.label }))
  catalogDraftLoc.value = [
    ...locationOptions.value.map((o) => ({ value: o.value, label: o.label, savedLabel: o.label })),
    ...pendingLoc.map(() => ({ value: '', label: '', savedLabel: null })),
  ]
  catalogDraftView.value = [
    ...viewOptions.value.map((o) => ({ value: o.value, label: o.label, savedLabel: o.label })),
    ...pendingView.map(() => ({ value: '', label: '', savedLabel: null })),
  ]
  return true
}

async function saveCatalogRow(kind, index) {
  const list = kind === 'view' ? catalogDraftView : catalogDraftLoc
  const opt = list.value[index]
  if (!opt || !isCatalogRowDirty(opt)) return
  savingCatalog.value = catalogRowKey(kind, index)
  try {
    const ok = await persistCatalogDraft()
    if (ok) catalogModalMsg.value = 'บันทึกแล้ว'
  } catch (err) {
    catalogModalError.value = err?.response?.data?.error || 'บันทึกไม่สำเร็จ'
  } finally {
    savingCatalog.value = false
  }
}

async function removeCatalogOption(kind, index) {
  const list = kind === 'view' ? catalogDraftView : catalogDraftLoc
  if (list.value.length <= 1) return
  const opt = list.value[index]
  // แถวใหม่ที่ยังไม่บันทึก — ลบออกจากร่างอย่างเดียว
  if (opt && opt.savedLabel == null && !String(opt.value || '').trim()) {
    list.value.splice(index, 1)
    return
  }
  list.value.splice(index, 1)
  savingCatalog.value = catalogRowKey(kind, index)
  try {
    const ok = await persistCatalogDraft()
    if (ok) catalogModalMsg.value = 'ลบแล้ว'
  } catch (err) {
    catalogModalError.value = err?.response?.data?.error || 'ลบไม่สำเร็จ'
    await loadCatalogOptions()
    catalogDraftLoc.value = locationOptions.value.map((o) => ({
      value: o.value,
      label: o.label,
      savedLabel: o.label,
    }))
    catalogDraftView.value = viewOptions.value.map((o) => ({
      value: o.value,
      label: o.label,
      savedLabel: o.label,
    }))
  } finally {
    savingCatalog.value = false
  }
}

const catalogSummary = computed(() => {
  const loc = locationOptions.value.length
  const views = viewOptions.value.length
  if (catalogLoading.value) return 'กำลังโหลด...'
  return `ลักษณะที่ตั้ง ${loc} รายการ · วิว ${views} รายการ`
})

function snapshotFlags(src) {
  const raw = { ...toRaw(src) }
  const out = {}
  for (const group of catalog.value) {
    for (const item of group.items) {
      out[item.key] = raw[item.key] === true
    }
  }
  return out
}

async function refreshGuestNav(slug) {
  const target = slug || hotelSlug.value
  if (target) await featuresStore.fetch(target, { force: true })
}

function setFlag(target, key, locked, checked) {
  if (locked) return
  target[key] = checked
}

async function saveDefaults() {
  savingDefaults.value = true
  message.value = ''
  errorMsg.value = ''
  try {
    const { data } = await api.patch('/api/admin/platform/features', { defaults: snapshotFlags(defaults) })
    catalog.value = data.catalog || catalog.value
    applyDefaults(data.defaults || {})
    hotels.value = data.hotels || hotels.value
    syncSelectedFlags()
    await refreshGuestNav()
    message.value = 'บันทึกค่าเริ่มต้นแล้ว'
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'บันทึกค่าเริ่มต้นไม่สำเร็จ'
  } finally {
    savingDefaults.value = false
  }
}

async function saveHotel() {
  if (!selectedHotelId.value) return
  savingHotel.value = true
  message.value = ''
  errorMsg.value = ''
  try {
    const { data } = await api.patch('/api/admin/platform/features', {
      hotel_id: selectedHotelId.value,
      features: snapshotFlags(hotelFlags),
    })
    hotels.value = data.hotels || hotels.value
    applyHotelFlags(selectedHotel.value?.features || { ...defaults })
    await refreshGuestNav(selectedHotel.value?.slug)
    message.value = `บันทึกฟังก์ชันของ ${selectedHotel.value?.name || 'สาขา'} แล้ว`
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'บันทึกสาขาไม่สำเร็จ'
  } finally {
    savingHotel.value = false
  }
}

async function createHotel() {
  creating.value = true
  message.value = ''
  errorMsg.value = ''
  try {
    await api.post('/api/admin/platform/hotels', {
      slug: newHotel.slug,
      name: newHotel.name,
      city: newHotel.city || undefined,
    })
    newHotel.slug = ''
    newHotel.name = ''
    newHotel.city = ''
    await loadPlatform()
    tab.value = 'branches'
    message.value = 'สร้างสาขาแล้ว'
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'สร้างสาขาไม่สำเร็จ'
  } finally {
    creating.value = false
  }
}

function switchBranch(hotel) {
  const slug = String(hotel?.slug || '').trim()
  if (!slug) return
  router.push(`/${slug}/admin`)
}

function assignNetwork(src = {}) {
  networkForm.name = String(src.name || '').trim() || 'ค้นหาโรงแรม'
  const theme = src.theme || {}
  networkForm.ui_color_primary = theme.ui_color_primary || DEFAULT_THEME.ui_color_primary
  networkForm.ui_color_text = theme.ui_color_text || DEFAULT_THEME.ui_color_text
  networkForm.ui_color_background = theme.ui_color_background || DEFAULT_THEME.ui_color_background
  networkForm.ui_font_family = theme.ui_font_family || DEFAULT_THEME.ui_font_family
  networkForm.ui_font_size = theme.ui_font_size || DEFAULT_THEME.ui_font_size
  networkLogoUrl.value = apiMediaUrl(src.logo_url)
  networkHeroUrl.value = apiMediaUrl(src.hero_url)
}

function restoreHotelTheme() {
  if (hotelStore.hotel) uiSettings.applyFromHotel(hotelStore.hotel)
  else uiSettings.reset()
}

function setThemeColor(key, value) {
  const hex = String(value || '').trim()
  if (!HEX_COLOR_RE.test(hex)) return
  networkForm[key] = hex.toUpperCase()
}

function resetNetworkTheme() {
  networkForm.ui_color_primary = DEFAULT_THEME.ui_color_primary
  networkForm.ui_color_text = DEFAULT_THEME.ui_color_text
  networkForm.ui_color_background = DEFAULT_THEME.ui_color_background
  networkForm.ui_font_family = DEFAULT_THEME.ui_font_family
  networkForm.ui_font_size = DEFAULT_THEME.ui_font_size
}

async function loadNetwork() {
  const { data } = await api.get('/api/admin/platform/network-branding')
  assignNetwork(data)
  networkStore.applyPayload(data)
}

async function saveNetwork() {
  savingNetwork.value = true
  message.value = ''
  errorMsg.value = ''
  try {
    const { data } = await api.patch('/api/admin/platform/network-branding', {
      name: networkForm.name,
      theme: { ...themeDraft.value },
    })
    assignNetwork(data)
    networkStore.applyPayload(data)
    message.value = 'บันทึกหน้ารวมแล้ว'
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'บันทึกหน้ารวมไม่สำเร็จ'
  } finally {
    savingNetwork.value = false
  }
}

async function uploadNetworkImage(kind, event) {
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
    const { data } = await api.post('/api/admin/platform/network-branding/image', {
      kind,
      imageData: compressed.base64,
      imageMime: compressed.mime,
    })
    const url = apiMediaUrl(data.url)
    if (kind === 'logo') networkLogoUrl.value = url
    else networkHeroUrl.value = url
    await networkStore.fetch({ force: true })
    message.value = kind === 'logo' ? 'อัปโหลดโลโก้แล้ว' : 'อัปโหลดรูปแล้ว'
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'อัปโหลดรูปไม่สำเร็จ'
  } finally {
    uploadingKind.value = ''
  }
}

async function removeNetworkImage(kind) {
  uploadingKind.value = kind
  errorMsg.value = ''
  try {
    await api.delete(`/api/admin/platform/network-branding/image/${kind}`)
    if (kind === 'logo') networkLogoUrl.value = ''
    else networkHeroUrl.value = ''
    await networkStore.fetch({ force: true })
    message.value = kind === 'logo' ? 'ลบโลโก้แล้ว' : 'ลบรูปแล้ว'
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'ลบรูปไม่สำเร็จ'
  } finally {
    uploadingKind.value = ''
  }
}

watch(themeDraft, (theme) => {
  if (tab.value !== 'network') return
  if (
    !HEX_COLOR_RE.test(theme.ui_color_primary)
    || !HEX_COLOR_RE.test(theme.ui_color_text)
    || !HEX_COLOR_RE.test(theme.ui_color_background)
  ) return
  applyHotelTheme(theme)
}, { deep: true, immediate: true })

watch(tab, (id) => {
  if (id === 'network') applyHotelTheme(themeDraft.value)
  else restoreHotelTheme()
})

onMounted(loadPlatform)

onUnmounted(() => {
  restoreHotelTheme()
})
</script>

<template>
  <div class="platform-page app-page app-page--admin">
    <header class="page-header">
      <router-link :to="hotelPath('/admin')" class="icon-btn admin-back-btn" title="กลับแอดมิน">
        <i class="ti ti-arrow-left"></i>
        <span class="admin-back-label">กลับแอดมิน</span>
      </router-link>
      <h1 class="page-title">ฟังก์ชันแต่ละสาขา</h1>
      <span class="header-spacer"></span>
    </header>

    <div class="platform-body">
      <p class="lead">ตั้งค่าหน้ารวม ค้นหาทุกสาขา กับเมนูฟังก์ชันที่แขกกับแอดมินสาขาเห็น — เฉพาะแอดมินแพลตฟอร์ม</p>

      <div class="tab-bar" role="tablist" aria-label="หมวดฟังก์ชันแพลตฟอร์ม">
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

      <div v-if="loading" class="state-card">
        <i class="ti ti-loader-2 state-card-icon spin"></i>
        <p class="state-card-title">กำลังโหลด...</p>
      </div>

      <template v-else>
        <section v-show="tab === 'network'" class="card config-card">
          <div class="section-head">
            <div>
              <h2 class="info-title">หน้ารวม</h2>
              <p class="muted">ชื่อ โลโก้ รูปหน้าปก และธีมสีของหน้าค้นหาทุกสาขา</p>
            </div>
            <button class="btn btn-primary" type="button" :disabled="savingNetwork" @click="saveNetwork">
              {{ savingNetwork ? 'กำลังบันทึก...' : 'บันทึกหน้ารวม' }}
            </button>
          </div>

          <div class="form-row">
            <label class="form-label">ชื่อที่แสดง</label>
            <input v-model="networkForm.name" class="form-input" maxlength="80" placeholder="ค้นหาโรงแรม" />
          </div>

          <div class="brand-upload-grid">
            <div class="form-row">
              <label class="form-label">โลโก้ / ไอคอน</label>
              <img v-if="networkLogoUrl" :src="networkLogoUrl" alt="โลโก้หน้ารวม" class="brand-preview brand-preview--logo" />
              <div class="brand-upload-actions">
                <input
                  ref="logoFileRef"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  class="hidden-file"
                  :disabled="Boolean(uploadingKind)"
                  @change="uploadNetworkImage('logo', $event)"
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
                  v-if="networkLogoUrl"
                  class="btn btn-outline"
                  type="button"
                  :disabled="Boolean(uploadingKind)"
                  @click="removeNetworkImage('logo')"
                >
                  ลบ
                </button>
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">รูปหน้าปก</label>
              <img v-if="networkHeroUrl" :src="networkHeroUrl" alt="รูปหน้ารวม" class="brand-preview brand-preview--hero" />
              <div class="brand-upload-actions">
                <input
                  ref="heroFileRef"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  class="hidden-file"
                  :disabled="Boolean(uploadingKind)"
                  @change="uploadNetworkImage('hero', $event)"
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
                  v-if="networkHeroUrl"
                  class="btn btn-outline"
                  type="button"
                  :disabled="Boolean(uploadingKind)"
                  @click="removeNetworkImage('hero')"
                >
                  ลบ
                </button>
              </div>
            </div>
          </div>

          <h3 class="group-title">ธีมสี</h3>
          <div class="theme-preview">
            <strong class="theme-preview-title">{{ networkForm.name || 'ค้นหาโรงแรม' }}</strong>
            <p class="theme-preview-body">ตัวอย่างสีบนหน้ารวม</p>
            <span class="theme-preview-btn">ค้นหาห้องว่าง</span>
          </div>

          <div class="form-row">
            <label class="form-label">สีแอป</label>
            <div class="color-field">
              <input
                class="color-swatch"
                type="color"
                :value="networkForm.ui_color_primary"
                @input="setThemeColor('ui_color_primary', $event.target.value)"
              />
              <input
                v-model="networkForm.ui_color_primary"
                class="form-input color-hex"
                maxlength="7"
                spellcheck="false"
                @change="setThemeColor('ui_color_primary', networkForm.ui_color_primary)"
              />
            </div>
            <div class="color-presets">
              <button
                v-for="hex in COLOR_PRESETS"
                :key="hex"
                type="button"
                class="color-preset"
                :class="{ active: networkForm.ui_color_primary.toUpperCase() === hex }"
                :style="{ background: hex }"
                :title="hex"
                @click="setThemeColor('ui_color_primary', hex)"
              />
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">สีพื้นหลัง</label>
            <div class="color-field">
              <input
                class="color-swatch"
                type="color"
                :value="networkForm.ui_color_background"
                @input="setThemeColor('ui_color_background', $event.target.value)"
              />
              <input
                v-model="networkForm.ui_color_background"
                class="form-input color-hex"
                maxlength="7"
                spellcheck="false"
                @change="setThemeColor('ui_color_background', networkForm.ui_color_background)"
              />
            </div>
            <div class="color-presets">
              <button
                v-for="hex in BG_PRESETS"
                :key="'bg-' + hex"
                type="button"
                class="color-preset"
                :class="{ active: networkForm.ui_color_background.toUpperCase() === hex }"
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
                :value="networkForm.ui_color_text"
                @input="setThemeColor('ui_color_text', $event.target.value)"
              />
              <input
                v-model="networkForm.ui_color_text"
                class="form-input color-hex"
                maxlength="7"
                spellcheck="false"
                @change="setThemeColor('ui_color_text', networkForm.ui_color_text)"
              />
            </div>
          </div>

          <div class="form-row">
            <label class="form-label">ชนิดตัวอักษร</label>
            <select v-model="networkForm.ui_font_family" class="form-input">
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
                :class="{ active: networkForm.ui_font_size === item.id }"
                role="tab"
                :aria-selected="networkForm.ui_font_size === item.id"
                @click="networkForm.ui_font_size = item.id"
              >{{ item.label }}</button>
            </div>
          </div>

          <button class="btn btn-outline" type="button" @click="resetNetworkTheme">คืนค่าสีเริ่มต้น</button>
        </section>

        <section v-show="tab === 'branches'" class="card config-card">
          <h2 class="info-title">สลับสาขา</h2>
          <p class="muted">กดสาขาเพื่อเข้าแอดมินของโรงแรมนั้น</p>
          <ul class="branch-list">
            <li v-for="h in hotels" :key="h.id">
              <button
                type="button"
                class="branch-item"
                :class="{ current: h.slug === hotelSlug }"
                @click="switchBranch(h)"
              >
                <span class="branch-item-text">
                  <strong>{{ h.name }}</strong>
                  <span class="muted">/{{ h.slug }}{{ h.is_active ? '' : ' (ปิด)' }}</span>
                </span>
                <span class="branch-item-action">
                  <span v-if="h.slug === hotelSlug" class="branch-tag">กำลังใช้อยู่</span>
                  <i class="ti ti-chevron-right" aria-hidden="true"></i>
                </span>
              </button>
            </li>
          </ul>
        </section>

        <section v-show="tab === 'create'" class="card config-card">
          <h2 class="info-title">สร้างสาขาใหม่</h2>
          <form class="create-grid" @submit.prevent="createHotel">
            <input v-model="newHotel.slug" class="form-input" placeholder="slug เช่น bangkok" required />
            <input v-model="newHotel.name" class="form-input" placeholder="ชื่อโรงแรม" required />
            <input v-model="newHotel.city" class="form-input" placeholder="เมือง (ไม่บังคับ)" />
            <button class="btn btn-outline" type="submit" :disabled="creating">
              {{ creating ? 'กำลังสร้าง...' : 'สร้างสาขา' }}
            </button>
          </form>
        </section>

        <section v-show="tab === 'defaults'" class="card config-card">
          <div class="section-head">
            <div>
              <h2 class="info-title">ค่าเริ่มต้นทั้งระบบ</h2>
              <p class="muted">สาขาที่ยังไม่ได้ตั้งค่าเองจะใช้ค่านี้</p>
            </div>
            <button class="btn btn-primary" type="button" :disabled="savingDefaults" @click="saveDefaults">
              {{ savingDefaults ? 'กำลังบันทึก...' : 'บันทึกค่าเริ่มต้น' }}
            </button>
          </div>
          <div v-for="group in catalog" :key="group.key" class="feature-group">
            <h3 class="group-title"><i :class="['ti', group.icon]"></i> {{ group.label }}</h3>
            <p v-if="group.hint" class="muted">{{ group.hint }}</p>
            <label
              v-for="item in group.items"
              :key="item.key"
              class="toggle-label"
              :class="{ locked: item.locked }"
            >
              <input
                type="checkbox"
                class="toggle-input"
                :checked="defaults[item.key] !== false"
                :disabled="item.locked"
                @change="setFlag(defaults, item.key, item.locked, $event.target.checked)"
              />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              {{ item.label }}
              <span v-if="item.locked" class="lock-tag">ล็อก</span>
            </label>
          </div>
        </section>

        <section v-show="tab === 'features'" class="card config-card">
          <div class="section-head">
            <div>
              <h2 class="info-title">ตั้งค่าต่อสาขา</h2>
              <p class="muted">เลือกโรงแรมแล้วเปิด/ปิดฟังก์ชันเฉพาะสาขานั้น</p>
            </div>
            <button class="btn btn-primary" type="button" :disabled="savingHotel || !selectedHotelId" @click="saveHotel">
              {{ savingHotel ? 'กำลังบันทึก...' : 'บันทึกสาขานี้' }}
            </button>
          </div>
          <div class="form-row">
            <label class="form-label">สาขา</label>
            <select v-model="selectedHotelId" class="form-input" @change="syncSelectedFlags">
              <option v-for="h in hotels" :key="h.id" :value="h.id">
                {{ h.name }} /{{ h.slug }}{{ h.is_active ? '' : ' (ปิด)' }}
              </option>
            </select>
          </div>

          <div class="feature-group catalog-block">
            <div class="catalog-summary-row">
              <div class="catalog-toggle-main">
                <i class="ti ti-list-details"></i>
                <span>
                  <span class="catalog-toggle-title">ลักษณะที่ตั้งและวิว</span>
                  <span class="catalog-toggle-sub">{{ catalogSummary }}</span>
                </span>
              </div>
              <button
                type="button"
                class="btn btn-outline catalog-edit-btn"
                :disabled="!selectedHotelId || catalogLoading"
                @click="openCatalogModal"
              >
                <i class="ti ti-pencil"></i> แก้ไข
              </button>
            </div>
          </div>

          <div v-for="group in catalog" :key="'h-' + group.key" class="feature-group">
            <h3 class="group-title"><i :class="['ti', group.icon]"></i> {{ group.label }}</h3>
            <label
              v-for="item in group.items"
              :key="item.key"
              class="toggle-label"
              :class="{ locked: item.locked }"
            >
              <input
                type="checkbox"
                class="toggle-input"
                :checked="hotelFlags[item.key] !== false"
                :disabled="item.locked"
                @change="setFlag(hotelFlags, item.key, item.locked, $event.target.checked)"
              />
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              {{ item.label }}
            </label>
          </div>
        </section>

        <section v-show="tab === 'admins'" class="card config-card">
          <h2 class="info-title">แอดมินสาขา</h2>
          <HotelAdminsPanel
            :hotels="hotels"
            :can-remove-super-admin="true"
          />
        </section>
      </template>
    </div>

    <div
      v-if="showCatalogModal"
      class="catalog-backdrop"
      @click.self="closeCatalogModal"
    >
      <div class="catalog-sheet" role="dialog" aria-modal="true" aria-labelledby="catalog-modal-title">
        <div class="catalog-sheet-head">
          <h2 id="catalog-modal-title" class="info-title">แก้ไขลักษณะที่ตั้งและวิว</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" @click="closeCatalogModal">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="catalog-sheet-body">
          <p class="muted">
            สาขา {{ selectedHotel?.name || '' }} — แก้ข้อความแล้วกดบันทึกข้างแถวนั้น
          </p>

          <h4 class="catalog-subhead"><i class="ti ti-map-pin"></i> ลักษณะที่ตั้ง</h4>
          <div v-for="(opt, idx) in catalogDraftLoc" :key="'dloc-' + (opt.value || idx)" class="catalog-row">
            <input v-model="opt.label" class="form-input" placeholder="เช่น ติดหาด" />
            <button
              v-if="isCatalogRowDirty(opt)"
              type="button"
              class="btn btn-primary catalog-save"
              :disabled="Boolean(savingCatalog)"
              @click="saveCatalogRow('location', idx)"
            >{{ savingCatalog === catalogRowKey('location', idx) ? '...' : 'บันทึก' }}</button>
            <button
              type="button"
              class="btn btn-outline catalog-del"
              :disabled="catalogDraftLoc.length <= 1 || Boolean(savingCatalog)"
              @click="removeCatalogOption('location', idx)"
            >ลบ</button>
          </div>
          <button type="button" class="btn btn-outline catalog-add" @click="addCatalogOption('location')">
            + เพิ่มลักษณะที่ตั้ง
          </button>

          <h4 class="catalog-subhead"><i class="ti ti-eye"></i> วิว</h4>
          <div v-for="(opt, idx) in catalogDraftView" :key="'dview-' + (opt.value || idx)" class="catalog-row">
            <input v-model="opt.label" class="form-input" placeholder="เช่น วิวทะเล" />
            <button
              v-if="isCatalogRowDirty(opt)"
              type="button"
              class="btn btn-primary catalog-save"
              :disabled="Boolean(savingCatalog)"
              @click="saveCatalogRow('view', idx)"
            >{{ savingCatalog === catalogRowKey('view', idx) ? '...' : 'บันทึก' }}</button>
            <button
              type="button"
              class="btn btn-outline catalog-del"
              :disabled="catalogDraftView.length <= 1 || Boolean(savingCatalog)"
              @click="removeCatalogOption('view', idx)"
            >ลบ</button>
          </div>
          <button type="button" class="btn btn-outline catalog-add" @click="addCatalogOption('view')">
            + เพิ่มวิว
          </button>

          <p v-if="catalogModalMsg" class="success-msg">{{ catalogModalMsg }}</p>
          <p v-if="catalogModalError" class="error-msg">{{ catalogModalError }}</p>
        </div>
      </div>
    </div>

    <BottomNav active="admin" />
  </div>
</template>

<style scoped>
.platform-page { padding-bottom: calc(var(--bottom-nav-total, 64px) + var(--space-8)); }
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
.platform-body { padding: 0 var(--page-padding-x) var(--space-6); display: flex; flex-direction: column; gap: var(--space-4); }
.lead { margin: 0; color: var(--color-text-secondary); font-size: var(--text-sm); }
.config-card { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.info-title { font-size: var(--text-h3); font-weight: 700; margin: 0; }
.muted { color: var(--color-text-muted); font-size: var(--text-sm); margin: 0; }
.section-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: var(--space-3); align-items: flex-start; }
.create-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-2); }
.form-row { display: flex; flex-direction: column; gap: var(--space-1); }
.form-label { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); }
.form-input { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: inherit; font-size: var(--text-sm); background: var(--color-surface); }
.feature-group { display: flex; flex-direction: column; gap: var(--space-2); padding-top: var(--space-2); border-top: 1px solid var(--color-border); }
.catalog-summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}
.catalog-toggle-main { display: flex; align-items: flex-start; gap: var(--space-2); min-width: 0; }
.catalog-toggle-main > .ti { margin-top: 2px; flex-shrink: 0; }
.catalog-toggle-title { display: block; font-weight: 700; font-size: var(--text-body); }
.catalog-toggle-sub { display: block; color: var(--color-text-muted); font-size: var(--text-sm); margin-top: 2px; }
.catalog-edit-btn { width: auto; min-width: 0; flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; }
.catalog-subhead {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  font-weight: 700;
}
.catalog-row { display: flex; gap: var(--space-2); align-items: center; }
.catalog-row .form-input { flex: 1; min-width: 0; }
.catalog-del { width: auto; min-width: 0; flex-shrink: 0; padding-inline: var(--space-3); }
.catalog-save { width: auto; min-width: 0; flex-shrink: 0; padding-inline: var(--space-3); }
.catalog-add { width: auto; align-self: flex-start; }
.catalog-backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  z-index: var(--z-admin-modal, 1200);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-4);
}
.catalog-sheet {
  background: var(--color-surface);
  border-radius: var(--radius-card);
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: var(--shadow-sheet);
}
.catalog-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-surface);
  z-index: 1;
}
.catalog-sheet-body {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.group-title { display: flex; align-items: center; gap: var(--space-2); font-size: var(--text-body); margin: 0; }
.toggle-label { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; font-weight: 500; user-select: none; }
.toggle-label.locked { opacity: 0.65; cursor: default; }
.toggle-input { display: none; }
.toggle-track { width: 44px; height: 24px; background: var(--color-border); border-radius: var(--radius-pill); position: relative; transition: background .2s; flex-shrink: 0; }
.toggle-input:checked + .toggle-track { background: var(--color-primary); }
.toggle-thumb { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: var(--shadow-sm); }
.toggle-input:checked + .toggle-track .toggle-thumb { transform: translateX(20px); }
.lock-tag { font-size: var(--text-label); background: var(--color-surface-muted); padding: 1px 8px; border-radius: var(--radius-pill); }
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
.branch-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.branch-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  min-height: var(--touch-min);
}
.branch-item:hover { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary-light) 55%, transparent); }
.branch-item.current { border-color: var(--color-primary); background: color-mix(in srgb, var(--color-primary-light) 70%, transparent); }
.branch-item-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.branch-item-action { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; color: var(--color-text-muted); }
.branch-tag { font-size: var(--text-label); font-weight: 600; color: var(--color-primary); background: var(--color-surface-elevated); padding: 1px 8px; border-radius: var(--radius-pill); }
.success-msg { color: var(--color-success); font-size: var(--text-sm); margin: 0; }
.error-msg { color: var(--color-error); font-size: var(--text-sm); margin: 0; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (min-width: 720px) {
  .create-grid { grid-template-columns: 1fr 1.4fr 1fr auto; }
  .brand-upload-grid { grid-template-columns: 1fr 1fr; }
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
