<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useHotelRoute } from '../composables/useHotelRoute'
import api from '../api/axios'

const { hotelSlug } = useHotelRoute()

const WINDOWS = [7, 14, 30, 60, 120, 360]
const MAX_CALENDAR_DAYS = 360
const WEEKDAYS = [
  { id: 0, label: 'จ' },
  { id: 1, label: 'อ' },
  { id: 2, label: 'พ' },
  { id: 3, label: 'พฤ' },
  { id: 4, label: 'ศ' },
  { id: 5, label: 'ส' },
  { id: 6, label: 'อา' },
]

function localYmd(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function addDaysLocal(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n))
  return dt.toISOString().slice(0, 10)
}

function daysInclusive(fromYmd, toYmd) {
  const start = String(fromYmd || '').slice(0, 10)
  const end = String(toYmd || '').slice(0, 10)
  if (!start || !end || end < start) return 0
  const [sy, sm, sd] = start.split('-').map(Number)
  const [ey, em, ed] = end.split('-').map(Number)
  const ms = Date.UTC(ey, (em || 1) - 1, ed || 1) - Date.UTC(sy, (sm || 1) - 1, sd || 1)
  if (!Number.isFinite(ms) || ms < 0) return 0
  return Math.round(ms / 86400000) + 1
}

const loading = ref(false)
const saving = ref(false)
const errorMsg = ref('')
const formError = ref('')
const formMessage = ref('')
const from = ref(localYmd())
const to = ref(addDaysLocal(localYmd(), 13))
const calendar = ref({ dates: [], room_types: [], rate_plans: [], windows: WINDOWS, pms: false })
const expanded = reactive({})
const expandedPlans = reactive({})
const selectedTypeId = ref('')
const selectedPlanId = ref('')
const newPlanName = ref('')
const newPlanIncludesBreakfast = ref(false)
const showBulkForm = ref(false)
const showStopForm = ref(false)
const showDisplayForm = ref(false)
const formTab = ref('update')
const cancelPlanId = ref('')
const cancelScope = ref('all')
const cancelTypeIds = ref([])
const bulk = reactive({
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  price: '',
  abf: '',
  date_from: localYmd(),
  date_to: addDaysLocal(localYmd(), 13),
})
const stopSale = reactive({
  mode: 'room_type',
  room_type_id: '',
  rate_plan_id: '',
  date_from: localYmd(),
  date_to: addDaysLocal(localYmd(), 13),
  weekdays: [0, 1, 2, 3, 4, 5, 6],
})
const stopError = ref('')
const stopMessage = ref('')
const displayPrice = reactive({
  mode: 'room_type',
  room_type_id: '',
  rate_plan_id: '',
  date_from: localYmd(),
  date_to: addDaysLocal(localYmd(), 13),
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  input_mode: 'percent',
  value: '',
})
const displayError = ref('')
const displayMessage = ref('')

const selectedType = computed(() =>
  calendar.value.room_types.find((t) => t.id === selectedTypeId.value) || null
)
const hotelPlans = computed(() =>
  (calendar.value.rate_plans || []).filter((p) => p.is_active !== false)
)
const selectedPlan = computed(() => {
  const id = selectedPlanId.value
  if (!id) return null
  return selectedType.value?.rate_plans?.find((p) => p.id === id)
    || hotelPlans.value.find((p) => p.id === id)
    || null
})
const formTitle = computed(() => {
  if (formTab.value === 'create') return 'สร้างเรทแพลนใหม่'
  if (formTab.value === 'cancel') return 'ยกเลิกเรทแพลน'
  return 'อัปเดตราคา'
})
const typesUsingCancelPlan = computed(() =>
  (calendar.value.room_types || []).filter((t) =>
    (t.rate_plans || []).some((p) => p.id === cancelPlanId.value)
  )
)
const plansForStopType = computed(() => {
  const type = (calendar.value.room_types || []).find((t) => t.id === stopSale.room_type_id)
  return type?.rate_plans || []
})
const stopPlanOptions = computed(() => {
  if (stopSale.mode === 'room_type_rate_plan') return plansForStopType.value
  return hotelPlans.value
})
const stopTypeName = computed(() =>
  calendar.value.room_types.find((t) => t.id === stopSale.room_type_id)?.name || 'ยังไม่เลือก'
)
const stopPlanName = computed(() =>
  hotelPlans.value.find((p) => p.id === stopSale.rate_plan_id)?.name
    || plansForStopType.value.find((p) => p.id === stopSale.rate_plan_id)?.name
    || 'ยังไม่เลือก'
)
const stopSummary = computed(() => {
  if (stopSale.mode === 'room_type') {
    return `ประเภท: ${stopTypeName.value} · เรทแพลน: ทุกเรทของประเภทนี้ — เลือกวันในสัปดาห์ได้`
  }
  if (stopSale.mode === 'rate_plan') {
    return `เรทแพลน: ${stopPlanName.value} · ประเภทห้อง: ทุกประเภทที่ใช้เรทนี้ — เลือกวันในสัปดาห์ได้`
  }
  return `ประเภท: ${stopTypeName.value} · เรทแพลน: ${stopPlanName.value} — เลือกวันในสัปดาห์ได้`
})
const plansForDisplayType = computed(() => {
  const type = (calendar.value.room_types || []).find((t) => t.id === displayPrice.room_type_id)
  return type?.rate_plans || []
})
const displayPlanOptions = computed(() => {
  if (displayPrice.mode === 'room_type_rate_plan') return plansForDisplayType.value
  return hotelPlans.value
})
const displayTypeName = computed(() =>
  calendar.value.room_types.find((t) => t.id === displayPrice.room_type_id)?.name || 'ยังไม่เลือก'
)
const displayPlanName = computed(() =>
  hotelPlans.value.find((p) => p.id === displayPrice.rate_plan_id)?.name
    || plansForDisplayType.value.find((p) => p.id === displayPrice.rate_plan_id)?.name
    || 'ยังไม่เลือก'
)
const displaySummary = computed(() => {
  if (displayPrice.mode === 'room_type') {
    return `ประเภท: ${displayTypeName.value} · เรทแพลน: ทุกเรทของประเภทนี้`
  }
  if (displayPrice.mode === 'rate_plan') {
    return `เรทแพลน: ${displayPlanName.value} · ประเภทห้อง: ทุกประเภทที่ใช้เรทนี้`
  }
  return `ประเภท: ${displayTypeName.value} · เรทแพลน: ${displayPlanName.value}`
})
const displayPreview = computed(() => {
  const raw = String(displayPrice.value || '').trim()
  const n = Number(raw)
  if (!raw || !Number.isFinite(n) || n <= 0) return null
  let sampleSell = null
  const types = calendar.value.room_types || []
  for (const t of types) {
    if (displayPrice.mode !== 'rate_plan' && displayPrice.room_type_id && t.id !== displayPrice.room_type_id) continue
    for (const p of t.rate_plans || []) {
      if (displayPrice.mode !== 'room_type' && displayPrice.rate_plan_id && p.id !== displayPrice.rate_plan_id) continue
      for (const d of calendar.value.dates || []) {
        const sell = p.prices?.[d]
        if (sell != null && Number(sell) > 0) {
          sampleSell = Number(sell)
          break
        }
      }
      if (sampleSell != null) break
    }
    if (sampleSell != null) break
  }
  if (sampleSell == null) return null
  let display = null
  let pct = null
  if (displayPrice.input_mode === 'percent') {
    if (n <= 0 || n >= 100) return null
    display = Math.round(sampleSell / (1 - n / 100))
    pct = Math.round(n)
  } else {
    if (n <= sampleSell) return null
    display = Math.round(n)
    pct = Math.round((1 - sampleSell / n) * 100)
  }
  if (!display || !pct || pct < 1) return null
  return {
    sell: Math.round(sampleSell),
    display,
    percent: pct,
  }
})
const days = computed(() => Math.max(1, daysInclusive(from.value, to.value)))
const maxToDate = computed(() => addDaysLocal(from.value, MAX_CALENDAR_DAYS - 1))

function colParts(ymd) {
  const dt = new Date(`${ymd}T00:00:00`)
  return {
    dow: dt.toLocaleDateString('th-TH', { weekday: 'short' }),
    day: dt.getDate(),
    mon: dt.toLocaleDateString('en-GB', { month: 'short' }),
  }
}

function allotLabel(type, ymd) {
  const vacant = type.pms_vacant?.[ymd]
  if (vacant == null || vacant === '') return '—'
  return String(vacant)
}

function planKey(type, plan) {
  return `${type.id}:${plan.id}`
}

function toggleWeekday(id) {
  const i = bulk.weekdays.indexOf(id)
  if (i >= 0) bulk.weekdays.splice(i, 1)
  else bulk.weekdays.push(id)
}

function toggleStopWeekday(id) {
  const i = stopSale.weekdays.indexOf(id)
  if (i >= 0) stopSale.weekdays.splice(i, 1)
  else stopSale.weekdays.push(id)
}

function toggleDisplayWeekday(id) {
  const i = displayPrice.weekdays.indexOf(id)
  if (i >= 0) displayPrice.weekdays.splice(i, 1)
  else displayPrice.weekdays.push(id)
}

function ensureExpanded(types) {
  for (const t of types || []) {
    if (expanded[t.id] === undefined) expanded[t.id] = true
    for (const p of t.rate_plans || []) {
      const key = planKey(t, p)
      if (expandedPlans[key] === undefined) expandedPlans[key] = true
    }
  }
}

async function loadCalendar() {
  loading.value = true
  errorMsg.value = ''
  try {
    const { data } = await api.get(`/api/admin/${hotelSlug.value}/channel/calendar`, {
      params: { from: from.value, to: to.value },
    })
    calendar.value = data
    ensureExpanded(data.room_types)
    if (!selectedTypeId.value && data.room_types?.[0]) {
      selectedTypeId.value = data.room_types[0].id
    } else if (selectedTypeId.value && !data.room_types.some((t) => t.id === selectedTypeId.value)) {
      selectedTypeId.value = data.room_types[0]?.id || ''
    }
    if (selectedPlanId.value && !(data.rate_plans || []).some((p) => p.id === selectedPlanId.value)) {
      selectedPlanId.value = ''
    }
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'โหลดปฏิทินไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

function shiftRange(dir) {
  const n = days.value
  from.value = addDaysLocal(from.value, dir * n)
  to.value = addDaysLocal(from.value, n - 1)
}

function setWindow(n) {
  to.value = addDaysLocal(from.value, Number(n) - 1)
}

function clampRange() {
  if (!from.value) from.value = localYmd()
  if (!to.value || to.value < from.value) to.value = from.value
  if (daysInclusive(from.value, to.value) > MAX_CALENDAR_DAYS) {
    to.value = addDaysLocal(from.value, MAX_CALENDAR_DAYS - 1)
  }
}

function selectType(type) {
  selectedTypeId.value = type.id
  selectedPlanId.value = ''
}

function selectPlan(type, plan) {
  selectedTypeId.value = type.id
  selectedPlanId.value = plan.id
  expanded[type.id] = true
}

function openBulkForm() {
  if (!selectedTypeId.value && calendar.value.room_types[0]) {
    selectedTypeId.value = calendar.value.room_types[0].id
  }
  bulk.date_from = from.value
  bulk.date_to = to.value
  formTab.value = 'update'
  cancelPlanId.value = selectedPlanId.value
  cancelScope.value = 'all'
  formError.value = ''
  formMessage.value = ''
  showBulkForm.value = true
}

function closeBulkForm() {
  showBulkForm.value = false
}

function openStopForm() {
  stopSale.date_from = from.value
  stopSale.date_to = to.value
  stopSale.weekdays = [0, 1, 2, 3, 4, 5, 6]
  stopSale.mode = 'room_type'
  stopSale.room_type_id = selectedTypeId.value || calendar.value.room_types[0]?.id || ''
  stopSale.rate_plan_id = selectedPlanId.value || ''
  stopError.value = ''
  stopMessage.value = ''
  showStopForm.value = true
}

function closeStopForm() {
  showStopForm.value = false
}

function openDisplayForm() {
  displayPrice.mode = 'room_type_rate_plan'
  displayPrice.room_type_id = selectedTypeId.value || calendar.value.room_types[0]?.id || ''
  const typePlans = (calendar.value.room_types || []).find((t) => t.id === displayPrice.room_type_id)?.rate_plans || []
  displayPrice.rate_plan_id = selectedPlanId.value
    || typePlans[0]?.id
    || hotelPlans.value[0]?.id
    || ''
  displayPrice.date_from = from.value
  displayPrice.date_to = to.value
  displayPrice.weekdays = [0, 1, 2, 3, 4, 5, 6]
  displayPrice.input_mode = 'percent'
  displayPrice.value = ''
  displayError.value = ''
  displayMessage.value = ''
  showDisplayForm.value = true
}

function closeDisplayForm() {
  showDisplayForm.value = false
}

function setDisplayMode(mode) {
  displayPrice.mode = mode
  displayError.value = ''
  displayMessage.value = ''
  if (mode === 'room_type') {
    if (!displayPrice.room_type_id && calendar.value.room_types[0]) {
      displayPrice.room_type_id = calendar.value.room_types[0].id
    }
    displayPrice.rate_plan_id = ''
  } else if (mode === 'rate_plan') {
    displayPrice.room_type_id = ''
    if (!displayPrice.rate_plan_id && hotelPlans.value[0]) {
      displayPrice.rate_plan_id = hotelPlans.value[0].id
    }
  } else if (mode === 'room_type_rate_plan') {
    if (!displayPrice.room_type_id && calendar.value.room_types[0]) {
      displayPrice.room_type_id = calendar.value.room_types[0].id
    }
    if (displayPrice.rate_plan_id && !plansForDisplayType.value.some((p) => p.id === displayPrice.rate_plan_id)) {
      displayPrice.rate_plan_id = plansForDisplayType.value[0]?.id || ''
    }
  }
}

async function submitDisplayPrice(action) {
  displayError.value = ''
  displayMessage.value = ''
  if (!displayPrice.date_from || !displayPrice.date_to || displayPrice.date_to < displayPrice.date_from) {
    displayError.value = 'เลือกช่วงวันที่ให้ถูกต้อง'
    return
  }
  if (!displayPrice.weekdays.length) {
    displayError.value = 'เลือกอย่างน้อย 1 วันในสัปดาห์'
    return
  }
  if (displayPrice.mode === 'room_type' && !displayPrice.room_type_id) {
    displayError.value = 'เลือกประเภทห้อง'
    return
  }
  if (displayPrice.mode === 'rate_plan' && !displayPrice.rate_plan_id) {
    displayError.value = 'เลือกเรทแพลน'
    return
  }
  if (displayPrice.mode === 'room_type_rate_plan' && (!displayPrice.room_type_id || !displayPrice.rate_plan_id)) {
    displayError.value = 'เลือกประเภทห้องและเรทแพลน'
    return
  }
  if (action === 'set' && !String(displayPrice.value || '').trim()) {
    displayError.value = displayPrice.input_mode === 'amount' ? 'กรอกราคาแสดง' : 'กรอกเปอร์เซ็นต์ส่วนลด'
    return
  }
  saving.value = true
  try {
    const { data } = await api.post(`/api/admin/${hotelSlug.value}/channel/display-price`, {
      mode: displayPrice.mode,
      room_type_id: displayPrice.mode === 'rate_plan' ? undefined : (displayPrice.room_type_id || undefined),
      rate_plan_id: displayPrice.mode === 'room_type' ? undefined : (displayPrice.rate_plan_id || undefined),
      date_from: displayPrice.date_from,
      date_to: displayPrice.date_to,
      weekdays: [...displayPrice.weekdays],
      input_mode: displayPrice.input_mode,
      value: displayPrice.value,
      action,
    })
    await loadCalendar()
    if (action === 'clear') {
      displayMessage.value = `ล้างราคาแสดงแล้ว (${data.cleared || 0} วัน)`
    } else {
      displayMessage.value = `บันทึกราคาแสดงแล้ว (${data.updated || 0} วัน${data.skipped ? ` · ข้าม ${data.skipped}` : ''})`
    }
  } catch (err) {
    displayError.value = err?.response?.data?.error || 'บันทึกราคาแสดงไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

function setStopMode(mode) {
  stopSale.mode = mode
  stopError.value = ''
  stopMessage.value = ''
  if (mode === 'room_type') {
    if (!stopSale.room_type_id && calendar.value.room_types[0]) {
      stopSale.room_type_id = calendar.value.room_types[0].id
    }
    stopSale.rate_plan_id = ''
  } else if (mode === 'rate_plan') {
    stopSale.room_type_id = ''
    if (!stopSale.rate_plan_id && hotelPlans.value[0]) {
      stopSale.rate_plan_id = hotelPlans.value[0].id
    }
  } else if (mode === 'room_type_rate_plan') {
    if (!stopSale.room_type_id && calendar.value.room_types[0]) {
      stopSale.room_type_id = calendar.value.room_types[0].id
    }
    if (stopSale.rate_plan_id && !plansForStopType.value.some((p) => p.id === stopSale.rate_plan_id)) {
      stopSale.rate_plan_id = plansForStopType.value[0]?.id || ''
    }
  }
}

async function submitStopSale(action) {
  stopError.value = ''
  stopMessage.value = ''
  if (!stopSale.date_from || !stopSale.date_to || stopSale.date_to < stopSale.date_from) {
    stopError.value = 'เลือกช่วงวันที่ให้ถูกต้อง'
    return
  }
  if (!stopSale.weekdays.length) {
    stopError.value = 'เลือกอย่างน้อย 1 วันในสัปดาห์'
    return
  }
  if (stopSale.mode === 'room_type' && !stopSale.room_type_id) {
    stopError.value = 'เลือกประเภทห้อง'
    return
  }
  if (stopSale.mode === 'rate_plan' && !stopSale.rate_plan_id) {
    stopError.value = 'เลือกเรทแพลน'
    return
  }
  if (stopSale.mode === 'room_type_rate_plan' && (!stopSale.room_type_id || !stopSale.rate_plan_id)) {
    stopError.value = 'เลือกประเภทห้องและเรทแพลน'
    return
  }
  saving.value = true
  try {
    const { data } = await api.post(`/api/admin/${hotelSlug.value}/channel/stop-sale`, {
      mode: stopSale.mode,
      room_type_id: stopSale.mode === 'rate_plan' ? undefined : (stopSale.room_type_id || undefined),
      rate_plan_id: stopSale.mode === 'room_type' ? undefined : (stopSale.rate_plan_id || undefined),
      date_from: stopSale.date_from,
      date_to: stopSale.date_to,
      weekdays: [...stopSale.weekdays],
      action,
    })
    await loadCalendar()
    if (action === 'open') {
      stopMessage.value = `เปิดขายอีกครั้งแล้ว (${data.cleared || 0} วัน)`
    } else {
      stopMessage.value = `หยุดขายแล้ว (${data.updated || 0} วัน · ${data.pairs || 0} คู่ประเภท/เรท)`
    }
  } catch (err) {
    stopError.value = err?.response?.data?.error || 'บันทึกหยุดขายไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

async function ensurePlanLinked() {
  if (!selectedTypeId.value || !selectedPlanId.value) return
  if (selectedType.value?.rate_plans?.some((p) => p.id === selectedPlanId.value)) return
  await api.post(`/api/admin/${hotelSlug.value}/channel/room-types/${selectedTypeId.value}/rate-plans`, {
    rate_plan_id: selectedPlanId.value,
  })
  await loadCalendar()
}

async function createPlan() {
  if (!newPlanName.value.trim()) return
  saving.value = true
  formError.value = ''
  try {
    const { data } = await api.post(`/api/admin/${hotelSlug.value}/channel/rate-plans`, {
      name: newPlanName.value.trim(),
      includes_breakfast: newPlanIncludesBreakfast.value,
    })
    newPlanName.value = ''
    newPlanIncludesBreakfast.value = false
    if (data?.id) selectedPlanId.value = data.id
    formMessage.value = 'สร้างเรทแพลนแล้ว เลือกใช้ได้ทุกประเภทห้อง'
    await loadCalendar()
    formTab.value = 'update'
  } catch (err) {
    formError.value = err?.response?.data?.error || 'สร้างเรทแพลนไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

function toggleCancelType(id) {
  const i = cancelTypeIds.value.indexOf(id)
  if (i >= 0) cancelTypeIds.value.splice(i, 1)
  else cancelTypeIds.value.push(id)
}

async function cancelPlanUse() {
  if (!cancelPlanId.value) return
  if (cancelScope.value === 'some' && !cancelTypeIds.value.length) {
    formError.value = 'เลือกประเภทห้องที่จะยกเลิก'
    return
  }
  saving.value = true
  formError.value = ''
  try {
    const { data } = await api.post(`/api/admin/${hotelSlug.value}/channel/rate-plans/${cancelPlanId.value}/cancel`, {
      scope: cancelScope.value,
      room_type_ids: cancelScope.value === 'some' ? cancelTypeIds.value : undefined,
    })
    if (cancelScope.value === 'all' || selectedPlanId.value === cancelPlanId.value) {
      if (data?.deleted) selectedPlanId.value = ''
    }
    formMessage.value = data?.deleted
      ? 'ยกเลิกเรทแพลนทุกประเภทห้องแล้ว'
      : `ยกเลิกเรทแพลนจาก ${data?.detached || 0} ประเภทห้องแล้ว`
    cancelPlanId.value = data?.deleted ? '' : cancelPlanId.value
    await loadCalendar()
    cancelTypeIds.value = typesUsingCancelPlan.value.map((t) => t.id)
  } catch (err) {
    formError.value = err?.response?.data?.error || 'ยกเลิกเรทแพลนไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

async function saveRateCell(type, plan, ymd, value) {
  selectPlan(type, plan)
  const raw = String(value ?? '').trim()
  try {
    await api.put(`/api/admin/${hotelSlug.value}/channel/rates`, {
      room_type_id: type.id,
      rate_plan_id: plan.id,
      date_from: ymd,
      date_to: ymd,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      price: raw === '' ? null : raw,
    })
    if (!plan.prices) plan.prices = {}
    if (raw === '') delete plan.prices[ymd]
    else plan.prices[ymd] = Number(raw)
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'บันทึกราคาไม่สำเร็จ'
  }
}

async function saveAbfCell(type, plan, ymd, value) {
  selectPlan(type, plan)
  const raw = String(value ?? '').trim()
  try {
    await api.put(`/api/admin/${hotelSlug.value}/channel/rates`, {
      room_type_id: type.id,
      rate_plan_id: plan.id,
      date_from: ymd,
      date_to: ymd,
      weekdays: [0, 1, 2, 3, 4, 5, 6],
      abf: raw === '' ? null : raw,
    })
    if (!plan.abf) plan.abf = {}
    if (raw === '') delete plan.abf[ymd]
    else plan.abf[ymd] = Number(raw)
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'บันทึกราคาอาหารเช้าไม่สำเร็จ'
  }
}

async function toggleIncludesBreakfast(includes) {
  if (!selectedPlanId.value) {
    formError.value = 'เลือกเรทแพลนก่อน'
    return
  }
  saving.value = true
  formError.value = ''
  try {
    await api.patch(`/api/admin/${hotelSlug.value}/channel/rate-plans/${selectedPlanId.value}`, {
      includes_breakfast: includes,
    })
    formMessage.value = includes ? 'เรทแพลนนี้มีอาหารเช้า' : 'เรทแพลนนี้ไม่มีอาหารเช้า'
    await loadCalendar()
  } catch (err) {
    formError.value = err?.response?.data?.error || 'บันทึกอาหารเช้าไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

async function applyBulk(kind) {
  if (!selectedTypeId.value) {
    formError.value = 'เลือกประเภทห้องก่อน'
    return
  }
  if ((kind === 'price' || kind === 'abf') && !selectedPlanId.value) {
    formError.value = 'เลือกเรทแพลนก่อนอัปเดตราคา'
    return
  }
  if (kind === 'abf' && !selectedPlan.value?.includes_breakfast) {
    formError.value = 'เรทแพลนนี้ยังไม่เปิดอาหารเช้า'
    return
  }
  saving.value = true
  formError.value = ''
  formMessage.value = ''
  try {
    if (kind === 'price' || kind === 'abf') await ensurePlanLinked()
    if (kind === 'abf') {
      await api.put(`/api/admin/${hotelSlug.value}/channel/rates`, {
        room_type_id: selectedTypeId.value,
        rate_plan_id: selectedPlanId.value,
        date_from: bulk.date_from,
        date_to: bulk.date_to,
        weekdays: bulk.weekdays,
        abf: bulk.abf === '' ? null : bulk.abf,
      })
      formMessage.value = 'อัปเดตราคาอาหารเช้าแล้ว'
    } else {
      await api.put(`/api/admin/${hotelSlug.value}/channel/rates`, {
        room_type_id: selectedTypeId.value,
        rate_plan_id: selectedPlanId.value,
        date_from: bulk.date_from,
        date_to: bulk.date_to,
        weekdays: bulk.weekdays,
        price: bulk.price === '' ? null : bulk.price,
      })
      formMessage.value = 'อัปเดตราคาแล้ว'
    }
    await loadCalendar()
  } catch (err) {
    formError.value = err?.response?.data?.error || 'อัปเดตไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

function onKeydown(e) {
  if (e.key !== 'Escape') return
  if (showStopForm.value) closeStopForm()
  else if (showBulkForm.value) closeBulkForm()
}

watch([from, to], () => {
  const before = `${from.value}|${to.value}`
  clampRange()
  if (`${from.value}|${to.value}` !== before) return
  loadCalendar()
})

watch(() => hotelSlug.value, () => loadCalendar())

watch([selectedTypeId, selectedPlanId, showBulkForm, formTab], async () => {
  if (!showBulkForm.value || formTab.value !== 'update') return
  if (!selectedTypeId.value || !selectedPlanId.value) return
  if (saving.value) return
  try {
    await ensurePlanLinked()
  } catch (err) {
    formError.value = err?.response?.data?.error || 'ผูกเรทแพลนไม่สำเร็จ'
  }
})

watch(cancelPlanId, () => {
  cancelTypeIds.value = typesUsingCancelPlan.value.map((t) => t.id)
})

watch(showBulkForm, (on) => {
  if (!on && !showStopForm.value) document.body.style.overflow = ''
  else if (on) document.body.style.overflow = 'hidden'
})

watch(showStopForm, (on) => {
  if (!on && !showBulkForm.value) document.body.style.overflow = ''
  else if (on) document.body.style.overflow = 'hidden'
})

watch(() => stopSale.room_type_id, () => {
  if (stopSale.mode !== 'room_type_rate_plan') return
  if (!plansForStopType.value.some((p) => p.id === stopSale.rate_plan_id)) {
    stopSale.rate_plan_id = ''
  }
})

onMounted(() => {
  loadCalendar()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  document.body.style.overflow = ''
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="cm">
    <div class="card cm-toolbar">
      <div class="cm-nav">
        <button type="button" class="icon-btn" title="ช่วงก่อนหน้า" :disabled="loading" @click="shiftRange(-1)">
          <i class="ti ti-chevrons-left"></i>
        </button>
        <div class="cm-dates">
          <label class="form-label">เริ่มวันที่</label>
          <input v-model="from" type="date" class="form-input" />
        </div>
        <div class="cm-dates">
          <label class="form-label">ถึง</label>
          <input v-model="to" type="date" class="form-input" :min="from" :max="maxToDate" />
        </div>
        <button type="button" class="icon-btn" title="ช่วงถัดไป" :disabled="loading" @click="shiftRange(1)">
          <i class="ti ti-chevrons-right"></i>
        </button>
        <button type="button" class="btn btn-outline cm-refresh" :disabled="loading" @click="loadCalendar">
          <i :class="['ti', loading ? 'ti-loader-2 spin' : 'ti-refresh']"></i>
          รีเฟรช
        </button>
        <button type="button" class="btn btn-primary cm-update" @click="openBulkForm">
          อัปเดตราคา
        </button>
        <button type="button" class="btn btn-outline cm-display" @click="openDisplayForm">
          ราคาแสดง
        </button>
        <button type="button" class="btn btn-outline cm-stop" @click="openStopForm">
          หยุดขาย
        </button>
      </div>
      <div class="cm-windows">
        <button
          v-for="n in WINDOWS"
          :key="n"
          type="button"
          class="tab-btn"
          :class="{ active: days === n }"
          @click="setWindow(n)"
        >{{ n }} วัน</button>
      </div>
      <p v-if="days >= 120" class="muted">ช่วงยาวจะดึงห้องว่างจาก PMS เป็นช่วง — อาจใช้เวลาสักครู่</p>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
    <p v-if="loading && !calendar.room_types.length" class="muted">กำลังโหลดตาราง...</p>

    <div class="card cm-table-wrap">
      <div class="cm-table-scroll">
        <table class="cm-table">
          <thead>
            <tr>
              <th class="sticky">ประเภทห้อง / รายการ</th>
              <th v-for="d in calendar.dates" :key="d">
                <span class="cm-dow">{{ colParts(d).dow }}</span>
                <span class="cm-day">{{ colParts(d).day }}</span>
                <span class="cm-mon">{{ colParts(d).mon }}</span>
              </th>
            </tr>
          </thead>
          <tbody v-if="calendar.room_types.length">
            <template v-for="type in calendar.room_types" :key="type.id">
              <tr
                class="cm-type-row"
                :class="{ selected: type.id === selectedTypeId && !selectedPlanId }"
                @click="selectType(type)"
              >
                <th class="sticky">
                  <button
                    type="button"
                    class="cm-toggle"
                    :aria-expanded="!!expanded[type.id]"
                    @click.stop="expanded[type.id] = !expanded[type.id]"
                  >
                    <i :class="['ti', expanded[type.id] ? 'ti-chevron-down' : 'ti-chevron-right']"></i>
                  </button>
                  <span class="cm-type-name">{{ type.name }}</span>
                </th>
                <td
                  v-for="d in calendar.dates"
                  :key="'t-'+type.id+d"
                >{{ allotLabel(type, d) }}</td>
              </tr>
              <template v-if="expanded[type.id]">
                <template v-if="type.rate_plans.length">
                  <template v-for="plan in type.rate_plans" :key="plan.id">
                    <tr
                      class="cm-plan-row"
                      :class="{ selected: type.id === selectedTypeId && plan.id === selectedPlanId }"
                      @click="selectPlan(type, plan)"
                    >
                      <th class="sticky indent">
                        <button
                          type="button"
                          class="cm-toggle"
                          :aria-expanded="!!expandedPlans[planKey(type, plan)]"
                          @click.stop="expandedPlans[planKey(type, plan)] = !expandedPlans[planKey(type, plan)]"
                        >
                          <i :class="['ti', expandedPlans[planKey(type, plan)] ? 'ti-chevron-down' : 'ti-chevron-right']"></i>
                        </button>
                        {{ plan.name }}
                        <span v-if="plan.includes_breakfast" class="cm-abf-tag">อาหารเช้า</span>
                      </th>
                      <td v-for="d in calendar.dates" :key="'ph-'+plan.id+d" :class="{ 'cm-stopped': plan.stop_sale?.[d] }">
                        <span v-if="plan.stop_sale?.[d]" class="cm-stop-badge">หยุด</span>
                        <span v-else class="muted-cell">—</span>
                      </td>
                    </tr>
                    <tr
                      v-if="expandedPlans[planKey(type, plan)]"
                      class="cm-rate-row"
                      :class="{ selected: type.id === selectedTypeId && plan.id === selectedPlanId }"
                      @click="selectPlan(type, plan)"
                    >
                      <th class="sticky indent2">ราคาห้อง</th>
                      <td
                        v-for="d in calendar.dates"
                        :key="'p-'+plan.id+d"
                        :class="{ 'cm-stopped': plan.stop_sale?.[d] }"
                      >
                        <input
                          class="cm-cell"
                          type="number"
                          min="0"
                          :value="plan.prices[d] ?? ''"
                          @click.stop
                          @change="saveRateCell(type, plan, d, $event.target.value)"
                        />
                      </td>
                    </tr>
                    <tr
                      v-if="expandedPlans[planKey(type, plan)] && plan.includes_breakfast"
                      class="cm-abf-row"
                      :class="{ selected: type.id === selectedTypeId && plan.id === selectedPlanId }"
                      @click="selectPlan(type, plan)"
                    >
                      <th class="sticky indent2">อาหารเช้า / คน</th>
                      <td
                        v-for="d in calendar.dates"
                        :key="'abf-'+plan.id+d"
                        :class="{ 'cm-stopped': plan.stop_sale?.[d] }"
                      >
                        <input
                          class="cm-cell"
                          type="number"
                          min="0"
                          :value="plan.abf?.[d] ?? ''"
                          @click.stop
                          @change="saveAbfCell(type, plan, d, $event.target.value)"
                        />
                      </td>
                    </tr>
                  </template>
                </template>
                <tr v-else class="cm-empty-row">
                  <th class="sticky indent muted">ยังไม่มีเรทแพลน</th>
                  <td :colspan="calendar.dates.length" class="muted">กดอัปเดตราคา เพื่อสร้างหรือผูกเรทแพลน</td>
                </tr>
              </template>
            </template>
          </tbody>
          <tbody v-else-if="!loading">
            <tr>
              <td class="muted" :colspan="calendar.dates.length + 1">ยังไม่มีประเภทห้องในช่วงนี้</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted cm-hint">
        แถวประเภทห้อง = ว่าง{{ calendar.pms ? ' PMS' : 'คลัง' }}
        · ช่องสีแดงอ่อน = หยุดขาย
        · กดแถวเพื่อเลือก แล้วเปิดฟอร์มอัปเดตราคา / หยุดขาย
      </p>
    </div>

    <div
      v-if="showDisplayForm"
      class="cm-backdrop"
      @click.self="closeDisplayForm"
    >
      <div class="cm-sheet cm-sheet-center" role="dialog" aria-modal="true" aria-labelledby="cm-display-title">
        <div class="cm-sheet-head">
          <h2 id="cm-display-title" class="info-title">ราคาแสดง</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" @click="closeDisplayForm">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="cm-form-tabs">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: displayPrice.mode === 'room_type' }"
            @click="setDisplayMode('room_type')"
          >Roomtype</button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: displayPrice.mode === 'rate_plan' }"
            @click="setDisplayMode('rate_plan')"
          >Rateplan</button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: displayPrice.mode === 'room_type_rate_plan' }"
            @click="setDisplayMode('room_type_rate_plan')"
          >Roomtype + Rateplan</button>
        </div>
        <div class="cm-sheet-body">
          <p class="muted">{{ displaySummary }} — ราคาแสดงใช้ขีดฆ่าบนหน้าจอง ไม่เปลี่ยนราคาขายจริง</p>

          <div class="cm-bulk-grid">
            <div class="cm-row">
              <label class="form-label">ประเภทห้อง</label>
              <select
                v-model="displayPrice.room_type_id"
                class="form-input"
                :disabled="displayPrice.mode === 'rate_plan'"
              >
                <option v-if="displayPrice.mode === 'rate_plan'" value="">ทุกประเภทที่ใช้เรทนี้</option>
                <template v-else>
                  <option value="">เลือกประเภทห้อง</option>
                  <option v-for="t in calendar.room_types" :key="t.id" :value="t.id">{{ t.name }}</option>
                </template>
              </select>
            </div>
            <div class="cm-row">
              <label class="form-label">เรทแพลน</label>
              <select
                v-model="displayPrice.rate_plan_id"
                class="form-input"
                :disabled="displayPrice.mode === 'room_type'"
              >
                <option v-if="displayPrice.mode === 'room_type'" value="">ทุกเรทของประเภทนี้</option>
                <template v-else>
                  <option value="">เลือกเรทแพลน</option>
                  <option v-for="p in displayPlanOptions" :key="p.id" :value="p.id">
                    {{ p.name }}{{ p.includes_breakfast ? ' · อาหารเช้า' : '' }}
                  </option>
                </template>
              </select>
            </div>
          </div>

          <div class="cm-bulk-grid">
            <div class="cm-row">
              <label class="form-label">ตั้งแต่</label>
              <input v-model="displayPrice.date_from" type="date" class="form-input" />
            </div>
            <div class="cm-row">
              <label class="form-label">ถึง</label>
              <input v-model="displayPrice.date_to" type="date" class="form-input" :min="displayPrice.date_from" />
            </div>
          </div>

          <div class="cm-weekdays">
            <button
              v-for="d in WEEKDAYS"
              :key="d.id"
              type="button"
              class="cm-day-btn"
              :class="{ active: displayPrice.weekdays.includes(d.id) }"
              @click="toggleDisplayWeekday(d.id)"
            >{{ d.label }}</button>
          </div>

          <div class="cm-row">
            <label class="form-label">กรอกเป็น</label>
            <div class="cm-weekdays">
              <button
                type="button"
                class="cm-day-btn cm-abf-choice"
                :class="{ active: displayPrice.input_mode === 'percent' }"
                @click="displayPrice.input_mode = 'percent'"
              >เปอร์เซ็นต์ %</button>
              <button
                type="button"
                class="cm-day-btn cm-abf-choice"
                :class="{ active: displayPrice.input_mode === 'amount' }"
                @click="displayPrice.input_mode = 'amount'"
              >ตัวเลขราคา</button>
            </div>
          </div>

          <div class="cm-row">
            <label class="form-label">
              {{ displayPrice.input_mode === 'percent' ? 'ส่วนลด %' : 'ราคาแสดง (บาท)' }}
            </label>
            <input
              v-model="displayPrice.value"
              type="number"
              min="0"
              :max="displayPrice.input_mode === 'percent' ? 99 : undefined"
              class="form-input"
              :placeholder="displayPrice.input_mode === 'percent' ? 'เช่น 75' : 'เช่น 3234'"
            />
          </div>

          <div v-if="displayPreview" class="cm-price-preview">
            <div class="cm-price-preview-top">
              <span class="cm-price-was">฿{{ displayPreview.display.toLocaleString() }}</span>
              <span class="cm-price-off">-{{ displayPreview.percent }}%</span>
            </div>
            <div class="cm-price-preview-now">
              <span class="cm-price-currency">฿</span>
              <span class="cm-price-sell">{{ displayPreview.sell.toLocaleString() }}</span>
            </div>
            <p class="muted">ตัวอย่างจากราคาขายในตาราง (ไม่เปลี่ยนยอดที่แขกจ่าย)</p>
          </div>

          <button
            class="btn btn-primary"
            type="button"
            :disabled="saving"
            @click="submitDisplayPrice('set')"
          >
            {{ saving ? 'กำลังบันทึก...' : 'บันทึกราคาแสดง' }}
          </button>
          <button
            class="btn btn-outline"
            type="button"
            :disabled="saving"
            @click="submitDisplayPrice('clear')"
          >
            ล้างราคาแสดง
          </button>

          <p v-if="displayMessage" class="success-msg">{{ displayMessage }}</p>
          <p v-if="displayError" class="error-msg">{{ displayError }}</p>
        </div>
      </div>
    </div>

    <div
      v-if="showStopForm"
      class="cm-backdrop"
      @click.self="closeStopForm"
    >
      <div class="cm-sheet" role="dialog" aria-modal="true" aria-labelledby="cm-stop-title">
        <div class="cm-sheet-head">
          <h2 id="cm-stop-title" class="info-title">หยุดขาย</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" @click="closeStopForm">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="cm-form-tabs">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: stopSale.mode === 'room_type' }"
            @click="setStopMode('room_type')"
          >Roomtype</button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: stopSale.mode === 'rate_plan' }"
            @click="setStopMode('rate_plan')"
          >Rateplan</button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: stopSale.mode === 'room_type_rate_plan' }"
            @click="setStopMode('room_type_rate_plan')"
          >Roomtype + Rateplan</button>
        </div>
        <div class="cm-sheet-body">
          <p class="muted">{{ stopSummary }}</p>

          <div class="cm-bulk-grid">
            <div class="cm-row">
              <label class="form-label">ประเภทห้อง</label>
              <select
                v-model="stopSale.room_type_id"
                class="form-input"
                :disabled="stopSale.mode === 'rate_plan'"
              >
                <option v-if="stopSale.mode === 'rate_plan'" value="">ทุกประเภทที่ใช้เรทนี้</option>
                <template v-else>
                  <option value="">เลือกประเภทห้อง</option>
                  <option v-for="t in calendar.room_types" :key="t.id" :value="t.id">{{ t.name }}</option>
                </template>
              </select>
            </div>
            <div class="cm-row">
              <label class="form-label">เรทแพลน</label>
              <select
                v-model="stopSale.rate_plan_id"
                class="form-input"
                :disabled="stopSale.mode === 'room_type'"
              >
                <option v-if="stopSale.mode === 'room_type'" value="">ทุกเรทของประเภทนี้</option>
                <template v-else>
                  <option value="">เลือกเรทแพลน</option>
                  <option v-for="p in stopPlanOptions" :key="p.id" :value="p.id">
                    {{ p.name }}{{ p.includes_breakfast ? ' · อาหารเช้า' : '' }}
                  </option>
                </template>
              </select>
            </div>
          </div>

          <div class="cm-bulk-grid">
            <div class="cm-row">
              <label class="form-label">ตั้งแต่</label>
              <input v-model="stopSale.date_from" type="date" class="form-input" />
            </div>
            <div class="cm-row">
              <label class="form-label">ถึง</label>
              <input v-model="stopSale.date_to" type="date" class="form-input" :min="stopSale.date_from" />
            </div>
          </div>

          <div class="cm-weekdays">
            <button
              v-for="d in WEEKDAYS"
              :key="d.id"
              type="button"
              class="cm-day-btn"
              :class="{ active: stopSale.weekdays.includes(d.id) }"
              @click="toggleStopWeekday(d.id)"
            >{{ d.label }}</button>
          </div>

          <button
            class="btn btn-primary"
            type="button"
            :disabled="saving"
            @click="submitStopSale('stop')"
          >
            {{ saving ? 'กำลังบันทึก...' : 'ยืนยันหยุดขาย' }}
          </button>
          <button
            class="btn btn-outline"
            type="button"
            :disabled="saving"
            @click="submitStopSale('open')"
          >
            เปิดขายอีกครั้ง
          </button>

          <p v-if="stopMessage" class="success-msg">{{ stopMessage }}</p>
          <p v-if="stopError" class="error-msg">{{ stopError }}</p>
        </div>
      </div>
    </div>

    <div
      v-if="showBulkForm"
      class="cm-backdrop"
      @click.self="closeBulkForm"
    >
      <div class="cm-sheet" role="dialog" aria-modal="true" aria-labelledby="cm-form-title">
        <div class="cm-sheet-head">
          <h2 id="cm-form-title" class="info-title">{{ formTitle }}</h2>
          <button type="button" class="icon-btn" aria-label="ปิด" @click="closeBulkForm">
            <i class="ti ti-x"></i>
          </button>
        </div>
        <div class="cm-form-tabs">
          <button
            type="button"
            class="tab-btn"
            :class="{ active: formTab === 'update' }"
            @click="formTab = 'update'"
          >อัปเดตราคา</button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: formTab === 'create' }"
            @click="formTab = 'create'"
          >สร้างเรทแพลนใหม่</button>
          <button
            type="button"
            class="tab-btn"
            :class="{ active: formTab === 'cancel' }"
            @click="formTab = 'cancel'"
          >ยกเลิกเรทแพลน</button>
        </div>
        <div class="cm-sheet-body">
          <template v-if="formTab === 'create'">
            <p class="muted">เรทแพลนอยู่ระดับโรงแรม ใช้ได้ทุกประเภทห้อง ไม่ต้องเลือกประเภทตอนสร้าง</p>
            <div class="cm-row">
              <label class="form-label">ชื่อเรทแพลน</label>
              <input v-model="newPlanName" class="form-input" placeholder="เช่น BAR, Non-refundable" />
            </div>
            <label class="cm-check">
              <input v-model="newPlanIncludesBreakfast" type="checkbox" />
              มีอาหารเช้า
            </label>
            <p v-if="hotelPlans.length" class="muted">มีอยู่แล้ว: {{ hotelPlans.map((p) => p.name).join(', ') }}</p>
            <button class="btn btn-primary" type="button" :disabled="saving || !newPlanName.trim()" @click="createPlan">สร้าง</button>
          </template>
          <template v-else-if="formTab === 'cancel'">
            <p class="muted">ถอดเรทแพลนออกจากประเภทห้องที่เลือก หรือยกเลิกทุกประเภทแล้วลบเรทแพลนนี้ทิ้ง</p>
            <div class="cm-row">
              <label class="form-label">เรทแพลน</label>
              <select v-model="cancelPlanId" class="form-input">
                <option value="">เลือกเรทแพลน</option>
                <option v-for="p in hotelPlans" :key="p.id" :value="p.id">
                  {{ p.name }}{{ p.includes_breakfast ? ' · อาหารเช้า' : '' }}
                </option>
              </select>
            </div>
            <div class="cm-row">
              <label class="form-label">ยกเลิกกับ</label>
              <div class="cm-weekdays">
                <button
                  type="button"
                  class="cm-day-btn cm-abf-choice"
                  :class="{ active: cancelScope === 'all' }"
                  @click="cancelScope = 'all'"
                >ทุกประเภทห้อง</button>
                <button
                  type="button"
                  class="cm-day-btn cm-abf-choice"
                  :class="{ active: cancelScope === 'some' }"
                  @click="cancelScope = 'some'"
                >เฉพาะบางประเภท</button>
              </div>
            </div>
            <div v-if="cancelScope === 'some'" class="cm-row">
              <label class="form-label">ประเภทห้องที่ใช้เรทนี้</label>
              <p v-if="!cancelPlanId" class="muted">เลือกเรทแพลนก่อน</p>
              <p v-else-if="!typesUsingCancelPlan.length" class="muted">เรทนี้ยังไม่ได้ใช้กับประเภทห้องใด</p>
              <div v-else class="cm-type-picks">
                <label v-for="t in typesUsingCancelPlan" :key="t.id" class="cm-check">
                  <input
                    type="checkbox"
                    :checked="cancelTypeIds.includes(t.id)"
                    @change="toggleCancelType(t.id)"
                  />
                  {{ t.name }}
                </label>
              </div>
            </div>
            <p v-if="cancelScope === 'all' && cancelPlanId" class="muted">จะถอดออกจากทุกประเภทห้อง และลบเรทแพลนพร้อมราคาที่ใส่ไว้</p>
            <button
              class="btn btn-outline"
              type="button"
              :disabled="saving || !cancelPlanId || (cancelScope === 'some' && !cancelTypeIds.length)"
              @click="cancelPlanUse"
            >{{ cancelScope === 'all' ? 'ยกเลิกทุกประเภทห้อง' : 'ยกเลิกประเภทที่เลือก' }}</button>
          </template>
          <template v-else>
          <p class="muted">
            ประเภท: <strong>{{ selectedType?.name || 'ยังไม่เลือก' }}</strong>
            · เรทแพลน: <strong>{{ selectedPlan?.name || 'ยังไม่เลือก' }}</strong>
            — เลือกวันในสัปดาห์ได้ เพราะวันเดียวกันคนละเรทแพลน/คนละวันราคาต่างกันได้
          </p>
          <div class="cm-bulk-grid">
            <div class="cm-row">
              <label class="form-label">ประเภทห้อง</label>
              <select v-model="selectedTypeId" class="form-input">
                <option value="">เลือกประเภทห้อง</option>
                <option v-for="t in calendar.room_types" :key="t.id" :value="t.id">{{ t.name }}</option>
              </select>
            </div>
            <div class="cm-row">
              <label class="form-label">เรทแพลน</label>
              <select v-model="selectedPlanId" class="form-input">
                <option value="">ยังไม่เลือก</option>
                <option v-for="p in hotelPlans" :key="p.id" :value="p.id">
                  {{ p.name }}{{ p.includes_breakfast ? ' · อาหารเช้า' : '' }}
                </option>
              </select>
            </div>
          </div>
          <div v-if="selectedPlan" class="cm-row">
            <label class="form-label">อาหารเช้าของเรทแพลนนี้</label>
            <div class="cm-weekdays">
              <button
                type="button"
                class="cm-day-btn cm-abf-choice"
                :class="{ active: selectedPlan.includes_breakfast }"
                :disabled="saving"
                @click="toggleIncludesBreakfast(true)"
              >มีอาหารเช้า</button>
              <button
                type="button"
                class="cm-day-btn cm-abf-choice"
                :class="{ active: !selectedPlan.includes_breakfast }"
                :disabled="saving"
                @click="toggleIncludesBreakfast(false)"
              >ไม่มีอาหารเช้า</button>
            </div>
          </div>
          <div class="cm-bulk-grid">
            <div class="cm-row">
              <label class="form-label">ตั้งแต่</label>
              <input v-model="bulk.date_from" type="date" class="form-input" />
            </div>
            <div class="cm-row">
              <label class="form-label">ถึง</label>
              <input v-model="bulk.date_to" type="date" class="form-input" />
            </div>
          </div>
          <div class="cm-weekdays">
            <button
              v-for="d in WEEKDAYS"
              :key="d.id"
              type="button"
              class="cm-day-btn"
              :class="{ active: bulk.weekdays.includes(d.id) }"
              @click="toggleWeekday(d.id)"
            >{{ d.label }}</button>
          </div>
          <div class="cm-bulk-grid">
            <div class="cm-row">
              <label class="form-label">ราคาห้อง / คืน</label>
              <input v-model="bulk.price" class="form-input" type="number" min="0" placeholder="ว่าง = ลบค่า" />
              <button class="btn btn-outline" type="button" :disabled="saving" @click="applyBulk('price')">อัปเดตราคาห้อง</button>
            </div>
            <div v-if="selectedPlan?.includes_breakfast" class="cm-row">
              <label class="form-label">ราคาอาหารเช้า / คน / คืน</label>
              <input v-model="bulk.abf" class="form-input" type="number" min="0" placeholder="ว่าง = ลบค่า" />
              <button class="btn btn-outline" type="button" :disabled="saving" @click="applyBulk('abf')">อัปเดตอาหารเช้า</button>
            </div>
            </div>
          </template>
          <p v-if="formMessage" class="success-msg">{{ formMessage }}</p>
          <p v-if="formError" class="error-msg">{{ formError }}</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cm { display: flex; flex-direction: column; gap: var(--space-3); }
.cm-toolbar { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.cm-nav { display: flex; flex-wrap: wrap; align-items: flex-end; gap: var(--space-2); }
.cm-dates { display: flex; flex-direction: column; gap: 4px; min-width: 140px; }
.cm-refresh, .cm-update, .cm-stop, .cm-display { width: auto; min-width: 0; }
.cm-stopped { background: #fde8e8; }
.cm-stop-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: #9b1c1c;
  background: #fff5f5;
  border: 1px solid #f5c2c2;
  border-radius: var(--radius-pill);
  padding: 1px 6px;
}
.cm-price-preview {
  align-self: flex-start;
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, #dbeafe 55%, var(--color-surface));
  border: 1px solid color-mix(in srgb, #93c5fd 40%, var(--color-border));
}
.cm-price-preview-top {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.cm-price-was {
  position: relative;
  color: #4b5563;
  font-size: 18px;
  font-weight: 600;
  text-decoration: line-through;
  text-decoration-color: #e11d48;
  text-decoration-thickness: 2px;
}
.cm-price-off { color: #e11d48; font-weight: 700; font-size: 16px; }
.cm-price-preview-now {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin-top: 2px;
}
.cm-price-currency { color: #374151; font-size: 18px; font-weight: 600; }
.cm-price-sell { color: #e11d48; font-size: 28px; font-weight: 800; line-height: 1; }
.cm-sheet-center {
  /* keep same sheet; desktop already centers */
}
.cm-windows { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.cm-form-tabs {
  display: flex;
  gap: var(--space-2);
  padding: var(--space-3) var(--space-4) 0;
  overflow-x: auto;
}
.info-title { font-size: var(--text-h3); font-weight: 700; margin: 0; }
.muted { color: var(--color-text-muted); font-size: var(--text-sm); margin: 0; }
.form-label { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); }
.form-input { padding: var(--space-2) var(--space-3); border: 1px solid var(--color-border); border-radius: var(--radius-md); font-family: inherit; font-size: 16px; background: var(--color-surface); }
.success-msg { color: var(--color-success); font-size: var(--text-sm); margin: 0; }
.error-msg { color: var(--color-error); font-size: var(--text-sm); margin: 0; }
.cm-table-wrap { padding: var(--space-3); }
.cm-table-scroll { overflow: auto; max-height: calc(100vh - 280px); border: 1px solid var(--color-border); border-radius: var(--radius-md); }
.cm-table { border-collapse: collapse; min-width: 100%; font-size: var(--text-sm); }
.cm-table th, .cm-table td {
  border: 1px solid var(--color-border);
  padding: 4px 6px;
  text-align: center;
  white-space: nowrap;
  min-width: 56px;
}
.cm-table thead th {
  background: var(--color-primary);
  color: var(--color-on-primary);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 2;
}
.cm-table thead th.sticky { z-index: 3; }
.cm-dow, .cm-day, .cm-mon { display: block; line-height: 1.15; }
.cm-day { font-size: 15px; font-weight: 700; }
.cm-dow, .cm-mon { font-size: 11px; opacity: 0.9; }
.cm-table .sticky {
  position: sticky;
  left: 0;
  text-align: left;
  z-index: 1;
  min-width: 180px;
  max-width: 220px;
}
.cm-type-row th.sticky, .cm-type-row td {
  background: color-mix(in srgb, var(--color-accent) 22%, var(--color-surface-elevated));
  font-weight: 700;
}
.cm-allot-row th.sticky, .cm-allot-row td {
  background: var(--color-surface);
}
.cm-plan-row th.sticky, .cm-plan-row td {
  background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface-elevated));
  font-weight: 600;
}
.cm-rate-row th.sticky, .cm-rate-row td { background: var(--color-surface-elevated); }
.cm-abf-tag {
  display: inline-block;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-success) 22%, var(--color-surface-elevated));
  font-size: 11px;
  font-weight: 600;
  vertical-align: middle;
}
.cm-abf-row th.sticky, .cm-abf-row td {
  background: color-mix(in srgb, var(--color-success) 8%, var(--color-surface-elevated));
}
.cm-abf-choice { width: auto; min-width: 120px; padding: 0 12px; }
.cm-check {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-sm);
  font-weight: 600;
}
.cm-type-picks {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.cm-empty-row th.sticky, .cm-empty-row td { background: var(--color-surface); }
.cm-type-row.selected th.sticky,
.cm-type-row.selected td,
.cm-plan-row.selected th.sticky,
.cm-plan-row.selected td,
.cm-rate-row.selected th.sticky,
.cm-rate-row.selected td,
.cm-abf-row.selected th.sticky,
.cm-abf-row.selected td {
  outline: 2px solid var(--color-primary);
  outline-offset: -2px;
}
.cm-toggle {
  border: none;
  background: transparent;
  width: 28px;
  height: 28px;
  padding: 0;
  color: inherit;
  cursor: pointer;
  vertical-align: middle;
}
.cm-type-name { vertical-align: middle; }
.indent { padding-left: 28px !important; font-weight: 500; }
.indent2 { padding-left: 48px !important; font-weight: 500; }
.closed { color: var(--color-error); font-weight: 700; }
.muted-cell { color: var(--color-text-muted); }
.cm-cell {
  width: 64px;
  padding: 4px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  font-family: inherit;
  font-size: 14px;
  text-align: right;
  background: var(--color-surface);
}
.cm-hint { margin: var(--space-3) 0 0; }
.cm-backdrop {
  position: fixed;
  inset: 0;
  background: var(--color-overlay);
  z-index: var(--z-admin-modal);
  display: flex;
  align-items: flex-end;
  padding: 0;
}
.cm-sheet {
  background: var(--color-surface);
  border-radius: var(--radius-card) var(--radius-card) 0 0;
  width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  box-shadow: var(--shadow-sheet);
}
.cm-sheet-head {
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
.cm-sheet-body { padding: var(--space-4); display: flex; flex-direction: column; gap: var(--space-3); }
.cm-row { display: flex; flex-direction: column; gap: var(--space-1); }
.cm-bulk-grid { display: grid; grid-template-columns: 1fr; gap: var(--space-3); }
.cm-weekdays { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.cm-day-btn {
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}
.cm-day-btn.active {
  background: var(--color-primary);
  color: var(--color-on-primary);
  border-color: var(--color-primary);
}
.cm-windows .tab-btn,
.cm-form-tabs .tab-btn {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-family: inherit;
  cursor: pointer;
  font-size: var(--text-sm);
  white-space: nowrap;
}
.cm-windows .tab-btn.active,
.cm-form-tabs .tab-btn.active {
  background: var(--color-primary);
  color: var(--color-on-primary);
  border-color: var(--color-primary);
}
.spin { animation: cm-spin 1s linear infinite; }
@keyframes cm-spin { to { transform: rotate(360deg); } }
@media (min-width: 900px) {
  .cm-nav { flex-wrap: nowrap; }
  .cm-update { margin-left: auto; }
  .cm-table-scroll { max-height: calc(100vh - 240px); }
  .cm-backdrop { align-items: center; padding: var(--space-4); }
  .cm-sheet {
    max-width: 640px;
    margin: 0 auto;
    border-radius: var(--radius-card);
    max-height: 85vh;
  }
  .cm-bulk-grid { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 899px) {
  .cm-backdrop:has(.cm-sheet-center) { align-items: center; padding: var(--space-3); }
  .cm-sheet-center {
    max-width: 520px;
    margin: 0 auto;
    border-radius: var(--radius-card);
    max-height: 90vh;
  }
}
</style>
