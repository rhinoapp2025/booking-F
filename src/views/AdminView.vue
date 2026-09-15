<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useHotelRoute } from '../composables/useHotelRoute'
import { useHotelStore } from '../stores/hotel'
import { useAuthStore } from '../stores/auth'
import { useFeaturesStore } from '../stores/features'
import AccountMenuDrawer from '../components/AccountMenuDrawer.vue'
import BookingPolicyNotes from '../components/BookingPolicyNotes.vue'
import BottomNav from '../components/BottomNav.vue'
import ChannelManagerPanel from './ChannelManagerPanel.vue'
import api from '../api/axios'
import Swal from 'sweetalert2'
import { apiMediaUrl } from '../utils/resolveUiImageUrl'

const { hotelSlug, hotelPath } = useHotelRoute()
const hotelStore = useHotelStore()
const auth = useAuthStore()
const features = useFeaturesStore()
const accountMenuRef = ref(null)

const showRoomsTab = computed(() => features.showRoomsTab)
const showKioskTab = computed(() => features.showKioskTab)
const showSettingsTab = computed(() => features.showSettingsTab)
const useKioskRooms = computed(() => showKioskTab.value && kioskConfig.value.kiosk_enabled === 'true')

const tab         = ref('dashboard')
const loading     = ref(false)
const dashboard   = ref(null)
const bookings    = ref([])
const bookingListTab = ref('all')
const slipUrls    = ref({})
const rooms       = ref([])

const BOOKING_LIST_TABS = [
  { key: 'all', label: 'การจองทั้งหมด' },
  { key: 'checkin_today', label: 'การจองเข้าวันนี้' },
  { key: 'checked_in', label: 'การจองที่เช็คอินแล้ว' },
  { key: 'cancelled', label: 'การจองที่ยกเลิกแล้ว' },
]

function bangkokTodayYmd() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function addDaysYmd(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n))
  return dt.toISOString().slice(0, 10)
}

const canBookFromVacant = computed(() => !useKioskRooms.value)
const roomTypes   = ref([])
const roomsSource = ref('local')
const roomsFetchedAt = ref(null)
const roomsRefreshing = ref(false)
const roomFilter  = ref('all')
const selectedFloor = ref('all')
const roomsError  = ref('')
const inventoryBusy = ref(false)
const editingTypeId = ref(null)
const editingRoomId = ref(null)
const showTypeModal = ref(false)
const showRoomModal = ref(false)
const newType = reactive({
  name: '',
  price_per_night: '',
  description: '',
  view_type: '',
  image_files: [],
  images: [],
})
const typeImageUploading = ref(false)
const pendingTypeImages = ref([])
const localTypePreviews = computed(() => {
  if (editingTypeId.value) {
    return newType.images.map((url, idx) => ({
      url,
      filename: newType.image_files[idx],
      pending: false,
      idx,
    }))
  }
  return pendingTypeImages.value.map((item, idx) => ({
    url: item.preview,
    filename: null,
    pending: true,
    idx,
  }))
})
const localTypeImageCount = computed(() => localTypePreviews.value.length)
const newRoom = reactive({
  room_number: '',
  floor: 1,
  room_type_id: '',
  status: 'available',
})
const ROOM_NO_RE = /^[A-Za-z0-9][A-Za-z0-9\-]*$/
const ROOM_STATUS_LABEL = {
  available: 'ว่าง',
  maintenance: 'ซ่อมบำรุง',
  inactive: 'ไม่ใช้งาน',
}
let roomsPollTimer = null

// ── kiosk config ─────────────────────────────────────────────────────────────
const kioskConfig = ref({
  kiosk_db_name:    '',
  kiosk_hotel_id:   '',
  kiosk_com_no:     '',
  kiosk_login_id:   '',
  kiosk_login_name: '',
  kiosk_enabled:    'false',
})
const kioskSaving  = ref(false)
const kioskMsg     = ref('')
const kioskErrMsg  = ref('')
const kioskTesting = ref(false)
const kioskTestMsg = ref('')

const ROOM_VIEW_OPTIONS = ref([
  { value: 'garden', label: 'วิวสวน' },
  { value: 'sea', label: 'วิวทะเล' },
  { value: 'mountain', label: 'วิวภูเขา' },
  { value: 'river', label: 'วิวแม่น้ำ' },
])
const showRoomTypeManager = ref(false)
const roomTypeOptions = ref([])
const roomTypeBusy = ref(false)
const roomTypeMsg = ref('')
const roomTypeErr = ref('')
const roomTypeForm = reactive({
  id: '',
  name: '',
  description: '',
  view_type: '',
  image_files: [],
  images: [],
})
const roomTypeUploading = ref(false)

async function loadKioskConfig() {
  try {
    const { data } = await api.get(`/api/admin/${hotelSlug.value}/kiosk-config`)
    kioskConfig.value = { ...data }
  } catch (err) {
    kioskErrMsg.value = err?.response?.data?.error || 'โหลดตั้งค่า PMS ไม่สำเร็จ'
  }
}

async function saveKioskConfig() {
  kioskSaving.value = true
  kioskMsg.value    = ''
  kioskErrMsg.value = ''
  try {
    await api.put(`/api/admin/${hotelSlug.value}/kiosk-config`, {
      ...kioskConfig.value,
      kiosk_enabled: kioskConfig.value.kiosk_enabled === 'true' || kioskConfig.value.kiosk_enabled === true,
    })
    kioskMsg.value = 'บันทึกสำเร็จ'
    await loadRooms({ silent: true })
  } catch (err) {
    kioskErrMsg.value = err?.response?.data?.error || 'บันทึกไม่สำเร็จ'
  } finally {
    kioskSaving.value = false
  }
}

async function testKioskConnection() {
  kioskTesting.value = true
  kioskTestMsg.value = ''
  kioskErrMsg.value  = ''
  try {
    const { data } = await api.post(`/api/admin/${hotelSlug.value}/kiosk-config/test`)
    kioskTestMsg.value = data.message || 'เชื่อมต่อสำเร็จ'
  } catch (err) {
    kioskErrMsg.value = err?.response?.data?.error || 'ทดสอบการเชื่อมต่อไม่สำเร็จ'
  } finally {
    kioskTesting.value = false
  }
}

function viewTypeLabel(value) {
  return ROOM_VIEW_OPTIONS.value.find((o) => o.value === value)?.label || ''
}

async function loadViewTypeOptions() {
  try {
    const { data } = await api.get(`/api/hotels/${hotelSlug.value}/catalog-options`)
    if (data?.view_types?.length) ROOM_VIEW_OPTIONS.value = data.view_types
  } catch {
    /* keep defaults */
  }
}

function resetRoomTypeForm() {
  roomTypeForm.id = ''
  roomTypeForm.name = ''
  roomTypeForm.description = ''
  roomTypeForm.view_type = ''
  roomTypeForm.image_files = []
  roomTypeForm.images = []
  roomTypeMsg.value = ''
  roomTypeErr.value = ''
}

async function openRoomTypeManager() {
  showRoomTypeManager.value = true
  resetRoomTypeForm()
  roomTypeBusy.value = true
  try {
    // ซิงก์ประเภทห้องจาก PMS ผ่านโหลดห้อง (สร้าง room_types ใน PG ถ้ายังไม่มี)
    await loadRooms({ silent: true }).catch(() => null)
    const { data } = await api.get(`/api/admin/${hotelSlug.value}/room-types`)
    roomTypeOptions.value = Array.isArray(data) ? data : []
    if (!roomTypeOptions.value.length) {
      roomTypeErr.value = 'ยังไม่พบประเภทห้อง — ตรวจการเชื่อม PMS หรือเปิดแท็บห้องพักเพื่อซิงก์ก่อน'
    }
  } catch (err) {
    roomTypeErr.value = err?.response?.data?.error || 'โหลดประเภทห้องไม่สำเร็จ'
    roomTypeOptions.value = []
  } finally {
    roomTypeBusy.value = false
  }
}

function closeRoomTypeManager() {
  showRoomTypeManager.value = false
  resetRoomTypeForm()
}

function selectRoomTypeForEdit(rt) {
  roomTypeForm.id = rt.id
  roomTypeForm.name = rt.name || ''
  roomTypeForm.description = rt.description || ''
  roomTypeForm.view_type = rt.view_type || ''
  roomTypeForm.image_files = Array.isArray(rt.image_files) ? [...rt.image_files] : []
  roomTypeForm.images = Array.isArray(rt.images) ? [...rt.images] : []
  roomTypeMsg.value = ''
  roomTypeErr.value = ''
}

function applyRoomTypeRow(row) {
  const idx = roomTypeOptions.value.findIndex((r) => r.id === row.id)
  if (idx >= 0) roomTypeOptions.value[idx] = { ...roomTypeOptions.value[idx], ...row }
  selectRoomTypeForEdit(row)
}

async function saveRoomTypeDetails() {
  if (!roomTypeForm.id || roomTypeBusy.value) return
  roomTypeBusy.value = true
  roomTypeMsg.value = ''
  roomTypeErr.value = ''
  try {
    const { data } = await api.patch(
      `/api/admin/${hotelSlug.value}/room-types/${roomTypeForm.id}/details`,
      {
        description: roomTypeForm.description,
        view_type: roomTypeForm.view_type || null,
        images: roomTypeForm.image_files,
      },
    )
    applyRoomTypeRow(data)
    await Swal.fire({
      title: 'บันทึกแล้ว',
      text: `อัปเดต ${roomTypeForm.name || 'Roomtype'} สำเร็จ`,
      icon: 'success',
      timer: 1600,
      showConfirmButton: false,
    })
  } catch (err) {
    const msg = err?.response?.data?.error || 'บันทึกไม่สำเร็จ'
    roomTypeErr.value = msg
    await Swal.fire({ title: 'บันทึกไม่สำเร็จ', text: msg, icon: 'error' })
  } finally {
    roomTypeBusy.value = false
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.readAsDataURL(file)
  })
}

async function uploadRoomTypeImages(event) {
  const files = Array.from(event?.target?.files || [])
  if (event?.target) event.target.value = ''
  if (!roomTypeForm.id || !files.length) return
  if (roomTypeForm.image_files.length >= 5) {
    roomTypeErr.value = 'อัปโหลดรูปได้ไม่เกิน 5 รูป'
    return
  }
  roomTypeUploading.value = true
  roomTypeErr.value = ''
  roomTypeMsg.value = ''
  try {
    for (const file of files) {
      if (roomTypeForm.image_files.length >= 5) break
      const dataUrl = await readFileAsDataUrl(file)
      const { data } = await api.post(
        `/api/admin/${hotelSlug.value}/room-types/${roomTypeForm.id}/images`,
        { image_data: dataUrl, image_mime: file.type },
      )
      applyRoomTypeRow(data)
    }
    roomTypeMsg.value = 'อัปโหลดรูปแล้ว'
  } catch (err) {
    roomTypeErr.value = err?.response?.data?.error || 'อัปโหลดรูปไม่สำเร็จ'
  } finally {
    roomTypeUploading.value = false
  }
}

async function removeRoomTypeImage(filename) {
  if (!roomTypeForm.id || !filename) return
  roomTypeBusy.value = true
  roomTypeErr.value = ''
  try {
    const { data } = await api.delete(
      `/api/admin/${hotelSlug.value}/room-types/${roomTypeForm.id}/images/${encodeURIComponent(filename)}`,
    )
    applyRoomTypeRow(data)
    roomTypeMsg.value = 'ลบรูปแล้ว'
  } catch (err) {
    roomTypeErr.value = err?.response?.data?.error || 'ลบรูปไม่สำเร็จ'
  } finally {
    roomTypeBusy.value = false
  }
}

function moveRoomTypeImage(index, delta) {
  const next = index + delta
  if (next < 0 || next >= roomTypeForm.image_files.length) return
  const files = [...roomTypeForm.image_files]
  const urls = [...roomTypeForm.images]
  ;[files[index], files[next]] = [files[next], files[index]]
  ;[urls[index], urls[next]] = [urls[next], urls[index]]
  roomTypeForm.image_files = files
  roomTypeForm.images = urls
}

async function loadDashboard() {
  loading.value = true
  try {
    const { data } = await api.get(`/api/admin/${hotelSlug.value}/dashboard`)
    dashboard.value = data
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function bookingListParams(listTab = bookingListTab.value) {
  if (listTab === 'cancelled') return { status: 'cancelled', limit: 100 }
  if (listTab === 'checked_in') return { status: 'checked_in', limit: 100 }
  if (listTab === 'checkin_today') {
    return {
      check_in_on: bangkokTodayYmd(),
      exclude_cancelled: '1',
      limit: 100,
    }
  }
  return { exclude_cancelled: '1', limit: 100 }
}

async function loadBookings() {
  loading.value = true
  try {
    const { data } = await api.get(`/api/admin/${hotelSlug.value}/bookings`, {
      params: bookingListParams(),
    })
    bookings.value = data
    revokeSlipUrls()
    await loadSlipImages(data)
  } finally {
    loading.value = false
  }
}

function switchBookingListTab(key) {
  if (bookingListTab.value === key) return
  bookingListTab.value = key
  loadBookings()
}

function revokeSlipUrls() {
  for (const url of Object.values(slipUrls.value)) {
    if (url) URL.revokeObjectURL(url)
  }
  slipUrls.value = {}
}

async function loadSlipImages(list) {
  const next = { ...slipUrls.value }
  for (const b of list || []) {
    if (!b.slip_status || next[b.id]) continue
    try {
      const response = await api.get(`/api/admin/${hotelSlug.value}/bookings/${b.id}/slip`, { responseType: 'blob' })
      next[b.id] = URL.createObjectURL(response.data)
    } catch {
      next[b.id] = ''
    }
  }
  slipUrls.value = next
}

const HK_LABEL = {
  VC:  'ว่าง/สะอาด',
  VD:  'ว่าง/สกปรก',
  OC:  'มีแขก/สะอาด',
  OD:  'มีแขก/สกปรก',
  OOO: 'ปิดห้อง',
}

const ROOM_STATUS_FILTERS = [
  { key: 'all',          label: 'ทั้งหมด',   tone: 'all' },
  { key: 'arrivalToday', label: 'เข้าวันนี้', tone: 'arrival' },
  { key: 'inHouse',      label: 'มีแขก',     tone: 'oc' },
  { key: 'clean',        label: 'สะอาด',     tone: 'vc' },
  { key: 'dirty',        label: 'สกปรก',     tone: 'vd' },
  { key: 'outOfOrder',   label: 'ปิดห้อง',   tone: 'ooo' },
]

function hkOf(r) {
  return String(r.hk_status || r.rm_status || r.status || '').trim().toUpperCase()
}

function isArrivalToday(r) {
  return Boolean(r?.arrival_today)
}

function roomCardTone(r) {
  if (isArrivalToday(r)) return 'arrival-today'
  return hkOf(r).toLowerCase()
}

function roomStatusLabel(r) {
  if (isArrivalToday(r)) return 'เข้าวันนี้'
  const code = hkOf(r)
  return HK_LABEL[code] || code
}

const roomFloors = computed(() => {
  const set = new Set()
  for (const r of rooms.value) {
    const fl = Number(r.floor)
    if (Number.isFinite(fl) && fl > 0) set.add(fl)
  }
  return [...set].sort((a, b) => a - b)
})

const roomCounts = computed(() => {
  const c = { all: rooms.value.length, inHouse: 0, clean: 0, dirty: 0, outOfOrder: 0, arrivalToday: 0 }
  for (const r of rooms.value) {
    const s = hkOf(r)
    if (s === 'OC' || s === 'OD') c.inHouse++
    if (s === 'VC' || s === 'OC') c.clean++
    if (s === 'VD' || s === 'OD') c.dirty++
    if (s === 'OOO') c.outOfOrder++
    if (isArrivalToday(r)) c.arrivalToday++
  }
  return c
})

const filteredRooms = computed(() => {
  let list = rooms.value
  const f = roomFilter.value
  if (f !== 'all') {
    list = list.filter((r) => {
      const s = hkOf(r)
      if (f === 'arrivalToday') return isArrivalToday(r)
      if (f === 'inHouse')    return s === 'OC' || s === 'OD'
      if (f === 'clean')      return s === 'VC' || s === 'OC'
      if (f === 'dirty')      return s === 'VD' || s === 'OD'
      if (f === 'outOfOrder') return s === 'OOO'
      return true
    })
  }
  if (selectedFloor.value !== 'all') {
    const floor = Number(selectedFloor.value)
    list = list.filter((r) => Number(r.floor) === floor)
  }
  return list
})

function sortRoomNo(a, b) {
  return String(a).localeCompare(String(b), 'en', { numeric: true })
}

const vacantCleanRooms = computed(() => {
  const list = rooms.value.filter((r) => {
    if (useKioskRooms.value && roomsSource.value === 'kiosk') return hkOf(r) === 'VC'
    return r.status === 'available'
  })
  return [...list].sort((a, b) => {
    const fa = Number(a.floor) || 0
    const fb = Number(b.floor) || 0
    if (fa !== fb) return fa - fb
    return sortRoomNo(a.room_number, b.room_number)
  })
})

const vacantCleanByFloor = computed(() => {
  const map = new Map()
  for (const r of vacantCleanRooms.value) {
    const fl = Number(r.floor)
    const key = Number.isFinite(fl) && fl > 0 ? fl : 0
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0])
})

const roomsUpdatedLabel = computed(() => {
  if (!roomsFetchedAt.value) return ''
  return new Date(roomsFetchedAt.value).toLocaleTimeString('th-TH', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
})

function stopRoomsPoll() {
  if (roomsPollTimer) {
    clearInterval(roomsPollTimer)
    roomsPollTimer = null
  }
}

function startRoomsPoll() {
  stopRoomsPoll()
  if (!useKioskRooms.value || roomsSource.value !== 'kiosk') return
  roomsPollTimer = setInterval(() => loadRooms({ silent: true }), 15000)
}

async function loadLocalRooms() {
  roomsSource.value = 'local'
  stopRoomsPoll()
  const [rRooms, rTypes] = await Promise.all([
    api.get(`/api/admin/${hotelSlug.value}/rooms`),
    api.get(`/api/admin/${hotelSlug.value}/room-types`),
  ])
  rooms.value     = rRooms.data
  roomTypes.value = rTypes.data
  roomsFetchedAt.value = new Date().toISOString()
  if (!newRoom.room_type_id && rTypes.data?.[0]?.id) newRoom.room_type_id = rTypes.data[0].id
}

async function loadRooms({ silent = false } = {}) {
  roomsError.value = ''
  if (!silent) loading.value = true
  else roomsRefreshing.value = true
  try {
    if (!showKioskTab.value) {
      await loadLocalRooms()
      return
    }
    const { data } = await api.get(`/api/admin/${hotelSlug.value}/kiosk-rooms`)
    if (data.source === 'kiosk') {
      roomsSource.value    = 'kiosk'
      rooms.value          = data.rooms || []
      roomsFetchedAt.value = data.fetched_at || new Date().toISOString()
      if (tab.value === 'rooms' || tab.value === 'dashboard') startRoomsPoll()
      return
    }
    await loadLocalRooms()
  } catch (err) {
    roomsError.value = err?.response?.data?.error || 'โหลดห้องพักไม่สำเร็จ'
  } finally {
    loading.value = false
    roomsRefreshing.value = false
  }
}

async function setInventoryMode(mode) {
  const enableKiosk = mode === 'kiosk'
  const currentlyKiosk = kioskConfig.value.kiosk_enabled === 'true'
  if (enableKiosk === currentlyKiosk) return

  if (!enableKiosk) {
    const result = await Swal.fire({
      title: 'เปลี่ยนเป็นจัดการห้องเอง?',
      text: 'จะปิดการดึงห้องจาก PMS — ต้องเพิ่มประเภทห้องและเลขห้องในแท็บห้องพักเอง',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'ยืนยัน',
      cancelButtonText: 'ยกเลิก',
    })
    if (!result.isConfirmed) return
  }

  kioskConfig.value.kiosk_enabled = enableKiosk ? 'true' : 'false'
  await saveKioskConfig()
}

async function addRoomType() {
  if (!newType.name.trim()) {
    roomsError.value = 'กรอกชื่อประเภทห้อง'
    return
  }
  inventoryBusy.value = true
  roomsError.value = ''
  try {
    const base = {
      name: newType.name.trim(),
      price_per_night: 0,
      description: newType.description || '',
      view_type: newType.view_type || null,
    }
    let typeId = editingTypeId.value
    if (typeId) {
      await api.patch(`/api/admin/${hotelSlug.value}/room-types/${typeId}`, {
        name: base.name,
      })
      await api.patch(`/api/admin/${hotelSlug.value}/room-types/${typeId}/details`, {
        description: base.description,
        view_type: base.view_type,
        images: newType.image_files,
      })
    } else {
      const { data } = await api.post(`/api/admin/${hotelSlug.value}/room-types`, base)
      typeId = data.id
      for (const item of pendingTypeImages.value) {
        const dataUrl = await readFileAsDataUrl(item.file)
        await api.post(
          `/api/admin/${hotelSlug.value}/room-types/${typeId}/images`,
          { image_data: dataUrl, image_mime: item.file.type },
        )
      }
    }
    cancelEditType()
    await loadRooms({ silent: true })
    await Swal.fire({
      title: 'บันทึกแล้ว',
      text: 'อัปเดตประเภทห้องสำเร็จ',
      icon: 'success',
      timer: 1400,
      showConfirmButton: false,
    })
  } catch (err) {
    const msg = err?.response?.data?.error || (editingTypeId.value ? 'แก้ไขประเภทห้องไม่สำเร็จ' : 'เพิ่มประเภทห้องไม่สำเร็จ')
    roomsError.value = msg
    await Swal.fire({ title: 'บันทึกไม่สำเร็จ', text: msg, icon: 'error' })
  } finally {
    inventoryBusy.value = false
  }
}

function applyLocalTypeImages(row) {
  newType.image_files = Array.isArray(row.image_files) ? [...row.image_files] : []
  newType.images = Array.isArray(row.images) ? [...row.images] : []
}

function resetTypeFormFields() {
  editingTypeId.value = null
  newType.name = ''
  newType.price_per_night = ''
  newType.description = ''
  newType.view_type = ''
  newType.image_files = []
  newType.images = []
  pendingTypeImages.value = []
}

function openAddTypeModal() {
  resetTypeFormFields()
  roomsError.value = ''
  showTypeModal.value = true
}

function startEditType(rt) {
  editingTypeId.value = rt.id
  newType.name = rt.name
  newType.price_per_night = ''
  newType.description = rt.description || ''
  newType.view_type = rt.view_type || ''
  newType.image_files = Array.isArray(rt.image_files) ? [...rt.image_files] : []
  newType.images = Array.isArray(rt.images) ? [...rt.images] : []
  pendingTypeImages.value = []
  roomsError.value = ''
  showTypeModal.value = true
}

function cancelEditType() {
  resetTypeFormFields()
  showTypeModal.value = false
}

async function uploadLocalTypeImages(event) {
  const files = Array.from(event?.target?.files || [])
  if (event?.target) event.target.value = ''
  if (!files.length) return

  const used = editingTypeId.value ? newType.image_files.length : pendingTypeImages.value.length
  if (used >= 5) {
    roomsError.value = 'อัปโหลดรูปได้ไม่เกิน 5 รูป'
    return
  }

  if (!editingTypeId.value) {
    const room = 5 - used
    for (const file of files.slice(0, room)) {
      const preview = await readFileAsDataUrl(file)
      pendingTypeImages.value.push({ file, preview })
    }
    return
  }

  typeImageUploading.value = true
  roomsError.value = ''
  try {
    for (const file of files) {
      if (newType.image_files.length >= 5) break
      const dataUrl = await readFileAsDataUrl(file)
      const { data } = await api.post(
        `/api/admin/${hotelSlug.value}/room-types/${editingTypeId.value}/images`,
        { image_data: dataUrl, image_mime: file.type },
      )
      applyLocalTypeImages(data)
    }
  } catch (err) {
    roomsError.value = err?.response?.data?.error || 'อัปโหลดรูปไม่สำเร็จ'
  } finally {
    typeImageUploading.value = false
  }
}

async function removeLocalTypeImage(item) {
  if (!item) return
  if (item.pending) {
    pendingTypeImages.value.splice(item.idx, 1)
    return
  }
  if (!editingTypeId.value || !item.filename) return
  typeImageUploading.value = true
  roomsError.value = ''
  try {
    const { data } = await api.delete(
      `/api/admin/${hotelSlug.value}/room-types/${editingTypeId.value}/images/${encodeURIComponent(item.filename)}`,
    )
    applyLocalTypeImages(data)
  } catch (err) {
    roomsError.value = err?.response?.data?.error || 'ลบรูปไม่สำเร็จ'
  } finally {
    typeImageUploading.value = false
  }
}

function moveLocalTypeImage(idx, dir) {
  if (!editingTypeId.value) {
    const next = idx + dir
    if (next < 0 || next >= pendingTypeImages.value.length) return
    const list = [...pendingTypeImages.value]
    ;[list[idx], list[next]] = [list[next], list[idx]]
    pendingTypeImages.value = list
    return
  }
  const next = idx + dir
  if (next < 0 || next >= newType.image_files.length) return
  const files = [...newType.image_files]
  const urls = [...newType.images]
  ;[files[idx], files[next]] = [files[next], files[idx]]
  ;[urls[idx], urls[next]] = [urls[next], urls[idx]]
  newType.image_files = files
  newType.images = urls
}

async function deleteRoomType(rt) {
  const result = await Swal.fire({
    title: `ลบประเภท ${rt.name}?`,
    text: 'ต้องไม่มีห้องที่ใช้ประเภทนี้อยู่',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
  })
  if (!result.isConfirmed) return
  inventoryBusy.value = true
  roomsError.value = ''
  try {
    await api.delete(`/api/admin/${hotelSlug.value}/room-types/${rt.id}`)
    if (editingTypeId.value === rt.id) cancelEditType()
    await loadRooms({ silent: true })
  } catch (err) {
    roomsError.value = err?.response?.data?.error || 'ลบประเภทห้องไม่สำเร็จ'
  } finally {
    inventoryBusy.value = false
  }
}

async function addRoom() {
  const roomNo = newRoom.room_number.trim()
  if (!roomNo || !newRoom.room_type_id) {
    roomsError.value = 'กรอกเลขห้องและเลือกประเภทห้อง'
    return
  }
  if (!ROOM_NO_RE.test(roomNo)) {
    roomsError.value = 'เลขห้องใช้ได้เฉพาะตัวอักษร ตัวเลข และขีด เช่น 203 หรือ A101'
    return
  }
  const floor = Number(newRoom.floor)
  inventoryBusy.value = true
  roomsError.value = ''
  try {
    const payload = {
      room_number: roomNo,
      floor: Number.isFinite(floor) ? floor : 1,
      room_type_id: newRoom.room_type_id,
      status: newRoom.status || 'available',
    }
    if (editingRoomId.value) {
      await api.patch(`/api/admin/${hotelSlug.value}/rooms/${editingRoomId.value}`, payload)
    } else {
      await api.post(`/api/admin/${hotelSlug.value}/rooms`, payload)
    }
    const wasEdit = Boolean(editingRoomId.value)
    cancelEditRoom()
    await loadRooms({ silent: true })
    await Swal.fire({
      title: 'บันทึกแล้ว',
      text: wasEdit ? 'อัปเดตห้องพักสำเร็จ' : 'เพิ่มห้องพักสำเร็จ',
      icon: 'success',
      timer: 1400,
      showConfirmButton: false,
    })
  } catch (err) {
    const msg = err?.response?.data?.error || (editingRoomId.value ? 'แก้ไขห้องไม่สำเร็จ' : 'เพิ่มห้องไม่สำเร็จ')
    roomsError.value = msg
    await Swal.fire({ title: 'บันทึกไม่สำเร็จ', text: msg, icon: 'error' })
  } finally {
    inventoryBusy.value = false
  }
}

function resetRoomFormFields() {
  editingRoomId.value = null
  newRoom.room_number = ''
  newRoom.floor = 1
  newRoom.status = 'available'
  if (roomTypes.value?.[0]?.id) newRoom.room_type_id = roomTypes.value[0].id
}

function openAddRoomModal() {
  resetRoomFormFields()
  roomsError.value = ''
  showRoomModal.value = true
}

function startEditRoom(room) {
  editingRoomId.value = room.id
  newRoom.room_number = room.room_number || ''
  newRoom.floor = room.floor == null || room.floor === '' ? 1 : Number(room.floor)
  newRoom.room_type_id = room.room_type_id
  newRoom.status = room.status || 'available'
  roomsError.value = ''
  showRoomModal.value = true
}

function cancelEditRoom() {
  resetRoomFormFields()
  showRoomModal.value = false
}

async function deleteRoom(room) {
  const result = await Swal.fire({
    title: `ลบห้อง ${room.room_number}?`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
  })
  if (!result.isConfirmed) return
  inventoryBusy.value = true
  roomsError.value = ''
  try {
    await api.delete(`/api/admin/${hotelSlug.value}/rooms/${room.id}`)
    if (editingRoomId.value === room.id) cancelEditRoom()
    await loadRooms({ silent: true })
  } catch (err) {
    roomsError.value = err?.response?.data?.error || 'ลบห้องไม่สำเร็จ'
  } finally {
    inventoryBusy.value = false
  }
}

const checkInReview = ref(null)
const checkInForm = reactive({
  guest_title: '',
  guest_first_name: '',
  guest_last_name: '',
  guest_sex: '',
  guest_nation: 'TH',
  guest_national_id: '',
  guest_passport: '',
  guest_birthday: '',
  guest_phone: '',
  guest_email: '',
  guest_car_no: '',
  guest_address1: '',
  guest_address2: '',
  guest_address3: '',
  special_requests: '',
})
const checkInBusy = ref(false)
const checkInError = ref('')

const GUEST_TITLES = ['นาย', 'นาง', 'นางสาว', 'Mr.', 'Mrs.', 'Ms.']
const GUEST_NATIONS = [
  { code: 'TH', name: 'ไทย' },
  { code: 'CN', name: 'จีน' },
  { code: 'JP', name: 'ญี่ปุ่น' },
  { code: 'KR', name: 'เกาหลี' },
  { code: 'US', name: 'อเมริกัน' },
  { code: 'GB', name: 'อังกฤษ' },
  { code: 'SG', name: 'สิงคโปร์' },
  { code: 'MY', name: 'มาเลเซีย' },
  { code: 'DE', name: 'เยอรมัน' },
  { code: 'FR', name: 'ฝรั่งเศส' },
  { code: 'AU', name: 'ออสเตรเลีย' },
  { code: 'OTHER', name: 'อื่นๆ' },
]

function formatStayDate(d) {
  if (!d) return '—'
  const ymd = String(d).slice(0, 10)
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('th-TH', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

function openCheckInReview(booking) {
  checkInReview.value = booking
  checkInError.value = ''
  checkInForm.guest_title = booking.guest_title || ''
  checkInForm.guest_first_name = booking.guest_first_name || ''
  checkInForm.guest_last_name = booking.guest_last_name || ''
  checkInForm.guest_sex = booking.guest_sex || ''
  checkInForm.guest_nation = booking.guest_nation || 'TH'
  checkInForm.guest_national_id = booking.guest_national_id || ''
  checkInForm.guest_passport = booking.guest_passport || ''
  checkInForm.guest_birthday = booking.guest_birthday ? String(booking.guest_birthday).slice(0, 10) : ''
  checkInForm.guest_phone = booking.guest_phone || ''
  checkInForm.guest_email = booking.guest_email || ''
  checkInForm.guest_car_no = booking.guest_car_no || ''
  checkInForm.guest_address1 = booking.guest_address1 || ''
  checkInForm.guest_address2 = booking.guest_address2 || ''
  checkInForm.guest_address3 = booking.guest_address3 || ''
  checkInForm.special_requests = booking.special_requests || ''
}

function closeCheckInReview() {
  if (checkInBusy.value) return
  checkInReview.value = null
  checkInError.value = ''
}

const walkInOpen = ref(false)
const walkInBusy = ref(false)
const walkInError = ref('')
const walkInPlans = ref([])
const walkInPlansLoading = ref(false)
const walkInRoom = ref(null)
const walkInForm = reactive({
  check_in_date: '',
  check_out_date: '',
  num_adults: 1,
  num_children: 0,
  rate_plan_id: '',
  include_breakfast: false,
  breakfast_count: 1,
  guest_title: '',
  guest_first_name: '',
  guest_last_name: '',
  guest_sex: '',
  guest_nation: 'TH',
  guest_phone: '',
  guest_email: '',
  special_requests: '',
})

const walkInSelectedPlan = computed(() =>
  walkInPlans.value.find((p) => String(p.id) === String(walkInForm.rate_plan_id)) || null
)
const walkInNights = computed(() => {
  if (!walkInForm.check_in_date || !walkInForm.check_out_date) return 0
  if (walkInForm.check_out_date <= walkInForm.check_in_date) return 0
  const a = new Date(`${walkInForm.check_in_date}T00:00:00`)
  const b = new Date(`${walkInForm.check_out_date}T00:00:00`)
  return Math.round((b - a) / 86400000)
})
const walkInQuote = computed(() => {
  const plan = walkInSelectedPlan.value
  if (!plan || walkInNights.value < 1) return null
  const room = Number(plan.price_per_night || 0) * walkInNights.value
  // เรทแพลนที่มีอาหารเช้า = รวม ABF เสมอ (เหมือนจองแขก)
  const bf = plan.includes_breakfast
    ? Number(plan.abf_per_person_per_night || 0) * Math.max(1, Number(walkInForm.breakfast_count) || 1) * walkInNights.value
    : 0
  return { room, breakfast: bf, total: room + bf }
})

async function loadWalkInPlans() {
  if (!walkInRoom.value?.room_type_id || !walkInForm.check_in_date || !walkInForm.check_out_date) {
    walkInPlans.value = []
    return
  }
  if (walkInForm.check_out_date <= walkInForm.check_in_date) {
    walkInPlans.value = []
    return
  }
  walkInPlansLoading.value = true
  walkInError.value = ''
  try {
    const { data } = await api.get(`/api/hotels/${hotelSlug.value}/available-rooms`, {
      params: {
        checkIn: walkInForm.check_in_date,
        checkOut: walkInForm.check_out_date,
        adults: walkInForm.num_adults,
        children: walkInForm.num_children,
      },
    })
    const list = Array.isArray(data) ? data : (data.types || [])
    const type = list.find((t) => String(t.id) === String(walkInRoom.value.room_type_id))
    walkInPlans.value = type?.rate_plans || []
    if (!walkInPlans.value.length) {
      walkInError.value = 'ไม่มีเรทแพลนครบราคาในช่วงวันที่เลือก'
    }
    if (!walkInPlans.value.some((p) => String(p.id) === String(walkInForm.rate_plan_id))) {
      walkInForm.rate_plan_id = walkInPlans.value[0]?.id || ''
    }
    if (walkInSelectedPlan.value?.includes_breakfast) {
      walkInForm.include_breakfast = true
      if (!walkInForm.breakfast_count || walkInForm.breakfast_count < 1) {
        walkInForm.breakfast_count = Math.max(1, Number(walkInForm.num_adults) + Number(walkInForm.num_children) || 1)
      }
    } else {
      walkInForm.include_breakfast = false
    }
  } catch (err) {
    walkInPlans.value = []
    walkInError.value = err?.response?.data?.error || 'โหลดเรทแพลนไม่สำเร็จ'
  } finally {
    walkInPlansLoading.value = false
  }
}

function openWalkInFromVacant(room) {
  if (!canBookFromVacant.value) return
  if (isArrivalToday(room)) {
    Swal.fire({
      icon: 'info',
      title: 'ห้องนี้มีแขกเข้าวันนี้',
      text: 'เลือกห้องอื่นที่ว่าง หรือดูที่แท็บการจอง',
      confirmButtonText: 'ตกลง',
    })
    return
  }
  walkInRoom.value = room
  walkInError.value = ''
  const today = bangkokTodayYmd()
  walkInForm.check_in_date = today
  walkInForm.check_out_date = addDaysYmd(today, 1)
  walkInForm.num_adults = 1
  walkInForm.num_children = 0
  walkInForm.rate_plan_id = ''
  walkInForm.include_breakfast = false
  walkInForm.breakfast_count = 1
  walkInForm.guest_title = ''
  walkInForm.guest_first_name = ''
  walkInForm.guest_last_name = ''
  walkInForm.guest_sex = ''
  walkInForm.guest_nation = 'TH'
  walkInForm.guest_phone = ''
  walkInForm.guest_email = ''
  walkInForm.special_requests = ''
  walkInPlans.value = []
  walkInOpen.value = true
  loadWalkInPlans()
}

function closeWalkIn() {
  if (walkInBusy.value) return
  walkInOpen.value = false
  walkInRoom.value = null
  walkInError.value = ''
}

async function submitWalkIn() {
  if (!walkInRoom.value) return
  if (!walkInForm.guest_title || !walkInForm.guest_sex
      || !String(walkInForm.guest_first_name).trim() || !String(walkInForm.guest_last_name).trim()) {
    walkInError.value = 'กรอกคำนำหน้า เพศ ชื่อ และนามสกุล'
    return
  }
  if (!walkInForm.rate_plan_id) {
    walkInError.value = 'เลือกเรทแพลน'
    return
  }
  walkInBusy.value = true
  walkInError.value = ''
  try {
    await api.post(`/api/admin/${hotelSlug.value}/bookings`, {
      room_id: walkInRoom.value.id,
      check_in_date: walkInForm.check_in_date,
      check_out_date: walkInForm.check_out_date,
      num_adults: Number(walkInForm.num_adults) || 1,
      num_children: Number(walkInForm.num_children) || 0,
      rate_plan_id: walkInForm.rate_plan_id,
      include_breakfast: Boolean(walkInSelectedPlan.value?.includes_breakfast),
      breakfast_count: walkInSelectedPlan.value?.includes_breakfast
        ? Number(walkInForm.breakfast_count) || 1
        : 0,
      guest_title: walkInForm.guest_title,
      guest_first_name: String(walkInForm.guest_first_name).trim(),
      guest_last_name: String(walkInForm.guest_last_name).trim(),
      guest_sex: walkInForm.guest_sex,
      guest_nation: walkInForm.guest_nation,
      guest_phone: String(walkInForm.guest_phone).trim() || undefined,
      guest_email: String(walkInForm.guest_email).trim() || undefined,
      special_requests: String(walkInForm.special_requests).trim() || undefined,
    })
    walkInOpen.value = false
    walkInRoom.value = null
    await Promise.all([loadDashboard(), loadRooms({ silent: true }), loadBookings()])
    await Swal.fire({
      icon: 'success',
      title: 'จองห้องแล้ว',
      text: 'บันทึกการจองแบบเลือกเลขห้องเรียบร้อย',
      confirmButtonText: 'ตกลง',
    })
  } catch (err) {
    walkInError.value = err?.response?.data?.error || 'จองไม่สำเร็จ'
  } finally {
    walkInBusy.value = false
  }
}

watch(
  () => [
    walkInForm.check_in_date,
    walkInForm.check_out_date,
    walkInForm.num_adults,
    walkInForm.num_children,
  ],
  () => {
    if (walkInOpen.value) loadWalkInPlans()
  }
)

watch(
  () => walkInForm.rate_plan_id,
  () => {
    if (!walkInOpen.value) return
    if (walkInSelectedPlan.value?.includes_breakfast) {
      walkInForm.include_breakfast = true
      const party = Math.max(1, Number(walkInForm.num_adults) + Number(walkInForm.num_children) || 1)
      if (!walkInForm.breakfast_count || walkInForm.breakfast_count < 1) {
        walkInForm.breakfast_count = party
      }
    } else {
      walkInForm.include_breakfast = false
    }
  }
)

async function confirmCheckInReview() {
  const booking = checkInReview.value
  if (!booking) return
  if (!checkInForm.guest_title || !checkInForm.guest_sex
      || !String(checkInForm.guest_first_name).trim() || !String(checkInForm.guest_last_name).trim()) {
    checkInError.value = 'กรอกคำนำหน้า เพศ ชื่อ และนามสกุล'
    return
  }
  checkInBusy.value = true
  checkInError.value = ''
  try {
    const { data } = await api.patch(`/api/admin/${hotelSlug.value}/bookings/${booking.id}/status`, {
      status: 'checked_in',
      guest: {
        guest_title: checkInForm.guest_title,
        guest_first_name: String(checkInForm.guest_first_name).trim(),
        guest_last_name: String(checkInForm.guest_last_name).trim(),
        guest_sex: checkInForm.guest_sex,
        guest_nation: checkInForm.guest_nation,
        guest_national_id: String(checkInForm.guest_national_id).trim(),
        guest_passport: String(checkInForm.guest_passport).trim(),
        guest_birthday: checkInForm.guest_birthday || '',
        guest_phone: String(checkInForm.guest_phone).trim(),
        guest_email: String(checkInForm.guest_email).trim(),
        guest_car_no: String(checkInForm.guest_car_no).trim(),
        guest_address1: String(checkInForm.guest_address1).trim(),
        guest_address2: String(checkInForm.guest_address2).trim(),
        guest_address3: String(checkInForm.guest_address3).trim(),
        special_requests: String(checkInForm.special_requests).trim(),
      },
    })
    checkInReview.value = null
    await loadBookings()
    await showPmsResult(data?.pms, 'เช็คอินแล้ว')
  } catch (err) {
    checkInError.value = err?.response?.data?.error || 'เช็คอินไม่สำเร็จ'
  } finally {
    checkInBusy.value = false
  }
}

async function changeBookingStatus(booking, status) {
  if (status === 'checked_in' && !useKioskRooms.value) {
    openCheckInReview(booking)
    return
  }
  const labels = { confirmed: 'ยืนยันชำระ', cancelled: 'ยกเลิก', checked_in: 'เช็คอิน', checked_out: 'เช็คเอาต์' }
  const result = await Swal.fire({
    title: `${labels[status] || status}การจอง?`,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ยืนยัน',
    cancelButtonText: 'ยกเลิก',
  })
  if (!result.isConfirmed) return
  try {
    const { data } = await api.patch(`/api/admin/${hotelSlug.value}/bookings/${booking.id}/status`, { status })
    await loadBookings()
    await showPmsResult(data?.pms, 'เสร็จสิ้น')
  } catch (err) {
    Swal.fire({ title: 'ผิดพลาด', text: err?.response?.data?.error, icon: 'error' })
  }
}

async function approveSlip(bookingId) {
  try {
    const { data } = await api.patch(`/api/admin/${hotelSlug.value}/bookings/${bookingId}/slip`, { slip_status: 'approved' })
    await loadBookings()
    await showPmsResult(data?.pms, 'ยืนยันสลิปแล้ว')
  } catch (err) {
    Swal.fire({ title: 'ผิดพลาด', text: err?.response?.data?.error, icon: 'error' })
  }
}

async function retryPms(booking) {
  const result = await Swal.fire({
    title: 'ส่งการจองไป PMS อีกครั้ง?',
    icon: 'question',
    showCancelButton: true,
    confirmButtonText: 'ส่ง',
    cancelButtonText: 'ยกเลิก',
  })
  if (!result.isConfirmed) return
  try {
    const { data } = await api.post(`/api/admin/${hotelSlug.value}/bookings/${booking.id}/push-pms`)
    await loadBookings()
    await showPmsResult(
      {
        sent: Boolean(data?.newResvNo),
        newResvNo: data?.newResvNo,
        roomNo: data?.roomNo,
        otaBookingNo: data?.otaBookingNo,
        skipped: data?.skipped,
      },
      'ส่ง PMS แล้ว',
    )
  } catch (err) {
    Swal.fire({ title: 'ส่ง PMS ไม่สำเร็จ', text: err?.response?.data?.error, icon: 'error' })
  }
}

async function deleteBooking(booking) {
  if (!auth.isSuperAdmin) return
  const result = await Swal.fire({
    title: 'ลบการจองถาวร?',
    text: `ลบ #${String(booking.id).slice(0, 8)} ของ ${booking.guest_name || booking.user_name || 'แขก'} — กู้คืนไม่ได้`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'ลบ',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#c0392b',
  })
  if (!result.isConfirmed) return
  try {
    const { data } = await api.delete(`/api/admin/${hotelSlug.value}/bookings/${booking.id}`)
    await loadBookings()
    await showPmsResult(data?.pms, 'ลบการจองแล้ว')
  } catch (err) {
    Swal.fire({ title: 'ลบไม่สำเร็จ', text: err?.response?.data?.error, icon: 'error' })
  }
}

function showPmsResult(pms, successTitle) {
  if (pms?.error) {
    return Swal.fire({
      title: successTitle,
      text: `แต่ส่ง PMS ไม่สำเร็จ: ${pms.error}`,
      icon: 'warning',
    })
  }
  if (pms?.newResvNo) {
    return Swal.fire({
      title: successTitle,
      text: `PMS ResvNo ${pms.newResvNo}${pms.roomNo ? ` · ห้อง ${pms.roomNo}` : ''}${pms.otaBookingNo ? ` · เลขจอง ${pms.otaBookingNo}` : ''}`,
      icon: 'success',
      timer: 1600,
      showConfirmButton: false,
    })
  }
  return Swal.fire({ title: successTitle, icon: 'success', timer: 1200, showConfirmButton: false })
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('th-TH', { month: 'short', day: 'numeric' })
}

function canCancelOnWeb(booking) {
  return ['awaiting_payment', 'pending', 'confirmed'].includes(booking.status)
}

function statusLabel(s, booking) {
  if (s === 'awaiting_payment') {
    const total = Number(booking?.total_price) || 0
    const due = Number(booking?.deposit_amount) || 0
    return total > 0 && due >= total ? 'รอชำระเต็มจำนวน' : 'รอมัดจำ'
  }
  return { pending: 'รอยืนยัน', confirmed: 'ยืนยันแล้ว', checked_in: 'เช็คอินแล้ว', checked_out: 'เช็คเอาต์แล้ว', cancelled: 'ยกเลิก' }[s] || s
}

onMounted(() => {
  loadDashboard()
  loadKioskConfig()
  loadViewTypeOptions()
  loadRooms({ silent: true })
  startRoomsPoll()
})

function switchTab(t) {
  if (t === 'kiosk' && !showKioskTab.value) t = 'rooms'
  tab.value = t
  if (t === 'bookings') loadBookings()
  if (t === 'rooms') loadRooms()
  if (t === 'kiosk') loadKioskConfig()
  if (t === 'dashboard') {
    loadDashboard()
    loadRooms({ silent: true })
  }
}

watch(tab, (t) => {
  if (t === 'rooms' || t === 'dashboard') startRoomsPoll()
  else stopRoomsPoll()
})

watch(showKioskTab, (on) => {
  if (!on && tab.value === 'kiosk') tab.value = 'rooms'
  loadRooms({ silent: true })
})

onUnmounted(() => {
  stopRoomsPoll()
  revokeSlipUrls()
})

const guestHotelUrl = computed(() => {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  return `${origin}/${hotelSlug.value}`
})

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.setAttribute('readonly', '')
      el.style.position = 'fixed'
      el.style.left = '-9999px'
      document.body.appendChild(el)
      el.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(el)
      return ok
    } catch {
      return false
    }
  }
}

async function shareHotelLink() {
  const url = guestHotelUrl.value
  const name = hotelStore.hotelName
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: name,
        text: `จองห้องพัก ${name}`,
        url,
      })
      return
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
  }
  const copied = await copyText(url)
  if (copied) {
    await Swal.fire({
      title: 'คัดลอกลิงก์แล้ว',
      text: url,
      icon: 'success',
      timer: 2200,
      showConfirmButton: false,
    })
    return
  }
  await Swal.fire({ title: 'ลิงก์โรงแรมนี้', text: url, icon: 'info' })
}
</script>

<template>
  <div class="admin-page app-page">
    <AccountMenuDrawer ref="accountMenuRef" />

    <header class="page-header">
      <router-link :to="hotelPath('/bookings')" class="icon-btn admin-back-btn" title="กลับหน้าจอง">
        <i class="ti ti-arrow-left"></i>
      </router-link>
      <h1 class="page-title">แอดมิน — {{ hotelStore.hotelName }}</h1>
      <button class="icon-btn" @click="accountMenuRef?.open()">
        <i class="ti ti-user-circle"></i>
      </button>
    </header>

    <div class="admin-links">
      <button type="button" class="admin-link" title="แชร์ลิงก์จองของโรงแรมนี้ให้ลูกค้า" @click="shareHotelLink">
        <i class="ti ti-share"></i> แชร์ลิงก์
      </button>
      <router-link v-if="showSettingsTab" :to="hotelPath('/admin/config')" class="admin-link">
        <i class="ti ti-building-cog"></i> ตั้งค่าโรงแรม
      </router-link>
      <router-link v-if="auth.isSuperAdmin" :to="hotelPath('/admin/platform')" class="admin-link">
        <i class="ti ti-toggle-right"></i> ฟังก์ชันสาขา
      </router-link>
    </div>

    <!-- Tab bar -->
    <div class="tab-bar">
      <button :class="['tab-btn', { active: tab === 'dashboard' }]" @click="switchTab('dashboard')">ภาพรวม</button>
      <button :class="['tab-btn', { active: tab === 'bookings' }]"  @click="switchTab('bookings')">การจอง</button>
      <button v-if="showRoomsTab" :class="['tab-btn', { active: tab === 'rooms' }]" @click="switchTab('rooms')">ห้องพัก</button>
      <button :class="['tab-btn', { active: tab === 'channel' }]" @click="switchTab('channel')">ราคาขาย</button>
      <button v-if="showKioskTab" :class="['tab-btn', { active: tab === 'kiosk' }]" @click="switchTab('kiosk')">PMS</button>
    </div>

    <!-- Dashboard -->
    <section v-if="tab === 'dashboard'" class="admin-section">
      <div v-if="loading" class="state-card"><i class="ti ti-loader-2 state-card-icon spin"></i></div>
      <template v-else-if="dashboard">
        <!-- Today -->
        <div class="stats-row" :class="{ 'stats-row--pms': dashboard.pms }">
          <div v-if="!dashboard.pms" class="stat-card card">
            <p class="stat-label">เช็คอินวันนี้</p>
            <p class="stat-value">{{ dashboard.today.check_ins }}</p>
          </div>
          <div v-if="!dashboard.pms" class="stat-card card">
            <p class="stat-label">เช็คเอาต์วันนี้</p>
            <p class="stat-value">{{ dashboard.today.check_outs }}</p>
          </div>
          <div class="stat-card card">
            <p class="stat-label">จองวันนี้</p>
            <p class="stat-value">{{ dashboard.today.booked }}</p>
          </div>
          <div class="stat-card card">
            <p class="stat-label">ยกเลิกวันนี้</p>
            <p class="stat-value">{{ dashboard.today.cancelled }}</p>
          </div>
        </div>

        <!-- Vacant clean rooms from ห้องพัก / Kiosk VC -->
        <div class="card info-card">
          <div class="info-title-row">
            <h2 class="info-title">ห้องว่างสะอาด</h2>
            <span class="stat-chip">{{ vacantCleanRooms.length }} ห้อง</span>
          </div>
          <p class="muted vacant-source">
            <template v-if="useKioskRooms && roomsSource === 'kiosk'">ดึงเลขห้องสถานะ VC จากแท็บห้องพัก (PMS)</template>
            <template v-else>
              ดึงเลขห้องสถานะว่างจากแท็บห้องพัก
              <span v-if="canBookFromVacant"> · กดเลขห้องเพื่อจองแบบเลือกห้อง</span>
            </template>
            <span v-if="roomsUpdatedLabel"> · อัปเดต {{ roomsUpdatedLabel }}</span>
          </p>
          <div v-if="vacantCleanByFloor.length" class="vacant-floors">
            <div v-for="[floor, floorRooms] in vacantCleanByFloor" :key="floor" class="vacant-floor">
              <p class="vacant-floor-label">{{ floor > 0 ? `ชั้น ${floor}` : 'ไม่ระบุชั้น' }}</p>
              <div class="vacant-chips">
                <button
                  v-for="r in floorRooms"
                  :key="r.room_number || r.id"
                  type="button"
                  class="vacant-chip"
                  :class="{
                    'vacant-chip--arrival': isArrivalToday(r),
                    'vacant-chip--clickable': canBookFromVacant && !isArrivalToday(r),
                  }"
                  :disabled="!canBookFromVacant"
                  :title="isArrivalToday(r) ? 'เข้าวันนี้' : (canBookFromVacant ? 'กดเพื่อจองห้องนี้' : undefined)"
                  @click="openWalkInFromVacant(r)"
                >
                  {{ r.room_number }}
                </button>
              </div>
            </div>
          </div>
          <p v-else class="muted">ไม่มีห้องว่างสะอาด</p>
        </div>
      </template>
    </section>

    <!-- Bookings -->
    <section v-if="tab === 'bookings'" class="admin-section">
      <div class="booking-list-tabs" role="tablist" aria-label="กรองรายการจอง">
        <button
          v-for="item in BOOKING_LIST_TABS"
          :key="item.key"
          type="button"
          role="tab"
          class="booking-list-tab"
          :class="{ active: bookingListTab === item.key }"
          :aria-selected="bookingListTab === item.key"
          @click="switchBookingListTab(item.key)"
        >{{ item.label }}</button>
      </div>
      <div v-if="loading" class="state-card"><i class="ti ti-loader-2 state-card-icon spin"></i></div>
      <div v-else-if="!bookings.length" class="state-card">
        <p class="state-card-title">
          {{ bookingListTab === 'cancelled'
            ? 'ไม่มีการจองที่ยกเลิก'
            : bookingListTab === 'checked_in'
              ? 'ไม่มีการจองที่เช็คอินแล้ว'
              : bookingListTab === 'checkin_today'
                ? 'ไม่มีการจองเข้าวันนี้'
                : 'ไม่มีการจอง' }}
        </p>
      </div>
      <div v-else class="booking-list">
        <div v-for="b in bookings" :key="b.id" class="card booking-card">
          <div class="booking-header">
            <span :class="['booking-status', `status-${b.status}`]">{{ statusLabel(b.status, b) }}</span>
            <span class="booking-id mono">#{{ b.id.slice(0, 8) }}</span>
          </div>
          <div class="booking-meta">
            <span class="guest-name">{{ b.guest_name || b.user_name }}</span>
            <span v-if="b.guest_phone" class="guest-phone">{{ b.guest_phone }}</span>
          </div>
          <div class="booking-dates">
            {{ formatDate(b.check_in_date) }} → {{ formatDate(b.check_out_date) }}
          </div>
          <div class="booking-rooms" v-if="b.rooms?.[0]?.room_type_name">
            <span class="room-tag">{{ b.rooms[0].room_type_name }} ห้อง {{ b.rooms[0].room_number }}</span>
          </div>
          <div class="booking-price">฿{{ Number(b.total_price).toLocaleString() }}</div>
          <p v-if="b.pms_resv_no" class="pms-note">
            ส่ง PMS แล้ว · ResvNo {{ b.pms_resv_no }}<span v-if="b.pms_room_no"> · ห้อง {{ b.pms_room_no }}</span>
            <span v-if="b.pms_ota_booking_no"> · เลขจองเข้าพัก {{ b.pms_ota_booking_no }}</span>
            <span v-if="useKioskRooms"> · เช็คอินที่ PMS · ยกเลิกบนเว็บจะส่ง CXL</span>
          </p>
          <p v-else-if="b.pms_last_error" class="pms-note pms-error">ส่ง PMS ไม่สำเร็จ: {{ b.pms_last_error }}</p>
          <p v-if="b.status === 'awaiting_payment' && b.slip_status !== 'pending'" class="pms-note">
            รอลูกค้าอัปโหลดสลิป หรือกดยืนยันชำระถ้าได้รับเงินแล้ว
          </p>
          <p v-if="b.status === 'cancelled' && b.cancelled_reason" class="pms-note">{{ b.cancelled_reason }}</p>
          <div v-if="slipUrls[b.id]" class="slip-preview">
            <img :src="slipUrls[b.id]" alt="สลิปโอนเงิน" class="slip-img" />
          </div>
          <BookingPolicyNotes
            :cancellation-policy="b.cancellation_policy"
            :non-smoking="Boolean(b.non_smoking)"
            :non-smoking-fine="b.non_smoking_fine"
          />
          <div class="booking-actions">
            <button v-if="b.slip_status === 'pending'" class="btn btn-sm btn-primary" @click="approveSlip(b.id)">ยืนยันสลิป</button>
            <button
              v-if="b.status === 'awaiting_payment' && b.slip_status !== 'pending'"
              class="btn btn-sm btn-primary"
              @click="changeBookingStatus(b, 'confirmed')"
            >ยืนยันชำระ</button>
            <button v-if="b.status === 'pending'" class="btn btn-sm btn-primary" @click="changeBookingStatus(b, 'confirmed')">ยืนยัน</button>
            <button v-if="!useKioskRooms && b.status === 'confirmed'" class="btn btn-sm btn-primary" @click="changeBookingStatus(b, 'checked_in')">เช็คอิน</button>
            <button v-if="!useKioskRooms && b.status === 'checked_in'" class="btn btn-sm btn-primary" @click="changeBookingStatus(b, 'checked_out')">เช็คเอาต์</button>
            <button
              v-if="canCancelOnWeb(b)"
              class="btn btn-sm btn-outline-danger"
              @click="changeBookingStatus(b, 'cancelled')"
            >ยกเลิก</button>
            <button
              v-if="useKioskRooms && ['awaiting_payment','pending','confirmed','checked_in'].includes(b.status) && !b.pms_resv_no"
              class="btn btn-sm btn-outline"
              @click="retryPms(b)"
            >ส่งไป PMS</button>
            <button
              v-if="auth.isSuperAdmin"
              class="btn btn-sm btn-outline-danger"
              type="button"
              @click="deleteBooking(b)"
            >ลบ</button>
          </div>
        </div>
      </div>
    </section>

    <!-- Rooms -->
    <section v-if="tab === 'rooms'" class="admin-section">
      <div v-if="loading" class="state-card"><i class="ti ti-loader-2 state-card-icon spin"></i></div>
      <div v-else>
        <p v-if="roomsError" class="error-msg">{{ roomsError }}</p>

        <!-- สลับใช้ PMS / จัดการห้องเอง ทำที่แท็บ PMS เท่านั้น -->
        <div v-if="showKioskTab && !useKioskRooms" class="card info-card inventory-mode-card">
          <label class="form-label">แหล่งข้อมูลห้องพัก</label>
          <div class="mode-slide" role="tablist" aria-label="เลือกใช้ PMS หรือจัดการห้องเอง">
            <button
              type="button"
              class="mode-slide-btn"
              :class="{ active: kioskConfig.kiosk_enabled === 'true' }"
              :disabled="kioskSaving"
              @click="setInventoryMode('kiosk')"
            >ใช้ PMS</button>
            <button
              type="button"
              class="mode-slide-btn"
              :class="{ active: kioskConfig.kiosk_enabled !== 'true' }"
              :disabled="kioskSaving"
              @click="setInventoryMode('local')"
            >จัดการห้องเอง</button>
          </div>
          <p class="muted vacant-source">
            ตอนนี้จัดการห้องในระบบจอง — ถ้าจะใช้ PMS ให้ไปเปิดที่แท็บ PMS
          </p>
        </div>

        <div class="rooms-toolbar">
          <div class="rooms-live-bar">
            <span v-if="useKioskRooms && roomsSource === 'kiosk'" class="live-badge">
              <span class="live-dot" :class="{ pulse: roomsRefreshing }"></span>
              PMS live
            </span>
            <span v-else class="muted">ห้องในระบบจอง — ใช้ตอนแขกกดจอง</span>
            <div class="rooms-live-meta">
              <span v-if="roomsUpdatedLabel" class="rooms-updated">อัปเดต {{ roomsUpdatedLabel }}</span>
              <button class="icon-btn rooms-refresh" title="รีเฟรช" :disabled="roomsRefreshing" @click="loadRooms({ silent: true })">
                <i class="ti ti-refresh" :class="{ spin: roomsRefreshing }"></i>
              </button>
            </div>
          </div>

          <template v-if="useKioskRooms">
            <div class="hk-filter-grid" role="tablist" aria-label="กรองสถานะห้อง">
              <button
                v-for="item in ROOM_STATUS_FILTERS"
                :key="item.key"
                type="button"
                role="tab"
                :aria-selected="roomFilter === item.key"
                :class="['hk-filter', `tone-${item.tone}`, { active: roomFilter === item.key }]"
                @click="roomFilter = item.key"
              >
                <span class="hk-filter-count">{{ roomCounts[item.key] }}</span>
                <span class="hk-filter-label">{{ item.label }}</span>
              </button>
            </div>

            <div v-if="roomFloors.length" class="floor-row">
              <span class="floor-row-label">ชั้น</span>
              <div class="floor-chips" role="tablist" aria-label="กรองชั้น">
                <button
                  type="button"
                  :class="['floor-chip', { active: selectedFloor === 'all' }]"
                  @click="selectedFloor = 'all'"
                >ทั้งหมด</button>
                <button
                  v-for="fl in roomFloors" :key="fl"
                  type="button"
                  :class="['floor-chip', { active: selectedFloor === String(fl) }]"
                  @click="selectedFloor = String(fl)"
                >{{ fl }}</button>
              </div>
            </div>
          </template>
        </div>

        <template v-if="useKioskRooms">

          <div v-if="filteredRooms.length" class="kiosk-room-grid">
            <div
              v-for="r in filteredRooms"
              :key="r.room_number"
              :class="['kiosk-room-card', `hk-${roomCardTone(r)}`]"
            >
              <div class="kiosk-room-head">
                <strong class="kiosk-room-no">{{ r.room_number }}</strong>
                <span class="room-status" :class="`hk-badge-${roomCardTone(r)}`">
                  {{ roomStatusLabel(r) }}
                </span>
              </div>
              <p class="kiosk-room-meta">
                <span v-if="r.floor != null">ชั้น {{ r.floor }}</span>
                <span v-if="r.room_type">{{ r.room_type }}</span>
              </p>
              <p v-if="r.guest_name" class="kiosk-room-guest">
                <i class="ti ti-user"></i> {{ r.guest_name }}
              </p>
              <p v-else class="kiosk-room-guest muted">Vacant</p>
            </div>
          </div>
          <div v-else class="state-card">
            <p class="state-card-title">{{ roomsSource === 'kiosk' ? 'ไม่มีห้องในหมวดนี้' : 'เชื่อม PMS ไม่ได้' }}</p>
            <p v-if="roomsSource !== 'kiosk'" class="muted">กรอกค่าเชื่อมต่อในแท็บ PMS แล้วทดสอบการเชื่อมต่อ</p>
          </div>
        </template>

        <template v-else>
          <div class="card info-card">
            <div class="inventory-section-head">
              <h2 class="info-title">ประเภทห้อง</h2>
              <button class="btn btn-primary btn-sm" type="button" :disabled="inventoryBusy" @click="openAddTypeModal">
                เพิ่มประเภท
              </button>
            </div>
            <ul v-if="roomTypes.length" class="info-list">
              <li v-for="rt in roomTypes" :key="rt.id" class="info-row">
                <span>
                  {{ rt.name }}
                  <template v-if="viewTypeLabel(rt.view_type)"> · {{ viewTypeLabel(rt.view_type) }}</template>
                  <template v-if="(rt.image_files || []).length"> · {{ rt.image_files.length }} รูป</template>
                  <span class="muted"> · ราคาที่แท็บราคาขาย</span>
                </span>
                <span class="inventory-room-actions">
                  <button class="btn btn-sm btn-outline" type="button" :disabled="inventoryBusy" @click="startEditType(rt)">แก้ไข</button>
                  <button class="btn btn-sm btn-outline-danger" type="button" :disabled="inventoryBusy" @click="deleteRoomType(rt)">ลบ</button>
                </span>
              </li>
            </ul>
            <p v-else class="muted">ยังไม่มีประเภทห้อง — กดเพิ่มประเภทเพื่อเริ่มต้น</p>
          </div>

          <div class="card info-card">
            <div class="inventory-section-head">
              <h2 class="info-title">ห้องพัก</h2>
              <button
                class="btn btn-primary btn-sm"
                type="button"
                :disabled="inventoryBusy || !roomTypes.length"
                @click="openAddRoomModal"
              >
                เพิ่มห้อง
              </button>
            </div>
            <p class="muted vacant-source">เลขห้องเหล่านี้จะถูกใช้ตอนแขกกดจอง — ใส่ตัวอักษรได้ เช่น A101</p>
            <ul v-if="rooms.length" class="info-list">
              <li v-for="r in rooms" :key="r.id" class="info-row inventory-room-row">
                <span>ห้อง {{ r.room_number }} (ชั้น {{ r.floor }}) — {{ r.room_type_name }} · {{ ROOM_STATUS_LABEL[r.status] || r.status }}</span>
                <span class="inventory-room-actions">
                  <button class="btn btn-sm btn-outline" type="button" :disabled="inventoryBusy" @click="startEditRoom(r)">แก้ไข</button>
                  <button class="btn btn-sm btn-outline-danger" type="button" :disabled="inventoryBusy" @click="deleteRoom(r)">ลบ</button>
                </span>
              </li>
            </ul>
            <p v-else class="muted">ยังไม่มีห้องพัก — เพิ่มประเภทห้องแล้วค่อยใส่เลขห้อง</p>
          </div>
        </template>
      </div>
    </section>

    <div
      v-if="showTypeModal"
      class="ci-backdrop rt-backdrop"
      @click.self="cancelEditType"
    >
      <div class="ci-sheet rt-sheet" role="dialog" aria-modal="true" aria-labelledby="local-type-title">
        <div class="ci-sheet-head">
          <h2 id="local-type-title" class="info-title">{{ editingTypeId ? 'แก้ไขประเภทห้อง' : 'เพิ่มประเภทห้อง' }}</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" :disabled="inventoryBusy" @click="cancelEditType">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="ci-sheet-body">
          <div class="inventory-form inventory-form--type-full">
            <label class="form-field form-field--full">
              <span class="form-label">ชื่อประเภท</span>
              <input v-model="newType.name" class="form-input" placeholder="เช่น Deluxe" :disabled="inventoryBusy" />
            </label>
            <p class="muted form-field--full">ราคาห้องตั้งที่แท็บ <strong>ราคาขาย</strong> (เรทแพลนต่อวัน) ไม่ตั้งในหน้านี้</p>
            <label class="form-field form-field--full">
              <span class="form-label">รายละเอียดห้องพัก</span>
              <textarea
                v-model="newType.description"
                class="form-input"
                rows="3"
                placeholder="เช่น ห้องกว้าง มีระเบียง"
                :disabled="inventoryBusy"
              ></textarea>
            </label>
            <label class="form-field">
              <span class="form-label">วิว</span>
              <select v-model="newType.view_type" class="form-input" :disabled="inventoryBusy">
                <option value="">ไม่ระบุ</option>
                <option v-for="opt in ROOM_VIEW_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </label>
            <div class="form-field form-field--full">
              <span class="form-label">รูปประเภทห้อง ({{ localTypeImageCount }}/5)</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                :disabled="typeImageUploading || inventoryBusy || localTypeImageCount >= 5"
                @change="uploadLocalTypeImages"
              />
              <p class="form-hint">รูปแรก = รูปหน้าปกในหน้าจอง · จัดลำดับด้วยลูกศร</p>
              <div v-if="localTypePreviews.length" class="roomtype-thumbs">
                <div v-for="item in localTypePreviews" :key="`${item.pending ? 'p' : 's'}-${item.idx}-${item.filename || item.url}`" class="roomtype-thumb">
                  <img :src="item.pending ? item.url : apiMediaUrl(item.url)" :alt="`รูป ${item.idx + 1}`" />
                  <span v-if="item.idx === 0" class="thumb-cover">ปก</span>
                  <div class="thumb-actions">
                    <button type="button" class="btn btn-sm btn-outline" :disabled="item.idx === 0" @click="moveLocalTypeImage(item.idx, -1)">↑</button>
                    <button type="button" class="btn btn-sm btn-outline" :disabled="item.idx >= localTypePreviews.length - 1" @click="moveLocalTypeImage(item.idx, 1)">↓</button>
                    <button type="button" class="btn btn-sm btn-outline-danger" :disabled="typeImageUploading" @click="removeLocalTypeImage(item)">ลบ</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="ci-sheet-foot">
          <button class="btn btn-outline" type="button" :disabled="inventoryBusy" @click="cancelEditType">ยกเลิก</button>
          <button class="btn btn-primary" type="button" :disabled="inventoryBusy || typeImageUploading" @click="addRoomType">
            {{ inventoryBusy ? 'กำลังบันทึก...' : (editingTypeId ? 'บันทึก' : 'เพิ่มประเภท') }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="showRoomModal"
      class="ci-backdrop rt-backdrop"
      @click.self="cancelEditRoom"
    >
      <div class="ci-sheet rt-sheet rt-sheet--sm" role="dialog" aria-modal="true" aria-labelledby="local-room-title">
        <div class="ci-sheet-head">
          <h2 id="local-room-title" class="info-title">{{ editingRoomId ? 'แก้ไขห้องพัก' : 'เพิ่มห้องพัก' }}</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" :disabled="inventoryBusy" @click="cancelEditRoom">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="ci-sheet-body">
          <div class="inventory-form">
            <label class="form-field">
              <span class="form-label">เลขห้อง</span>
              <input v-model="newRoom.room_number" class="form-input" type="text" inputmode="text" placeholder="เช่น 203 หรือ A101" :disabled="inventoryBusy" />
            </label>
            <label class="form-field">
              <span class="form-label">ชั้นของห้อง</span>
              <input v-model.number="newRoom.floor" class="form-input" type="number" min="0" placeholder="เช่น 2" :disabled="inventoryBusy" />
            </label>
            <label class="form-field">
              <span class="form-label">สถานะห้อง</span>
              <select v-model="newRoom.status" class="form-input" :disabled="inventoryBusy">
                <option value="available">ว่าง</option>
                <option value="maintenance">ซ่อมบำรุง</option>
                <option value="inactive">ไม่ใช้งาน</option>
              </select>
            </label>
            <label class="form-field">
              <span class="form-label">ประเภทห้อง</span>
              <select v-model="newRoom.room_type_id" class="form-input" :disabled="inventoryBusy">
                <option value="" disabled>เลือกประเภท</option>
                <option v-for="rt in roomTypes" :key="rt.id" :value="rt.id">{{ rt.name }}</option>
              </select>
            </label>
          </div>
        </div>
        <div class="ci-sheet-foot">
          <button class="btn btn-outline" type="button" :disabled="inventoryBusy" @click="cancelEditRoom">ยกเลิก</button>
          <button class="btn btn-primary" type="button" :disabled="inventoryBusy || !roomTypes.length" @click="addRoom">
            {{ inventoryBusy ? 'กำลังบันทึก...' : (editingRoomId ? 'บันทึก' : 'เพิ่มห้อง') }}
          </button>
        </div>
      </div>
    </div>

    <section v-if="tab === 'channel'" class="admin-section">
      <ChannelManagerPanel />
    </section>

    <!-- Kiosk Config -->
    <section v-if="tab === 'kiosk'" class="admin-section">
      <div class="card kiosk-card">
        <h2 class="info-title">
          <i class="ti ti-plug-connected"></i>
          ตั้งค่าเชื่อมต่อ PMS (theOtel)
        </h2>
        <p class="kiosk-desc">
          สลับโหมดห้องพักที่นี่เท่านั้น: ใช้ PMS หรือปิดแล้วไปเพิ่มห้องในแท็บห้องพัก<br/>
          <span class="muted">เช็คอินวันนี้ (walk-in) → กรองเฉพาะห้อง VC/VC &nbsp;|&nbsp; จองล่วงหน้า → ไม่กรอง VC</span>
        </p>

        <div class="form-row">
          <label class="form-label">โหมดห้องพัก</label>
          <div class="mode-slide" role="tablist" aria-label="เลือกใช้ PMS หรือจัดการห้องเอง">
            <button
              type="button"
              class="mode-slide-btn"
              :class="{ active: kioskConfig.kiosk_enabled === 'true' }"
              :disabled="kioskSaving"
              @click="setInventoryMode('kiosk')"
            >ใช้ PMS</button>
            <button
              type="button"
              class="mode-slide-btn"
              :class="{ active: kioskConfig.kiosk_enabled !== 'true' }"
              :disabled="kioskSaving"
              @click="setInventoryMode('local')"
            >จัดการห้องเอง</button>
          </div>
        </div>

        <div class="kiosk-form" :class="{ disabled: kioskConfig.kiosk_enabled !== 'true' }">
          <div class="form-row">
            <label class="form-label">
              Database Name (dbName)
              <span class="form-hint">ชื่อ database MSSQL ของโรงแรม</span>
            </label>
            <input
              v-model="kioskConfig.kiosk_db_name"
              type="text"
              class="form-input"
              placeholder="เช่น HotelDB2024"
              :disabled="kioskConfig.kiosk_enabled !== 'true'"
            />
          </div>

          <div class="form-row">
            <label class="form-label">
              Hotel ID (hotelID)
              <span class="form-hint">รหัสโรงแรมในระบบ PMS (ตัวเลข)</span>
            </label>
            <input
              v-model="kioskConfig.kiosk_hotel_id"
              type="text"
              class="form-input"
              placeholder="เช่น 1"
              :disabled="kioskConfig.kiosk_enabled !== 'true'"
            />
          </div>

          <div class="form-row">
            <label class="form-label">
              Company No (comNo)
              <span class="form-hint">รหัส company ในระบบ PMS (ตัวเลข)</span>
            </label>
            <input
              v-model="kioskConfig.kiosk_com_no"
              type="text"
              class="form-input"
              placeholder="เช่น 1"
              :disabled="kioskConfig.kiosk_enabled !== 'true'"
            />
          </div>

          <div class="form-row">
            <label class="form-label">
              Login ID (loginId)
              <span class="form-hint">รหัสผู้ใช้ในระบบ PMS สำหรับบันทึกการจอง</span>
            </label>
            <input
              v-model="kioskConfig.kiosk_login_id"
              type="text"
              class="form-input"
              placeholder="เช่น kiosk"
              :disabled="kioskConfig.kiosk_enabled !== 'true'"
            />
          </div>

          <div class="form-row">
            <label class="form-label">
              Login Name (loginName)
              <span class="form-hint">ชื่อผู้ใช้ในระบบ PMS</span>
            </label>
            <input
              v-model="kioskConfig.kiosk_login_name"
              type="text"
              class="form-input"
              placeholder="เช่น Kiosk"
              :disabled="kioskConfig.kiosk_enabled !== 'true'"
            />
          </div>
        </div>

        <!-- Messages -->
        <p v-if="kioskMsg"    class="success-msg"><i class="ti ti-check"></i> {{ kioskMsg }}</p>
        <p v-if="kioskErrMsg" class="error-msg"><i class="ti ti-alert-circle"></i> {{ kioskErrMsg }}</p>
        <p v-if="kioskTestMsg" class="test-msg"><i class="ti ti-plug-connected"></i> {{ kioskTestMsg }}</p>

        <!-- Action buttons -->
        <div class="kiosk-actions">
          <button class="btn btn-primary" :disabled="kioskSaving" @click="saveKioskConfig">
            <i class="ti ti-device-floppy"></i>
            {{ kioskSaving ? 'กำลังบันทึก...' : 'บันทึก' }}
          </button>
          <button
            class="btn btn-outline"
            :disabled="kioskTesting || kioskConfig.kiosk_enabled !== 'true'"
            @click="testKioskConnection"
          >
            <i class="ti ti-plug"></i>
            {{ kioskTesting ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ' }}
          </button>
          <button
            class="btn btn-outline"
            type="button"
            :disabled="kioskConfig.kiosk_enabled !== 'true'"
            @click="openRoomTypeManager"
          >
            <i class="ti ti-photo"></i>
            จัดการ Roomtype
          </button>
        </div>
      </div>

      <!-- How it works -->
      <div class="card kiosk-info-card">
        <h3 class="info-title">วิธีการทำงาน</h3>
        <ul class="kiosk-how-list">
          <li>
            <span class="how-badge how-walkin">Walk-in</span>
            เช็คอินวันเดียวกัน → ระบบจะดึงห้องจาก PMS ที่มีสถานะ <strong>VC/VC</strong> เท่านั้น (พร้อมพักได้ทันที)
          </li>
          <li>
            <span class="how-badge how-advance">ล่วงหน้า</span>
            จองล่วงหน้า → ระบบใช้ข้อมูลจาก database จองโรงแรม ไม่กรองผ่าน PMS
          </li>
          <li>
            <span class="how-badge how-off">ปิดใช้</span>
            ถ้าเลือกจัดการห้องเอง → ปิด PMS แล้วไปเพิ่มประเภทห้องและเลขห้องในแท็บห้องพัก เพื่อใช้ตอนจอง
          </li>
        </ul>
        <p class="kiosk-warning">
          <i class="ti ti-info-circle"></i>
          เลขห้อง (room_number) ในระบบจองต้องตรงกับ RoomNo ในระบบ PMS เพื่อให้กรองได้ถูกต้อง
        </p>
      </div>
    </section>

    <div
      v-if="showRoomTypeManager"
      class="ci-backdrop rt-backdrop"
      @click.self="closeRoomTypeManager"
    >
      <div class="ci-sheet rt-sheet" role="dialog" aria-modal="true" aria-labelledby="rt-title">
        <div class="ci-sheet-head">
          <h2 id="rt-title" class="info-title">จัดการ Roomtype</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" @click="closeRoomTypeManager">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="ci-sheet-body">
          <p class="muted roomtype-hint">เลือกประเภทห้องจากตาราง RmType ของ PMS แล้วใส่รายละเอียด วิว และรูป (ไม่เกิน 5 รูป — รูปแรกแสดงในหน้าจอง)</p>
          <p v-if="roomTypeMsg" class="success-msg">{{ roomTypeMsg }}</p>
          <p v-if="roomTypeErr" class="error-msg">{{ roomTypeErr }}</p>
          <div v-if="roomTypeBusy && !roomTypeOptions.length" class="muted">กำลังโหลด...</div>
          <div v-else class="roomtype-pick">
            <label class="form-label">เลือก Roomtype</label>
            <select
              class="form-input"
              :value="roomTypeForm.id"
              @change="selectRoomTypeForEdit(roomTypeOptions.find((r) => r.id === $event.target.value) || { id: '' })"
            >
              <option value="">เลือกประเภทห้อง</option>
              <option v-for="rt in roomTypeOptions" :key="rt.id" :value="rt.id">{{ rt.display_name || rt.name }}</option>
            </select>
          </div>
          <template v-if="roomTypeForm.id">
            <div class="form-row">
              <label class="form-label">รายละเอียดห้อง</label>
              <textarea
                v-model="roomTypeForm.description"
                class="form-input"
                rows="3"
                placeholder="เช่น ห้องกว้าง มีระเบียง"
              ></textarea>
            </div>
            <div class="form-row">
              <label class="form-label">วิว</label>
              <select v-model="roomTypeForm.view_type" class="form-input">
                <option value="">ไม่ระบุ</option>
                <option v-for="opt in ROOM_VIEW_OPTIONS" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
              </select>
            </div>
            <div class="form-row">
              <label class="form-label">รูป Roomtype ({{ roomTypeForm.image_files.length }}/5)</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                :disabled="roomTypeUploading || roomTypeForm.image_files.length >= 5"
                @change="uploadRoomTypeImages"
              />
              <p class="form-hint">รูปแรก = รูปหน้าปกในหน้าจอง · จัดลำดับด้วยลูกศร</p>
            </div>
            <div v-if="roomTypeForm.images.length" class="roomtype-thumbs">
              <div v-for="(url, idx) in roomTypeForm.images" :key="roomTypeForm.image_files[idx] || url" class="roomtype-thumb">
                <img :src="apiMediaUrl(url)" :alt="`รูป ${idx + 1}`" />
                <span v-if="idx === 0" class="thumb-cover">ปก</span>
                <div class="thumb-actions">
                  <button type="button" class="btn btn-sm btn-outline" :disabled="idx === 0" @click="moveRoomTypeImage(idx, -1)">↑</button>
                  <button type="button" class="btn btn-sm btn-outline" :disabled="idx >= roomTypeForm.images.length - 1" @click="moveRoomTypeImage(idx, 1)">↓</button>
                  <button type="button" class="btn btn-sm btn-outline-danger" @click="removeRoomTypeImage(roomTypeForm.image_files[idx])">ลบ</button>
                </div>
              </div>
            </div>
          </template>
        </div>
        <div v-if="roomTypeForm.id" class="ci-sheet-foot">
          <button class="btn btn-outline" type="button" :disabled="roomTypeBusy" @click="closeRoomTypeManager">ปิด</button>
          <button class="btn btn-primary" type="button" :disabled="roomTypeBusy" @click="saveRoomTypeDetails">
            {{ roomTypeBusy ? 'กำลังบันทึก...' : 'บันทึก' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="checkInReview"
      class="ci-backdrop"
      @click.self="closeCheckInReview"
    >
      <div class="ci-sheet" role="dialog" aria-modal="true" aria-labelledby="ci-title">
        <div class="ci-sheet-head">
          <h2 id="ci-title" class="info-title">ตรวจสอบก่อนเช็คอิน</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" :disabled="checkInBusy" @click="closeCheckInReview">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="ci-sheet-body">
          <p class="muted">ตรวจและแก้ข้อมูลที่แขกกรอกตอนจองให้ถูกต้องก่อนยืนยันเช็คอิน</p>

          <div class="ci-section">
            <p class="ci-section-title">การเข้าพัก</p>
            <div class="ci-rows">
              <div class="ci-row"><span>ห้องพัก</span><strong>{{ checkInReview.rooms?.[0]?.room_type_name || '—' }}<template v-if="checkInReview.rooms?.[0]?.room_number"> · ห้อง {{ checkInReview.rooms[0].room_number }}</template></strong></div>
              <div v-if="checkInReview.rate_plan_name" class="ci-row"><span>เรทแพลน</span><strong>{{ checkInReview.rate_plan_name }}</strong></div>
              <div class="ci-row"><span>เช็คอิน</span><strong>{{ formatStayDate(checkInReview.check_in_date) }}</strong></div>
              <div class="ci-row"><span>เช็คเอาต์</span><strong>{{ formatStayDate(checkInReview.check_out_date) }}</strong></div>
              <div class="ci-row"><span>ผู้ใหญ่ / เด็ก</span><strong>{{ checkInReview.num_adults || 0 }} / {{ checkInReview.num_children || 0 }}</strong></div>
              <div class="ci-row"><span>อาหารเช้า</span><strong>{{ checkInReview.include_breakfast ? `มี · ${checkInReview.breakfast_count || 0} คน` : 'ไม่มี' }}</strong></div>
              <div class="ci-row"><span>ราคารวม</span><strong>฿{{ Number(checkInReview.total_price || 0).toLocaleString() }}</strong></div>
            </div>
          </div>

          <div class="ci-section">
            <p class="ci-section-title">ข้อมูลผู้เข้าพัก</p>
            <div class="ci-form-grid">
              <div class="form-row">
                <label class="form-label">คำนำหน้า <span class="req">*</span></label>
                <select v-model="checkInForm.guest_title" class="form-input" :disabled="checkInBusy">
                  <option value="" disabled>เลือก</option>
                  <option v-for="t in GUEST_TITLES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">เพศ <span class="req">*</span></label>
                <select v-model="checkInForm.guest_sex" class="form-input" :disabled="checkInBusy">
                  <option value="" disabled>เลือก</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">ชื่อ <span class="req">*</span></label>
                <input v-model="checkInForm.guest_first_name" type="text" class="form-input" :disabled="checkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">นามสกุล <span class="req">*</span></label>
                <input v-model="checkInForm.guest_last_name" type="text" class="form-input" :disabled="checkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">สัญชาติ</label>
                <select v-model="checkInForm.guest_nation" class="form-input" :disabled="checkInBusy">
                  <option v-for="n in GUEST_NATIONS" :key="n.code" :value="n.code">{{ n.name }}</option>
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">วันเกิด</label>
                <input v-model="checkInForm.guest_birthday" type="date" class="form-input" :disabled="checkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">เลขบัตรประชาชน</label>
                <input v-model="checkInForm.guest_national_id" type="text" class="form-input" maxlength="13" :disabled="checkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">พาสปอร์ต</label>
                <input v-model="checkInForm.guest_passport" type="text" class="form-input" :disabled="checkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">เบอร์โทร</label>
                <input v-model="checkInForm.guest_phone" type="tel" class="form-input" :disabled="checkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">อีเมล</label>
                <input v-model="checkInForm.guest_email" type="email" class="form-input" :disabled="checkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">ทะเบียนรถ</label>
                <input v-model="checkInForm.guest_car_no" type="text" class="form-input" :disabled="checkInBusy" />
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">ที่อยู่ 1</label>
              <input v-model="checkInForm.guest_address1" type="text" class="form-input" :disabled="checkInBusy" />
            </div>
            <div class="ci-form-grid">
              <div class="form-row">
                <label class="form-label">ที่อยู่ 2</label>
                <input v-model="checkInForm.guest_address2" type="text" class="form-input" :disabled="checkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">ที่อยู่ 3</label>
                <input v-model="checkInForm.guest_address3" type="text" class="form-input" :disabled="checkInBusy" />
              </div>
            </div>
          </div>

          <div class="ci-section">
            <p class="ci-section-title">คำขอพิเศษ</p>
            <textarea v-model="checkInForm.special_requests" class="form-input ci-textarea" rows="3" :disabled="checkInBusy" />
          </div>

          <p v-if="checkInError" class="error-msg">{{ checkInError }}</p>
        </div>
        <div class="ci-sheet-foot">
          <button type="button" class="btn btn-outline" :disabled="checkInBusy" @click="closeCheckInReview">ยกเลิก</button>
          <button type="button" class="btn btn-primary" :disabled="checkInBusy" @click="confirmCheckInReview">
            {{ checkInBusy ? 'กำลังเช็คอิน...' : 'บันทึกและเช็คอิน' }}
          </button>
        </div>
      </div>
    </div>

    <div
      v-if="walkInOpen"
      class="ci-backdrop"
      @click.self="closeWalkIn"
    >
      <div class="ci-sheet" role="dialog" aria-modal="true" aria-labelledby="walkin-title">
        <div class="ci-sheet-head">
          <h2 id="walkin-title" class="info-title">จองห้อง {{ walkInRoom?.room_number }}</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" :disabled="walkInBusy" @click="closeWalkIn">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="ci-sheet-body">
          <p class="muted">
            {{ walkInRoom?.room_type_name || 'ประเภทห้อง' }} · เลขห้อง {{ walkInRoom?.room_number }}
            — จองแบบเลือกห้อง (โหมดจัดการห้องเอง)
          </p>

          <div class="ci-section">
            <p class="ci-section-title">วันเข้าพัก</p>
            <div class="ci-form-grid">
              <div class="form-row">
                <label class="form-label">เช็คอิน</label>
                <input v-model="walkInForm.check_in_date" type="date" class="form-input" :disabled="walkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">เช็คเอาต์</label>
                <input v-model="walkInForm.check_out_date" type="date" class="form-input" :min="walkInForm.check_in_date" :disabled="walkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">ผู้ใหญ่</label>
                <input v-model.number="walkInForm.num_adults" type="number" min="1" class="form-input" :disabled="walkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">เด็ก</label>
                <input v-model.number="walkInForm.num_children" type="number" min="0" class="form-input" :disabled="walkInBusy" />
              </div>
            </div>
          </div>

          <div class="ci-section">
            <p class="ci-section-title">เรทแพลน</p>
            <p v-if="walkInPlansLoading" class="muted">กำลังโหลดราคา...</p>
            <div v-else class="form-row">
              <select v-model="walkInForm.rate_plan_id" class="form-input" :disabled="walkInBusy || !walkInPlans.length">
                <option value="">เลือกเรทแพลน</option>
                <option v-for="p in walkInPlans" :key="p.id" :value="p.id">
                  {{ p.name }} · ฿{{ Number(p.price_per_night || 0).toLocaleString() }}/คืน
                  <template v-if="p.includes_breakfast"> · มีอาหารเช้า</template>
                </option>
              </select>
            </div>
            <div v-if="walkInSelectedPlan?.includes_breakfast" class="form-row">
              <label class="form-label">อาหารเช้า (คน)</label>
              <input v-model.number="walkInForm.breakfast_count" type="number" min="1" class="form-input" :disabled="walkInBusy" />
              <p class="muted walkin-bf-hint">เรทนี้รวมอาหารเช้า · ฿{{ Number(walkInSelectedPlan.abf_per_person_per_night || 0).toLocaleString() }} / คน / คืน</p>
            </div>
            <p v-else-if="walkInSelectedPlan" class="muted">เรทนี้ไม่มีอาหารเช้า</p>
            <p v-if="walkInQuote" class="walkin-total">
              รวมประมาณ ฿{{ walkInQuote.total.toLocaleString() }}
              <span v-if="walkInNights"> · {{ walkInNights }} คืน</span>
            </p>
          </div>

          <div class="ci-section">
            <p class="ci-section-title">ข้อมูลผู้เข้าพัก</p>
            <div class="ci-form-grid">
              <div class="form-row">
                <label class="form-label">คำนำหน้า <span class="req">*</span></label>
                <select v-model="walkInForm.guest_title" class="form-input" :disabled="walkInBusy">
                  <option value="" disabled>เลือก</option>
                  <option v-for="t in GUEST_TITLES" :key="t" :value="t">{{ t }}</option>
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">เพศ <span class="req">*</span></label>
                <select v-model="walkInForm.guest_sex" class="form-input" :disabled="walkInBusy">
                  <option value="" disabled>เลือก</option>
                  <option value="male">ชาย</option>
                  <option value="female">หญิง</option>
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">ชื่อ <span class="req">*</span></label>
                <input v-model="walkInForm.guest_first_name" type="text" class="form-input" :disabled="walkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">นามสกุล <span class="req">*</span></label>
                <input v-model="walkInForm.guest_last_name" type="text" class="form-input" :disabled="walkInBusy" />
              </div>
              <div class="form-row">
                <label class="form-label">สัญชาติ</label>
                <select v-model="walkInForm.guest_nation" class="form-input" :disabled="walkInBusy">
                  <option v-for="n in GUEST_NATIONS" :key="n.code" :value="n.code">{{ n.name }}</option>
                </select>
              </div>
              <div class="form-row">
                <label class="form-label">โทรศัพท์</label>
                <input v-model="walkInForm.guest_phone" type="tel" class="form-input" :disabled="walkInBusy" />
              </div>
            </div>
            <div class="form-row">
              <label class="form-label">อีเมล</label>
              <input v-model="walkInForm.guest_email" type="email" class="form-input" :disabled="walkInBusy" />
            </div>
            <div class="form-row">
              <label class="form-label">คำขอพิเศษ</label>
              <textarea v-model="walkInForm.special_requests" class="form-input ci-textarea" rows="2" :disabled="walkInBusy" />
            </div>
          </div>

          <p v-if="walkInError" class="error-msg">{{ walkInError }}</p>
        </div>
        <div class="ci-sheet-foot">
          <button type="button" class="btn btn-outline" :disabled="walkInBusy" @click="closeWalkIn">ยกเลิก</button>
          <button type="button" class="btn btn-primary" :disabled="walkInBusy || walkInPlansLoading" @click="submitWalkIn">
            {{ walkInBusy ? 'กำลังจอง...' : 'ยืนยันจอง' }}
          </button>
        </div>
      </div>
    </div>

    <BottomNav active="admin" />
  </div>
</template>

<style scoped>
.admin-page    { padding-bottom: calc(var(--bottom-nav-height, 64px) + var(--space-6)); }
.page-header   { display: flex; align-items: center; justify-content: space-between; padding: var(--space-4) var(--page-padding-x); }
.page-title    { font-size: var(--text-h2); font-weight: 700; margin: 0; }
.tab-bar       { display: flex; gap: var(--space-2); padding: 0 var(--page-padding-x) var(--space-3); overflow-x: auto; }
.booking-list-tabs {
  display: flex;
  gap: var(--space-5);
  padding: 0 0 0;
  margin: calc(var(--space-1) * -1) 0 var(--space-1);
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  border-bottom: 1px solid var(--color-border);
}
.booking-list-tab {
  flex: 0 0 auto;
  margin: 0;
  padding: var(--space-2) 2px calc(var(--space-2) + 2px);
  border: none;
  border-bottom: 2px solid transparent;
  border-radius: 0;
  background: transparent;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: none;
}
.booking-list-tab:hover:not(.active) {
  color: var(--color-text-secondary);
}
.booking-list-tab.active {
  background: transparent;
  border-bottom-color: #2ea44f;
  color: #2ea44f;
  font-weight: 600;
}
.booking-list-tab:focus-visible {
  outline: 2px solid color-mix(in srgb, #2ea44f 55%, transparent);
  outline-offset: 2px;
}
.admin-links   { display: flex; flex-wrap: wrap; gap: var(--space-2); padding: 0 var(--page-padding-x) var(--space-3); }
.admin-link    { display: inline-flex; align-items: center; gap: 6px; padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-surface-elevated); color: inherit; text-decoration: none; font-size: var(--text-sm); font-weight: 600; font-family: inherit; cursor: pointer; }
.admin-link:hover { border-color: var(--color-primary); color: var(--color-primary); }
.tab-btn       { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: transparent; font-family: inherit; cursor: pointer; font-size: var(--text-sm); white-space: nowrap; }
.tab-btn.active { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
.admin-section { padding: 0 var(--page-padding-x); display: flex; flex-direction: column; gap: var(--space-3); }
.stats-row     { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); }
.stat-card     { padding: var(--space-4); text-align: center; }
.stat-label    { font-size: var(--text-sm); color: var(--color-text-muted); margin: 0 0 var(--space-1); }
.stat-value    { font-size: 2rem; font-weight: 700; color: var(--color-primary); margin: 0; }
.info-card     { padding: var(--space-4); }
.info-title    { font-size: var(--text-h3); font-weight: 700; margin: 0 0 var(--space-3); }
.info-title-row { display: flex; align-items: center; justify-content: space-between; gap: var(--space-2); margin-bottom: var(--space-2); }
.info-title-row .info-title { margin: 0; }
.stat-chip { font-size: var(--text-sm); font-weight: 700; color: #155724; background: #d4edda; padding: 2px var(--space-2); border-radius: var(--radius-pill); }
.vacant-source { margin: 0 0 var(--space-3); font-size: var(--text-sm); }
.vacant-floors { display: flex; flex-direction: column; gap: var(--space-3); }
.vacant-floor-label { margin: 0 0 var(--space-2); font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); }
.vacant-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.vacant-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 52px;
  padding: 6px var(--space-3);
  border-radius: var(--radius-md);
  border: none;
  background: #d4edda;
  color: #155724;
  font-size: var(--text-sm);
  font-weight: 700;
  font-family: inherit;
}
.vacant-chip--clickable {
  cursor: pointer;
}
.vacant-chip--clickable:hover {
  filter: brightness(0.96);
  box-shadow: inset 0 0 0 1px rgba(21, 87, 36, 0.35);
}
.vacant-chip:disabled {
  cursor: default;
  opacity: 1;
}
.vacant-chip--arrival {
  background: linear-gradient(135deg, #ffe566 0%, #ffd54f 100%);
  color: #7a5a00;
  box-shadow: inset 0 0 0 1px rgba(180, 130, 0, 0.25);
}
.walkin-bf-hint {
  margin: 4px 0 0;
  font-size: var(--text-xs);
}
.walkin-total {
  margin: var(--space-2) 0 0;
  font-size: var(--text-sm);
  font-weight: 700;
  color: var(--color-primary);
}
.info-list     { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.info-row      { display: flex; justify-content: space-between; align-items: center; font-size: var(--text-sm); padding: var(--space-1) 0; border-bottom: 1px solid var(--color-border); }
.booking-list  { display: flex; flex-direction: column; gap: var(--space-3); }
.booking-card  { padding: var(--space-4); }
.booking-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--space-2); }
.booking-meta  { display: flex; gap: var(--space-2); font-size: var(--text-sm); margin-bottom: var(--space-1); }
.guest-name    { font-weight: 600; }
.guest-phone   { color: var(--color-text-muted); }
.booking-dates { font-size: var(--text-sm); color: var(--color-text-secondary); margin-bottom: var(--space-1); }
.booking-rooms { margin-bottom: var(--space-1); }
.room-tag      { font-size: var(--text-label); padding: 2px var(--space-2); background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius-pill); }
.booking-price { font-weight: 700; margin-bottom: var(--space-3); }
.slip-preview { margin: 0 0 var(--space-3); }
.slip-img { max-width: 100%; max-height: 280px; border-radius: var(--radius-md); display: block; }
.pms-note { font-size: var(--text-label); color: var(--color-text-secondary); margin: calc(var(--space-2) * -1) 0 var(--space-3); }
.pms-error { color: #721c24; }
.booking-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.booking-id    { font-size: var(--text-label); color: var(--color-text-muted); }
.booking-status { font-size: var(--text-label); font-weight: 600; padding: 2px var(--space-2); border-radius: var(--radius-pill); }
.status-awaiting_payment { background: #fff3cd; color: #856404; }
.status-pending    { background: #cce5ff; color: #004085; }
.status-confirmed  { background: #d4edda; color: #155724; }
.status-checked_in { background: #d1ecf1; color: #0c5460; }
.status-checked_out { background: #e2e3e5; color: #383d41; }
.status-cancelled  { background: #f8d7da; color: #721c24; }
.room-status   { font-size: var(--text-label); font-weight: 600; padding: 2px var(--space-2); border-radius: var(--radius-pill); }
.rs-available   { background: #d4edda; color: #155724; }
.rs-occupied    { background: #cce5ff; color: #004085; }
.rs-maintenance { background: #fff3cd; color: #856404; }
.rs-blocked     { background: #f8d7da; color: #721c24; }
.rooms-toolbar {
  background: var(--color-surface-elevated);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-card);
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.rooms-live-bar { display: flex; align-items: center; gap: var(--space-2); min-height: 28px; }
.rooms-live-meta { display: flex; align-items: center; gap: var(--space-2); margin-left: auto; }
.rooms-updated { font-size: var(--text-label); color: var(--color-text-muted); }
.rooms-refresh { width: 32px; height: 32px; }
.live-badge     { display: inline-flex; align-items: center; gap: 6px; font-size: var(--text-label); font-weight: 700; color: #155724; background: #d4edda; padding: 2px var(--space-2); border-radius: var(--radius-pill); }
.live-dot       { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
.live-dot.pulse { animation: pulse 1s ease-in-out infinite; }
@keyframes pulse { 50% { opacity: 0.35; } }
.hk-filter-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 6px;
}
.hk-filter {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  min-height: 52px;
  padding: 8px 2px 6px;
  border: none;
  border-radius: 12px;
  background: var(--color-surface-muted);
  font-family: inherit;
  cursor: pointer;
  box-shadow: inset 0 2px 0 transparent;
}
.hk-filter-count {
  font-size: 16px;
  font-weight: 700;
  line-height: 1.1;
  color: var(--color-text-primary);
  font-variant-numeric: tabular-nums;
}
.hk-filter-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.hk-filter.tone-vc { box-shadow: inset 0 2px 0 #6bbf8a; }
.hk-filter.tone-vd { box-shadow: inset 0 2px 0 #6b9fd4; }
.hk-filter.tone-oc { box-shadow: inset 0 2px 0 #c98bb8; }
.hk-filter.tone-ooo { box-shadow: inset 0 2px 0 #e07a7a; }
.hk-filter.tone-arrival { box-shadow: inset 0 2px 0 #e6b800; }
.hk-filter:hover:not(.active) { background: var(--color-primary-light); }
.hk-filter.active {
  background: var(--color-primary);
  box-shadow: none;
}
.hk-filter:focus-visible,
.floor-chip:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.hk-filter.active .hk-filter-count,
.hk-filter.active .hk-filter-label { color: #fff; }
.floor-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding-top: 2px;
  border-top: 1px solid var(--color-border);
}
.floor-row-label {
  flex-shrink: 0;
  font-size: var(--text-label);
  font-weight: 700;
  color: var(--color-text-muted);
  letter-spacing: 0.02em;
}
.floor-chips { display: flex; flex-wrap: wrap; gap: 4px; min-width: 0; }
.floor-chip {
  min-width: 34px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 10px;
  background: var(--color-surface-muted);
  color: var(--color-text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.floor-chip.active {
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
}
.kiosk-room-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--space-2); }
.kiosk-room-card { padding: var(--space-3); border-radius: var(--radius-md); box-shadow: var(--shadow-sm); }
.kiosk-room-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-2); margin-bottom: var(--space-1); }
.kiosk-room-no   { font-size: var(--text-h3); }
.kiosk-room-meta { margin: 0 0 var(--space-1); font-size: var(--text-label); color: var(--color-text-secondary); display: flex; gap: var(--space-2); }
.kiosk-room-guest { margin: 0; font-size: var(--text-sm); display: flex; align-items: center; gap: 4px; }
.hk-vc  { background: linear-gradient(135deg, #a8e6cf 0%, #dcedc1 100%); }
.hk-vd  { background: linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%); }
.hk-oc  { background: linear-gradient(135deg, #ffd1ff 0%, #fae3ff 100%); }
.hk-od  { background: linear-gradient(135deg, #e2e2e2 0%, #d7d7d7 100%); }
.hk-ooo { background: linear-gradient(135deg, #ff6b6b 0%, #ffb3b3 100%); }
.hk-arrival-today { background: linear-gradient(135deg, #ffe566 0%, #ffd54f 100%); }
.hk-badge-vc, .hk-badge-vd, .hk-badge-oc, .hk-badge-od, .hk-badge-ooo, .hk-badge-arrival-today {
  background: rgba(0,0,0,.08); color: inherit;
}
.mono { font-family: monospace; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── kiosk ── */
.kiosk-card    { padding: var(--space-4); }
.kiosk-desc    { font-size: var(--text-sm); color: var(--color-text-secondary); margin: 0 0 var(--space-4); line-height: 1.6; }
.kiosk-toggle-row { margin-bottom: var(--space-4); }
.toggle-label  { display: flex; align-items: center; gap: var(--space-2); cursor: pointer; font-weight: 600; user-select: none; }
.toggle-input  { display: none; }
.toggle-track  { width: 44px; height: 24px; background: var(--color-border); border-radius: var(--radius-pill); position: relative; transition: background .2s; flex-shrink: 0; }
.toggle-input:checked + .toggle-track { background: var(--color-primary); }
.toggle-thumb  { position: absolute; top: 2px; left: 2px; width: 20px; height: 20px; border-radius: 50%; background: #fff; transition: transform .2s; box-shadow: var(--shadow-sm); }
.toggle-input:checked + .toggle-track .toggle-thumb { transform: translateX(20px); }
.kiosk-form    { display: flex; flex-direction: column; gap: var(--space-3); margin-bottom: var(--space-4); transition: opacity .2s; }
.kiosk-form.disabled { opacity: 0.5; pointer-events: none; }
.form-row      { display: flex; flex-direction: column; gap: var(--space-1); }
.form-label    { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); display: flex; flex-direction: column; gap: 2px; }
.form-hint     { font-size: var(--text-label); font-weight: 400; color: var(--color-text-muted); }
.form-input    { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: inherit; font-size: var(--text-sm); font-family: monospace; }
.form-input:focus { outline: none; border-color: var(--color-primary); }
.kiosk-actions { display: flex; gap: var(--space-3); flex-wrap: wrap; }
.roomtype-hint { margin: 0; font-size: var(--text-sm); }
.roomtype-pick { margin: 0; }
.roomtype-thumbs {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: var(--space-2);
}
.roomtype-thumb {
  position: relative;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #fff;
}
.roomtype-thumb img { display: block; width: 100%; height: 90px; object-fit: cover; }
.thumb-cover {
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: 11px;
  font-weight: 700;
  background: #fff3cd;
  color: #856404;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
}
.thumb-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px;
}
.rt-backdrop { align-items: center; }
.rt-sheet {
  width: min(560px, 100%);
  max-height: min(90vh, 780px);
  border-radius: var(--radius-lg);
}
.rt-sheet--sm { width: min(440px, 100%); max-height: min(90vh, 560px); }
.inventory-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.inventory-section-head .info-title { margin: 0; }
.success-msg   { color: var(--color-success, #155724); font-size: var(--text-sm); margin-bottom: var(--space-2); }
.error-msg     { color: var(--color-danger, #721c24); font-size: var(--text-sm); margin-bottom: var(--space-2); }
.test-msg      { color: var(--color-primary); font-size: var(--text-sm); margin-bottom: var(--space-2); font-weight: 600; }
.kiosk-info-card { padding: var(--space-4); }
.kiosk-how-list { list-style: none; margin: 0 0 var(--space-3); padding: 0; display: flex; flex-direction: column; gap: var(--space-3); }
.kiosk-how-list li { display: flex; align-items: flex-start; gap: var(--space-2); font-size: var(--text-sm); line-height: 1.5; }
.how-badge     { flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 2px var(--space-2); border-radius: var(--radius-pill); }
.how-walkin    { background: #d1ecf1; color: #0c5460; }
.how-advance   { background: #d4edda; color: #155724; }
.how-off       { background: #e2e3e5; color: #383d41; }
.kiosk-warning { font-size: var(--text-sm); color: var(--color-text-secondary); background: #fff3cd; padding: var(--space-3); border-radius: var(--radius-md); margin: 0; display: flex; gap: var(--space-2); align-items: flex-start; }
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
  color: #fff;
}
.mode-slide-btn:disabled { opacity: 0.6; cursor: wait; }
.inventory-mode-card { display: flex; flex-direction: column; gap: var(--space-2); }
.inventory-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.inventory-form .form-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.inventory-form .form-label { margin: 0; }
.inventory-form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: end;
}
.info-row.is-editing {
  outline: 1px solid color-mix(in srgb, var(--color-primary) 45%, transparent);
  border-radius: 8px;
  padding: 6px 8px;
}
.inventory-room-row { gap: var(--space-2); }
.inventory-room-actions { display: flex; align-items: center; gap: var(--space-2); }
.status-select { width: auto; min-width: 96px; font-family: inherit; }
.btn-outline-danger {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--color-error, #c0392b) 40%, transparent);
  color: var(--color-error, #c0392b);
}
@media (min-width: 720px) {
  .inventory-form--type { grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto; align-items: end; }
  .inventory-form--type-full { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
  .inventory-form--type-full .form-field--full,
  .inventory-form--type-full .inventory-form-actions { grid-column: 1 / -1; }
  .inventory-form--room { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: end; }
  .inventory-form .inventory-form-actions { grid-column: auto; }
  .inventory-form--room .inventory-form-actions { grid-column: 1 / -1; }
}
@media (min-width: 1100px) {
  .inventory-form--room { grid-template-columns: minmax(8rem, 1fr) 6.5rem minmax(7rem, 1fr) minmax(8rem, 1.1fr) auto; }
  .inventory-form--room .inventory-form-actions { grid-column: auto; }
}
@media (min-width: 900px) {
  .stats-row { grid-template-columns: repeat(4, 1fr); }
  .stats-row--pms { grid-template-columns: 1fr 1fr; }
  .admin-back-btn { display: none; }
}
.ci-backdrop {
  position: fixed; inset: 0; z-index: 80;
  background: rgba(0, 0, 0, 0.45);
  display: flex; align-items: flex-end; justify-content: center;
  padding: var(--space-3);
}
.ci-sheet {
  width: min(520px, 100%);
  max-height: min(88vh, 720px);
  background: var(--color-surface-elevated);
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-md) var(--radius-md);
  box-shadow: var(--shadow-lg);
  display: flex; flex-direction: column; overflow: hidden;
}
.ci-sheet-head {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--space-2); padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
}
.ci-sheet-head .info-title { margin: 0; }
.ci-sheet-body {
  padding: var(--space-4);
  overflow: auto;
  display: flex; flex-direction: column; gap: var(--space-4);
}
.ci-section-title {
  margin: 0 0 var(--space-2);
  font-size: var(--text-sm); font-weight: 700;
  color: var(--color-text-secondary);
}
.ci-rows { display: flex; flex-direction: column; gap: 6px; }
.ci-row {
  display: grid; grid-template-columns: 120px 1fr; gap: var(--space-2);
  font-size: var(--text-sm); align-items: start;
}
.ci-row span { color: var(--color-text-muted); }
.ci-row strong { font-weight: 600; word-break: break-word; }
.ci-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-3);
  margin-bottom: var(--space-3);
}
.ci-form-grid .form-row, .ci-section > .form-row { margin: 0; display: flex; flex-direction: column; gap: 4px; }
.ci-section > .form-row { margin-bottom: var(--space-3); }
.ci-textarea { resize: vertical; min-height: 72px; }
.req { color: var(--color-error); }
.ci-sheet-foot {
  display: flex; gap: var(--space-2); justify-content: flex-end;
  padding: var(--space-3) var(--space-4);
  border-top: 1px solid var(--color-border);
}
@media (min-width: 640px) {
  .ci-backdrop { align-items: center; }
  .ci-sheet { border-radius: var(--radius-lg); }
}
</style>
