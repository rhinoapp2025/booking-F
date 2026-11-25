<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import api from '../api/axios'
import { useAuthStore } from '../stores/auth'
import Swal from 'sweetalert2'

const props = defineProps({
  hotelSlug: { type: String, required: true },
})

const auth = useAuthStore()
const loading = ref(false)
const errorText = ref('')
const data = ref(null)
const MAX_DAYS = 90
const DAYS_KEY = 'booking-admin-pms-calendar-days'
const days = ref(savedDays())
const bgn = ref(bangkokToday())
const scroller = ref(null)
const roomSearch = ref('')
const typeFilter = ref('')
const grouped = ref(false)
const hidden = ref([])
const detail = ref(null)
const stopSale = ref(null)
const release = ref(null)
const saving = ref(false)
const folio = ref(null)
const folioLoading = ref(false)
const chargeForm = ref({ trnCode: '', quantity: 1, amount: 0, remark: '' })
const paymentForm = ref({ trnCode: '', amount: 0, company: '', remark: '' })
// แผงด้านขวา: summary = รายละเอียด, checkin = ขั้นเช็คอิน, folio = ขั้นเช็คเอาต์
const panel = ref('summary')
const folioTab = ref('charge')
// 0 = Posting, 1 = Rebate ตรงกับแคชเชียร์ PMS (TrnCredit)
const postKind = ref('0')
const checkin = ref(null)
const checkinLoading = ref(false)
const checkinError = ref('')
const checkinTried = ref(false)
const checkinForm = ref({ fill: {}, paidBy: '', depositAmount: 0, reference: '', keyAmount: 0 })

const isBooking = computed(() => ['booked', 'unconfirmed'].includes(detail.value?.kind)
  && /^\d+$/.test(String(detail.value?.resvNo || '')))
const isInhouse = computed(() => detail.value?.kind === 'inhouse' && detail.value?.source !== 'folio')
const missingCount = computed(() => checkin.value?.missing?.length || 0)
// มีเลขจองใน PMS = โหลดวันเข้าพัก/ออกและข้อมูลที่แก้ไขได้ (ทั้งที่จองไว้และที่เข้าพักแล้ว)
const hasResv = computed(() => (isBooking.value || isInhouse.value)
  && /^\d+$/.test(String(detail.value?.resvNo || '')))
const canEdit = computed(() => ['booked', 'unconfirmed', 'inhouse'].includes(detail.value?.kind)
  && hasResv.value && Boolean(checkin.value?.edit?.allowed))
const editGroups = [
  { key: 'stay', label: 'เข้าพัก / ห้อง' },
  { key: 'guest', label: 'ผู้เข้าพัก' },
  { key: 'codes', label: 'ตลาด / เอเจนต์' },
  { key: 'rate', label: 'ราคา / จำนวนคน' },
  { key: 'payment', label: 'การชำระ' },
  { key: 'note', label: 'หมายเหตุ' },
]
// วันเช็คอิน/เช็คเอาต์: จากการจองใน PMS หรือจาก folio history ของแถบประวัติ
const stay = computed(() => {
  const arrival = checkin.value?.arrival || detail.value?.arrival
  const departure = checkin.value?.departure || detail.value?.departure
  if (!arrival || !departure) return null
  const nights = Math.round((Date.parse(`${departure}T00:00:00Z`) - Date.parse(`${arrival}T00:00:00Z`)) / 86400000)
  return { arrival, departure, nights: Math.max(1, nights) }
})

const editForm = ref({})
const editTried = ref(false)
// ลากย้าย: drag = แถบที่กำลังลาก, dropAt = ตำแหน่งที่จะวาง (ไว้ไฮไลต์)
const drag = ref(null)
const dropAt = ref(null)
let dragData = null

function baht(value) {
  return (Number(value) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })
}

const dayChoices = [7, 10, 31, 60]

function clampDays(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || n < 1) return 0
  return Math.min(MAX_DAYS, n)
}

// จำจำนวนวันที่เลือกไว้ในเครื่องนี้ เปิดปฏิทินครั้งหน้าจะได้ช่วงเดิม
function savedDays() {
  try {
    return clampDays(localStorage.getItem(DAYS_KEY)) || 10
  } catch {
    return 10
  }
}

function applyDays(value, input) {
  const next = clampDays(value) || days.value
  if (input) input.value = String(next)
  if (next === days.value) return
  days.value = next
  try { localStorage.setItem(DAYS_KEY, String(next)) } catch { /* ignore */ }
  load()
}
const kindLabel = {
  booked: 'จองแล้ว',
  unconfirmed: 'รอยืนยัน',
  inhouse: 'เข้าพักแล้ว',
  ooo: 'ปิดใช้งาน',
  history: 'ประวัติเข้าพัก',
  new: 'จองใหม่',
}
const newBooking = ref(null)
const newBookingLoading = ref(false)
const newForm = ref({})
const newTried = ref(false)

function bangkokToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

function addDays(ymd, n) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + n))
  return dt.toISOString().slice(0, 10)
}

const endDate = computed(() => addDays(bgn.value || bangkokToday(), Number(days.value) - 1))

const dates = computed(() => data.value?.dates || [])
const rooms = computed(() => data.value?.rooms || [])
const typeNames = computed(() => [...new Set(rooms.value.map((room) => room.typeName || 'ไม่ระบุประเภท'))])

const visibleRooms = computed(() => {
  const query = roomSearch.value.toLocaleLowerCase()
  return rooms.value.filter((room) => {
    const type = room.typeName || ''
    const text = `${room.roomNo} ${room.roomType || ''} ${type}`.toLocaleLowerCase()
    return (!typeFilter.value || type === typeFilter.value) && (!query || text.includes(query))
  })
})

const groups = computed(() => {
  if (!grouped.value) return [{ type: 'ทั้งหมด', rooms: visibleRooms.value }]
  const map = new Map()
  visibleRooms.value.forEach((room) => {
    const type = room.typeName || 'ไม่ระบุประเภท'
    if (!map.has(type)) map.set(type, [])
    map.get(type).push(room)
  })
  return [...map.entries()].map(([type, list]) => ({ type, rooms: list }))
})

const rangeLabel = computed(() => {
  if (!dates.value.length) return 'เลือกช่วงวันที่'
  return `${formatDate(dates.value[0])} — ${formatDate(dates.value[dates.value.length - 1])}`
})

function formatDate(ymd) {
  const [year, month, day] = String(ymd).split('-')
  return `${day}/${month}/${year}`
}

function weekday(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number)
  return ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][new Date(Date.UTC(y, m - 1, d)).getUTCDay()]
}

const thaiMonths = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function monthLabel(ymd, index) {
  if (index !== 0 && String(ymd).slice(8) !== '01') return ''
  return thaiMonths[Number(String(ymd).slice(5, 7)) - 1] || ''
}

function isWeekend(ymd) {
  const name = weekday(ymd)
  return name === 'ส.' || name === 'อา.'
}

function cellOf(room, day) {
  return room.cells?.[day] || null
}

function sameStay(a, b) {
  if (!a || !b) return false
  return a.guest === b.guest && a.resvNo === b.resvNo && a.kind === b.kind && a.source === b.source
}

const weekendDays = computed(() => new Set(dates.value.filter(isWeekend)))
const hasPast = computed(() => Boolean(dates.value.length) && dates.value[0] < (data.value?.today || ''))

// แถวของแต่ละห้อง: คืนที่ติดกันของการเข้าพักเดียวกันรวมเป็นแถบเดียว ช่องว่างเป็นช่องละคืน
// คำนวณครั้งเดียวต่อการโหลด ไม่ต้องไล่หาขอบเขตซ้ำทุกช่องตอนวาด
const segments = computed(() => {
  const list = dates.value
  const todayIndex = list.indexOf(data.value?.today || '')
  const map = new Map()
  rooms.value.forEach((room) => {
    const row = []
    let i = 0
    while (i < list.length) {
      const cell = cellOf(room, list[i])
      let end = i
      if (cell) {
        while (end < list.length - 1 && sameStay(cell, cellOf(room, list[end + 1]))) end += 1
      }
      const span = end - i + 1
      row.push({
        day: list[i],
        index: i,
        span,
        cell,
        weekend: !cell && weekendDays.value.has(list[i]),
        // ตำแหน่งเส้นวันนี้ภายในแถบ (ค่าว่าง = วันนี้ไม่อยู่ในแถบนี้)
        todayLeft: todayIndex >= i && todayIndex <= end ? `${((todayIndex - i) / span) * 100}%` : '',
      })
      i = end + 1
    }
    map.set(room.roomNo, row)
  })
  return map
})

// ห้องว่างต่อวัน นับจากห้องที่กรองอยู่ เฉพาะวันนี้เป็นต้นไป (ย้อนหลังเป็นประวัติ ไม่ใช่ห้องขาย)
const freeByDay = computed(() => {
  const today = data.value?.today || ''
  return dates.value.map((day) => (
    day < today ? null : visibleRooms.value.reduce((n, room) => n + (cellOf(room, day) ? 0 : 1), 0)
  ))
})
const showFree = computed(() => Boolean(data.value) && !data.value.forecastError
  && freeByDay.value.some((n) => n !== null))

// แถบหลายคืน: หาคืนที่เมาส์ชี้จากตำแหน่งในช่อง
function indexAtPoint(seg, box, clientX) {
  if (seg.span === 1) return seg.index
  const offset = Math.floor(((clientX - box.left) / box.width) * seg.span)
  return seg.index + Math.min(seg.span - 1, Math.max(0, offset))
}

function onCellClick(room, seg, event) {
  if (!seg.cell) {
    // ช่องว่างตั้งแต่วันนี้ = จองใหม่ (ปิดการขายยังมีในฟอร์มจองใหม่)
    if (seg.day >= (data.value?.today || '')) openNewBooking(room, seg.day)
    return
  }
  const index = indexAtPoint(seg, event.currentTarget.getBoundingClientRect(), event.clientX)
  openDetail(room, dates.value[index])
}

// ---- ลากย้าย: เหลือง = ย้ายห้อง/วัน (Sp_Transfer_Resv), ชมพู = ย้ายห้องอย่างเดียวแบบ Front Desk (Sp_TransferRoom) ----
function canDrag(seg) {
  return ['booked', 'inhouse'].includes(seg.cell?.kind) && seg.cell.source !== 'folio'
    && /^\d+$/.test(String(seg.cell.resvNo || '')) && !saving.value && !loading.value
}

function isInhouseDrag(moving) {
  return moving?.cell?.kind === 'inhouse'
}

function endDrag() {
  dragData = null
  drag.value = null
  dropAt.value = null
}

function onDragStart(room, seg, event) {
  if (!canDrag(seg)) {
    event.preventDefault()
    return
  }
  const box = event.currentTarget.parentElement.getBoundingClientRect()
  dragData = {
    roomNo: room.roomNo,
    typeName: room.typeName || '',
    index: seg.index,
    span: seg.span,
    // จับแถบที่คืนไหน จะได้วางแล้วคืนนั้นอยู่ใต้เมาส์พอดี
    grab: indexAtPoint(seg, box, event.clientX) - seg.index,
    cell: seg.cell,
  }
  event.dataTransfer.effectAllowed = 'move'
  event.dataTransfer.setData('text/plain', String(seg.cell.resvNo))
  // เปลี่ยนหน้าตาแถบหลังเริ่มลากแล้ว ถ้าแก้ DOM ระหว่าง dragstart เบราว์เซอร์อาจยกเลิกการลาก
  setTimeout(() => { if (dragData) drag.value = dragData }, 0)
}

function dropCheck(room, start, moving) {
  const list = dates.value
  const today = data.value?.today || bangkokToday()
  const sameRoom = room.roomNo === moving.roomNo
  // แขกเช็คอินแล้ว (ชมพู) ย้ายได้แค่ห้อง วันเดิม — แบบ Front Desk Room Status
  const pinned = isInhouseDrag(moving) ? moving.index : start
  if (isInhouseDrag(moving) && sameRoom) return { ok: false, reason: '' }
  if (sameRoom && pinned === moving.index) return { ok: false, reason: '' }
  if (pinned < 0) return { ok: false, reason: 'เลยช่วงวันที่ที่แสดงอยู่ เลื่อนช่วงวันแล้วลองใหม่' }
  if (!isInhouseDrag(moving) && pinned !== moving.index && list[pinned] < today) {
    return { ok: false, reason: 'ย้ายไปวันที่ผ่านมาแล้วไม่ได้' }
  }
  for (let i = pinned; i < pinned + moving.span && i < list.length; i += 1) {
    const cell = cellOf(room, list[i])
    if (cell && !(sameRoom && sameStay(cell, moving.cell))) {
      return { ok: false, reason: `ห้อง ${room.roomNo} ไม่ว่างวันที่ ${formatDate(list[i])}` }
    }
  }
  return { ok: true, reason: '', start: pinned }
}

function onDragOver(room, seg, event) {
  if (!dragData) return
  event.preventDefault()
  event.dataTransfer.dropEffect = 'move'
  // ชมพู: ตรึงตำแหน่งวันเดิม ไฮไลต์เฉพาะห้องปลายทาง
  const raw = isInhouseDrag(dragData)
    ? dragData.index
    : indexAtPoint(seg, event.currentTarget.getBoundingClientRect(), event.clientX) - dragData.grab
  const check = dropCheck(room, raw, dragData)
  const start = check.start ?? raw
  const current = dropAt.value
  if (current && current.roomNo === room.roomNo && current.start === start && current.ok === check.ok) return
  dropAt.value = { roomNo: room.roomNo, start, span: dragData.span, ok: check.ok }
}

function dropClass(room, seg) {
  const at = dropAt.value
  if (!at || at.roomNo !== room.roomNo) return ''
  if (seg.index + seg.span <= at.start || seg.index >= at.start + at.span) return ''
  return at.ok ? 'drop-ok' : 'drop-bad'
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ))
}

async function onDrop(room, seg, event) {
  const moving = dragData
  if (!moving) return
  event.preventDefault()
  const raw = isInhouseDrag(moving)
    ? moving.index
    : indexAtPoint(seg, event.currentTarget.getBoundingClientRect(), event.clientX) - moving.grab
  endDrag()
  const check = dropCheck(room, raw, moving)
  if (!check.ok) {
    if (check.reason) Swal.fire({ icon: 'warning', title: 'ย้ายไม่ได้', text: check.reason, confirmButtonColor: '#001529' })
    return
  }
  const start = check.start ?? raw
  await confirmMove(moving, room, start - moving.index)
}

async function confirmMove(moving, room, shift) {
  if (saving.value) return
  const base = `/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar`
  const resvNo = moving.cell.resvNo
  const inhouse = isInhouseDrag(moving)
  saving.value = true
  try {
    // ใช้วันเข้าพักจริงของการจอง ไม่ใช่วันแรกที่เห็นในตาราง (แถบอาจเริ่มก่อนหรือยาวเกินช่วงที่แสดง)
    const { data: info } = await api.get(`${base}/checkin`, { params: { resvNo, roomNo: moving.roomNo } })
    if (!info?.arrival || !info?.departure) throw new Error('การจองนี้ยังไม่มีวันที่เข้าพักหรือวันที่ออก')
    // ชมพู: ย้ายห้องอย่างเดียววันเดิม / เหลือง: เลื่อนวันได้ตามที่ลาก
    const dayShift = inhouse ? 0 : shift
    const newArrival = addDays(info.arrival, dayShift)
    const newDeparture = addDays(info.departure, dayShift)
    const typeNote = (room.typeName || '') !== moving.typeName
      ? `<p style="color:#8a4b00">ประเภทห้องเปลี่ยนจาก ${escapeHtml(moving.typeName || '-')} เป็น ${escapeHtml(room.typeName || '-')}</p>`
      : ''
    let remark = ''
    if (inhouse) {
      // บังคับเหตุผลเหมือน Front Desk Transfer Room (Reason_Config ResGroup=2)
      let reasons = []
      try {
        const { data: body } = await api.get(`${base}/transfer-reasons`)
        reasons = (body?.reasons || []).map((row) => row.name).filter(Boolean)
      } catch { /* ใช้พิมพ์เอง */ }
      const answer = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันย้ายห้อง?',
        html: `<p><b>${escapeHtml(info.guest || moving.cell.guest)}</b> · เลขจอง ${escapeHtml(resvNo)}</p>`
          + `<p>จากห้อง <b>${escapeHtml(moving.roomNo)}</b><br>ไปห้อง <b>${escapeHtml(room.roomNo)}</b>`
          + ` · คงวันเข้าพัก ${formatDate(info.arrival)} → ${formatDate(info.departure)}</p>${typeNote}`
          + '<p style="color:#5c6f86;font-size:13px">ย้ายแบบ Front Desk Room Status · ต้องระบุเหตุผล</p>',
        input: 'text',
        inputLabel: 'เหตุผลในการย้าย *',
        inputPlaceholder: reasons.length ? 'พิมพ์หรือเลือกจากรายการ' : 'เช่น Guest Request',
        inputAttributes: { maxlength: 32, list: 'pms-transfer-reasons', autocomplete: 'off' },
        inputValidator: (value) => {
          if (!String(value || '').trim()) return 'กรุณากรอกเหตุผลในการย้ายห้อง'
          if (String(value).trim().length > 32) return 'เหตุผลยาวเกิน 32 ตัวอักษร'
          return null
        },
        showCancelButton: true,
        confirmButtonText: 'ย้าย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#001529',
        didOpen: () => {
          if (!reasons.length) return
          const list = document.createElement('datalist')
          list.id = 'pms-transfer-reasons'
          reasons.forEach((name) => {
            const option = document.createElement('option')
            option.value = name
            list.appendChild(option)
          })
          Swal.getPopup()?.appendChild(list)
        },
      })
      if (!answer.isConfirmed) return
      remark = String(answer.value || '').trim()
    } else {
      const answer = await Swal.fire({
        icon: 'question',
        title: 'ยืนยันการย้ายการจอง?',
        html: `<p><b>${escapeHtml(info.guest || moving.cell.guest)}</b> · เลขจอง ${escapeHtml(resvNo)}</p>`
          + `<p>จากห้อง <b>${escapeHtml(moving.roomNo)}</b> (${formatDate(info.arrival)} → ${formatDate(info.departure)})<br>`
          + `ไปห้อง <b>${escapeHtml(room.roomNo)}</b> (${formatDate(newArrival)} → ${formatDate(newDeparture)})</p>${typeNote}`,
        showCancelButton: true,
        confirmButtonText: 'ย้าย',
        cancelButtonText: 'ยกเลิก',
        confirmButtonColor: '#001529',
      })
      if (!answer.isConfirmed) return
    }
    await api.post(`${base}/move`, {
      resvNo,
      roomNo: moving.roomNo,
      newRoomNo: room.roomNo,
      newArrival,
      userId: userId(),
      remark,
    })
    await load()
    Swal.fire({
      icon: 'success',
      title: `ย้ายไปห้อง ${room.roomNo} แล้ว`,
      text: inhouse
        ? `${formatDate(info.arrival)} → ${formatDate(info.departure)}`
        : `${formatDate(newArrival)} → ${formatDate(newDeparture)}`,
      confirmButtonColor: '#001529',
    })
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ย้ายไม่สำเร็จ', text: err?.response?.data?.error || err?.message || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

function shiftRange(direction) {
  bgn.value = addDays(bgn.value || bangkokToday(), direction * Number(days.value))
  load()
}

// วันนี้อยู่ในช่วงที่โหลดแล้ว = เลื่อนไปหา ไม่อยู่ = โหลดช่วงใหม่ที่เริ่มวันนี้
function goToday() {
  const today = data.value?.today || bangkokToday()
  const head = scroller.value?.querySelector('thead th.today')
  if (!dates.value.includes(today) || !head) {
    bgn.value = today
    load()
    return
  }
  const box = scroller.value
  const sticky = box.querySelector('thead .sticky-room')?.offsetWidth || 0
  const left = box.scrollLeft + head.getBoundingClientRect().left - box.getBoundingClientRect().left - sticky
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  box.scrollTo({ left: Math.max(0, left), behavior: calm ? 'auto' : 'smooth' })
}

function openDetail(room, day) {
  const cell = cellOf(room, day)
  if (!cell) return
  if (cell.kind === 'ooo') {
    release.value = {
      roomNo: room.roomNo,
      resvNo: cell.resvNo,
      guest: cell.guest,
      ref: 'OpenSale',
    }
    return
  }
  detail.value = { roomNo: room.roomNo, roomType: room.typeName, day, ...cell }
  panel.value = 'summary'
  folio.value = null
  checkin.value = null
  checkinError.value = ''
  checkinTried.value = false
  if (hasResv.value) loadCheckin()
}

function closeDrawer() {
  if (saving.value) return
  detail.value = null
  folio.value = null
  checkin.value = null
  checkinError.value = ''
  checkinLoading.value = false
  newBooking.value = null
  newBookingLoading.value = false
  newTried.value = false
  panel.value = 'summary'
}

async function openNewBooking(room, day) {
  if (saving.value || newBookingLoading.value) return
  if (day < (data.value?.today || '')) return
  detail.value = {
    roomNo: room.roomNo,
    roomType: room.typeName,
    day,
    kind: 'new',
    guest: '',
    resvNo: '',
  }
  panel.value = 'new'
  newBooking.value = null
  newBookingLoading.value = true
  newTried.value = false
  newForm.value = {}
  try {
    const { data: body } = await api.get(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/new-booking`, {
      params: { roomNo: room.roomNo, arrival: day },
    })
    newBooking.value = body
    const form = {}
    ;(body.fields || []).forEach((field) => {
      form[field.key] = field.type === 'time' && field.value
        ? String(field.value).slice(0, 5)
        : field.value
    })
    newForm.value = form
  } catch (err) {
    detail.value = null
    panel.value = 'summary'
    Swal.fire({ icon: 'error', title: 'เปิดฟอร์มจองใหม่ไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    newBookingLoading.value = false
  }
}

function newValue(field) {
  const value = newForm.value[field.key]
  if (field.type === 'number') return Math.floor(Number(value))
  if (field.type === 'money') return Number(value)
  if (field.type === 'time') return normalizeTime(value)
  return String(value ?? '').trim()
}

function newInvalid(field) {
  const value = newValue(field)
  if (field.type === 'number') {
    return Number.isInteger(value) && value >= field.min && value <= 99 ? '' : `ใส่ได้ ${field.min}–99`
  }
  if (field.type === 'money') {
    return Number.isFinite(value) && value >= 0 ? '' : 'ต้องไม่ติดลบ'
  }
  if (field.type === 'date') {
    if (!value && field.required) return 'ห้ามเว้นว่าง'
    return !value || /^\d{4}-\d{2}-\d{2}$/.test(value) ? '' : 'รูปแบบวันที่ไม่ถูกต้อง'
  }
  if (field.type === 'time') {
    return !value || /^\d{1,2}:\d{2}(:\d{2})?$/.test(value) ? '' : 'ใช้รูปแบบ ชม:นาที'
  }
  return !value && field.required ? 'ห้ามเว้นว่าง' : ''
}

async function saveNewBooking() {
  if (!newBooking.value || !detail.value || saving.value) return
  newTried.value = true
  const fields = newBooking.value.fields || []
  if (fields.some(newInvalid)) return
  const values = {}
  fields.forEach((field) => { values[field.key] = newValue(field) })
  if (values.departure && values.arrival && values.departure <= values.arrival) {
    Swal.fire({ icon: 'warning', title: 'วันเช็คเอาต์ต้องหลังวันเช็คอิน', confirmButtonColor: '#001529' })
    return
  }
  saving.value = true
  try {
    const { data: body } = await api.post(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/new-booking`, {
      userId: userId(),
      values,
    })
    saving.value = false
    closeDrawer()
    await load()
    const room = rooms.value.find((item) => item.roomNo === (body.roomNo || values.roomNo))
    const day = body.arrival || values.arrival
    if (room && cellOf(room, day)) openDetail(room, day)
    Swal.fire({
      icon: 'success',
      title: `จองห้อง ${body.roomNo} แล้ว`,
      text: `เลขจอง ${body.resvNo}${body.guest ? ` · ${body.guest}` : ''}`,
      timer: 2200,
      showConfirmButton: false,
    })
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'จองไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

function openStopFromNew() {
  if (!detail.value || detail.value.kind !== 'new') return
  const roomNo = detail.value.roomNo
  const day = newForm.value.arrival || detail.value.day
  const room = rooms.value.find((item) => item.roomNo === roomNo) || { roomNo }
  closeDrawer()
  openStop(room, day)
}

function onKeydown(event) {
  if (event.key === 'Escape' && detail.value && !stopSale.value && !release.value) closeDrawer()
}

function fieldEmpty(field) {
  const value = checkinForm.value.fill[field.key]
  return field.type === 'number' ? !(Number(value) >= 1) : !String(value ?? '').trim()
}

async function loadCheckin() {
  const target = detail.value
  if (!target) return
  checkinLoading.value = true
  checkinError.value = ''
  try {
    const { data: body } = await api.get(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/checkin`, {
      params: { resvNo: target.resvNo, roomNo: target.roomNo },
    })
    if (detail.value !== target) return
    checkin.value = body
    const fill = {}
    ;(body.missing || []).forEach((field) => {
      const known = field.type !== 'select' || !field.options?.length
        || field.options.some((option) => option.code === field.value)
      fill[field.key] = known ? (field.value ?? '') : ''
    })
    checkinForm.value = {
      fill,
      paidBy: body.paidBy?.value || '',
      depositAmount: Number(body.paidBy?.amount) || 0,
      reference: body.paidBy?.reference || '',
      keyAmount: Number(body.paidBy?.keyAmount) || 0,
    }
  } catch (err) {
    if (detail.value === target) checkinError.value = err?.response?.data?.error || 'โหลดข้อมูลการจองไม่สำเร็จ'
  } finally {
    if (detail.value === target) checkinLoading.value = false
  }
}

function openCheckin() {
  if (!checkin.value?.canCheckIn) return
  checkinTried.value = false
  panel.value = 'checkin'
}

// ---- แก้ไขข้อมูลการจอง (สีเหลืองและสีชมพู) ----
function openEdit() {
  if (!canEdit.value) return
  const form = {}
  checkin.value.edit.fields.forEach((field) => {
    // input type=time ใช้ ชม:นาที ส่วนค่าจาก PMS เป็น ชม:นาที:วินาที
    form[field.key] = field.type === 'time' && field.value
      ? String(field.value).slice(0, 5)
      : field.value
  })
  editForm.value = form
  editTried.value = false
  panel.value = 'edit'
}

function normalizeTime(value) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}:${match[3] || '00'}`
}

function editValue(field) {
  const value = editForm.value[field.key]
  if (field.type === 'number') return Math.floor(Number(value))
  if (field.type === 'money') return Number(value)
  if (field.type === 'time') return normalizeTime(value)
  return String(value ?? '').trim()
}

function editDirty(field) {
  if (field.locked) return false
  if (field.type === 'money') return Number(editForm.value[field.key]) !== Number(field.value)
  if (field.type === 'number') return Number(editForm.value[field.key]) !== Number(field.value)
  if (field.type === 'time') return normalizeTime(editForm.value[field.key]) !== normalizeTime(field.value)
  return String(editForm.value[field.key] ?? '').trim() !== String(field.value ?? '').trim()
}

// ตรวจเฉพาะช่องที่แก้ ช่องที่ไม่ได้แตะไม่บังคับ (ตรงกับฝั่งเซิร์ฟเวอร์)
function editInvalid(field) {
  if (!editDirty(field)) return ''
  const value = editValue(field)
  if (field.type === 'number') {
    return Number.isInteger(value) && value >= field.min && value <= 99 ? '' : `ใส่ได้ ${field.min}–99`
  }
  if (field.type === 'money') {
    return Number.isFinite(value) && value >= 0 ? '' : 'ต้องไม่ติดลบ'
  }
  if (field.type === 'date') {
    if (!value && field.required) return 'ห้ามเว้นว่าง'
    return !value || /^\d{4}-\d{2}-\d{2}$/.test(value) ? '' : 'รูปแบบวันที่ไม่ถูกต้อง'
  }
  if (field.type === 'time') {
    return !value || /^\d{1,2}:\d{2}(:\d{2})?$/.test(value) ? '' : 'ใช้รูปแบบ ชม:นาที'
  }
  return !value && field.required ? 'ห้ามเว้นว่าง' : ''
}

const editChanged = computed(() => (checkin.value?.edit?.fields || []).some(editDirty))
const editSections = computed(() => {
  const fields = checkin.value?.edit?.fields || []
  return editGroups
    .map((group) => ({ ...group, fields: fields.filter((field) => field.group === group.key) }))
    .filter((group) => group.fields.length)
})
const newSections = computed(() => {
  const fields = newBooking.value?.fields || []
  return editGroups
    .map((group) => ({ ...group, fields: fields.filter((field) => field.group === group.key) }))
    .filter((group) => group.fields.length)
})

async function saveEdit() {
  if (!checkin.value?.edit || !detail.value || saving.value) return
  editTried.value = true
  const fields = checkin.value.edit.fields
  if (fields.some(editInvalid)) return
  if (!editChanged.value) {
    panel.value = 'summary'
    return
  }
  const values = {}
  fields.filter(editDirty).forEach((field) => { values[field.key] = editValue(field) })
  const target = detail.value
  saving.value = true
  try {
    const { data: body } = await api.post(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/booking`, {
      resvNo: target.resvNo,
      roomNo: target.roomNo,
      userId: userId(),
      values,
    })
    saving.value = false
    panel.value = 'summary'
    await load()
    const nextRoom = body?.roomNo || target.roomNo
    const nextDay = body?.arrival || target.day
    const room = rooms.value.find((item) => item.roomNo === nextRoom)
    if (room && cellOf(room, nextDay)) openDetail(room, nextDay)
    else {
      detail.value = { ...target, roomNo: nextRoom, day: nextDay }
      await loadCheckin()
    }
    Swal.fire({ icon: 'success', title: 'บันทึกข้อมูลแล้ว', timer: 1600, showConfirmButton: false })
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

async function confirmCheckin() {
  if (!checkin.value || !detail.value || saving.value) return
  const form = checkinForm.value
  checkinTried.value = true
  if ((checkin.value.missing || []).some(fieldEmpty)) return
  if (Number(form.depositAmount) > 0 && !form.paidBy) return
  const roomNo = detail.value.roomNo
  saving.value = true
  try {
    const { data: body } = await api.post(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/checkin`, {
      resvNo: detail.value.resvNo,
      roomNo,
      userId: userId(),
      fill: form.fill,
      paidBy: form.paidBy,
      depositAmount: form.paidBy ? Number(form.depositAmount) || 0 : 0,
      reference: form.reference,
      keyAmount: Number(form.keyAmount) || 0,
    })
    await load()
    saving.value = false
    // เปิดห้องเดิมต่อในสถานะเข้าพัก จะได้ลงรายการต่อได้ทันที
    const room = rooms.value.find((item) => item.roomNo === roomNo)
    const today = data.value?.today
    if (room && cellOf(room, today)?.kind === 'inhouse') openDetail(room, today)
    else closeDrawer()
    const warnings = body?.warnings || []
    Swal.fire({
      icon: warnings.length ? 'warning' : 'success',
      title: `เช็คอินห้อง ${roomNo} แล้ว`,
      text: warnings.join(' · '),
      confirmButtonColor: '#001529',
    })
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เช็คอินไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

function openStop(room, day) {
  if (day < bangkokToday() || cellOf(room, day)) return
  stopSale.value = {
    roomNo: room.roomNo,
    dateBegin: day,
    dateEnd: day,
    remark: 'StopSale',
  }
}

async function load() {
  loading.value = true
  errorText.value = ''
  try {
    const { data: body } = await api.get(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar`, {
      params: { bgn: bgn.value, end: endDate.value },
    })
    data.value = body
    if (body.bgnDate) bgn.value = body.bgnDate
    if (!typeNames.value.includes(typeFilter.value)) typeFilter.value = ''
  } catch (err) {
    errorText.value = err?.response?.data?.error || 'โหลดปฏิทินไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}

function userId() {
  return String(auth.user?.username || auth.user?.name || auth.user?.id || 'webadmin').slice(0, 20)
}

const postItems = computed(() => {
  if (!folio.value) return []
  return postKind.value === '1' ? (folio.value.rebates || []) : (folio.value.charges || [])
})

function pickPostItem(list) {
  const first = list?.[0]
  chargeForm.value.trnCode = first?.code || ''
  chargeForm.value.amount = Number(first?.price) || 0
  chargeForm.value.quantity = 1
}

function setPostKind(kind) {
  postKind.value = String(kind)
  const list = String(kind) === '1' ? (folio.value?.rebates || []) : (folio.value?.charges || [])
  pickPostItem(list)
}

function syncChargeAmount() {
  const item = postItems.value.find((row) => row.code === chargeForm.value.trnCode)
  const price = Number(item?.price) || 0
  if (price > 0) chargeForm.value.amount = Math.round(price * (Number(chargeForm.value.quantity) || 1) * 100) / 100
}

async function openCheckout() {
  if (!detail.value || folioLoading.value) return
  if (detail.value.kind !== 'inhouse' || detail.value.source === 'folio') return
  const target = detail.value
  const roomNo = target.roomNo
  folioLoading.value = true
  folio.value = null
  folioTab.value = 'charge'
  postKind.value = '0'
  panel.value = 'folio'
  try {
    const { data: body } = await api.get(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/folio`, {
      params: { roomNo },
    })
    if (detail.value !== target) return
    chargeForm.value = { trnCode: body.charges?.[0]?.code || '', quantity: 1, amount: body.charges?.[0]?.price || 0, remark: '' }
    paymentForm.value = { trnCode: body.payments?.[0]?.code || '', amount: Math.max(0, Number(body.balance?.amount) || 0), company: body.companies?.[0]?.code || '', remark: '' }
    applyFolio(body)
  } catch (err) {
    if (detail.value === target) panel.value = 'summary'
    Swal.fire({ icon: 'error', title: 'เปิดรายการห้องไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    folioLoading.value = false
  }
}

function applyFolio(body) {
  folio.value = body
  paymentForm.value.amount = Math.max(0, Number(body.balance?.amount) || 0)
  if (Number(body.balance?.amount) > 0) folioTab.value = 'payment'
  else if (body.overpaid) folioTab.value = 'payment'
}

async function refreshFolio(roomNo) {
  const { data: body } = await api.get(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/folio`, {
    params: { roomNo },
  })
  applyFolio(body)
}

function fillPayBalance() {
  paymentForm.value.amount = Math.max(0, Number(folio.value?.balance?.amount) || 0)
  folioTab.value = 'payment'
}

async function postCharge() {
  if (!folio.value || saving.value) return
  saving.value = true
  try {
    const { data: body } = await api.post(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/folio/charge`, {
      roomNo: folio.value.roomNo,
      userId: userId(),
      ...chargeForm.value,
    })
    chargeForm.value.remark = ''
    applyFolio(body)
  } catch (err) {
    Swal.fire({ icon: 'error', title: postKind.value === '1' ? 'โพสต์รีเบทไม่สำเร็จ' : 'โพสต์รายการไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

async function postPayment() {
  if (!folio.value || saving.value) return
  saving.value = true
  try {
    const { data: body } = await api.post(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/folio/payment`, {
      roomNo: folio.value.roomNo,
      userId: userId(),
      ...paymentForm.value,
    })
    paymentForm.value.remark = ''
    applyFolio(body)
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เพิ่มรายการชำระไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

async function voidLine(line) {
  if (!folio.value || saving.value || !line?.canVoid) return
  const ask = await Swal.fire({
    icon: 'warning',
    title: 'ยกเลิกรายการนี้?',
    html: `<b>${line.name}</b><br>฿${baht(line.amount)}`,
    input: 'text',
    inputLabel: 'เหตุผล',
    inputValue: 'ยกเลิกผิดรายการ',
    inputAttributes: { maxlength: 50 },
    showCancelButton: true,
    confirmButtonText: 'ยกเลิกรายการ',
    cancelButtonText: 'ปิด',
    confirmButtonColor: '#b42318',
  })
  if (!ask.isConfirmed) return
  saving.value = true
  try {
    const { data: body } = await api.post(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/folio/void`, {
      roomNo: folio.value.roomNo,
      userId: userId(),
      recId: line.recId,
      reason: ask.value || 'ยกเลิกผิดรายการ',
    })
    applyFolio(body)
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ยกเลิกรายการไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

async function confirmCheckout() {
  if (!folio.value || saving.value) return
  if (!folio.value.canCheckout) {
    const amount = Number(folio.value.balance?.amount) || 0
    Swal.fire({
      icon: 'warning',
      title: 'ยังเช็คเอาต์ไม่ได้',
      text: amount > 0
        ? `ยังมียอดค้าง ฿${baht(amount)} ให้รับชำระให้ครบก่อน`
        : `มียอดเกินชำระ ฿${baht(Math.abs(amount))} ให้ยกเลิกรายการชำระส่วนเกินก่อน`,
      confirmButtonColor: '#001529',
    })
    return
  }
  const ask = await Swal.fire({
    icon: 'question',
    title: `เช็คเอาต์ห้อง ${folio.value.roomNo}?`,
    text: folio.value.guestName || 'ยอดโฟลิโอเป็น 0 แล้ว',
    showCancelButton: true,
    confirmButtonText: 'ยืนยันเช็คเอาต์',
    cancelButtonText: 'ยกเลิก',
    confirmButtonColor: '#001529',
  })
  if (!ask.isConfirmed) return
  saving.value = true
  try {
    await api.post(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/folio/checkout`, {
      roomNo: folio.value.roomNo,
      userId: userId(),
    })
    const roomNo = folio.value.roomNo
    saving.value = false
    closeDrawer()
    await load()
    Swal.fire({ icon: 'success', title: `เช็คเอาต์ห้อง ${roomNo} แล้ว`, confirmButtonColor: '#001529' })
  } catch (err) {
    const roomNo = folio.value?.roomNo
    Swal.fire({ icon: 'warning', title: 'ยังเช็คเอาต์ไม่ได้', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
    if (roomNo) {
      try { await refreshFolio(roomNo) } catch { /* keep current folio */ }
    }
  } finally {
    saving.value = false
  }
}

async function confirmStop() {
  if (!stopSale.value || saving.value) return
  if (stopSale.value.dateEnd < stopSale.value.dateBegin) stopSale.value.dateEnd = stopSale.value.dateBegin
  saving.value = true
  try {
    await api.post(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/stop-sale`, {
      ...stopSale.value,
      userId: userId(),
    })
    stopSale.value = null
    await load()
    Swal.fire({ icon: 'success', title: 'ปิดการขายแล้ว', confirmButtonColor: '#001529' })
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ปิดการขายไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

async function confirmRelease() {
  if (!release.value || saving.value) return
  saving.value = true
  try {
    await api.post(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/release`, {
      roomNo: release.value.roomNo,
      resvNo: release.value.resvNo,
      ref: release.value.ref,
      bussDate: data.value?.sysDate || bangkokToday(),
      userId: userId(),
    })
    release.value = null
    await load()
    Swal.fire({ icon: 'success', title: 'ปลดห้องแล้ว', confirmButtonColor: '#001529' })
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'ปลดห้องไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

function toggleGroup(type) {
  hidden.value = hidden.value.includes(type)
    ? hidden.value.filter((item) => item !== type)
    : [...hidden.value, type]
}

onMounted(() => {
  load()
  window.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
watch(() => props.hotelSlug, () => {
  closeDrawer()
  load()
})
</script>

<template>
  <section class="pms-cal" aria-label="ปฏิทินการจอง">
    <div class="cal-toolbar">
      <div>
        <h2>ปฏิทินการจอง <span>{{ visibleRooms.length }} ห้อง</span></h2>
        <p>{{ rangeLabel }}<template v-if="dates.length"> · {{ dates.length }} วัน</template><template v-if="hasPast"> · ก่อนวันนี้มาจาก folio history</template></p>
      </div>
      <div class="days-field">
        <label for="pmsCalDays">จำนวนวัน (1–{{ MAX_DAYS }})</label>
        <div class="days-row">
          <input
            id="pmsCalDays"
            :value="days"
            type="number"
            min="1"
            :max="MAX_DAYS"
            step="1"
            inputmode="numeric"
            :disabled="loading"
            @change="applyDays($event.target.value, $event.target)"
          >
          <button
            v-for="n in dayChoices"
            :key="n"
            type="button"
            :class="{ on: days === n }"
            :disabled="loading"
            :aria-pressed="days === n"
            :title="`ดู ${n} วัน`"
            @click="applyDays(n)"
          >{{ n }}</button>
        </div>
      </div>
      <div class="days-field">
        <label for="pmsCalBgn">ตั้งแต่วันที่</label>
        <div class="days-row">
          <button type="button" aria-label="ช่วงก่อนหน้า" title="ช่วงก่อนหน้า" :disabled="loading" @click="shiftRange(-1)">‹</button>
          <input id="pmsCalBgn" v-model="bgn" type="date" :disabled="loading" @change="load">
          <button type="button" aria-label="ช่วงถัดไป" title="ช่วงถัดไป" :disabled="loading" @click="shiftRange(1)">›</button>
          <button type="button" :disabled="loading" @click="goToday">วันนี้</button>
        </div>
      </div>
      <label class="grow">ค้นหาห้อง
        <input v-model.trim="roomSearch" type="search" placeholder="เลขห้อง / ประเภท">
      </label>
      <label>ประเภท
        <select v-model="typeFilter">
          <option value="">ทุกประเภท</option>
          <option v-for="type in typeNames" :key="type" :value="type">{{ type }}</option>
        </select>
      </label>
      <button type="button" :class="{ on: grouped }" @click="grouped = !grouped">{{ grouped ? 'แยกประเภท' : 'ทุกห้อง' }}</button>
    </div>

    <p v-if="errorText" class="cal-error">{{ errorText }} <button type="button" @click="load">ลองอีกครั้ง</button></p>
    <p v-if="data?.forecastError" class="cal-error">ตารางวันนี้ไปข้างหน้า: {{ data.forecastError }}</p>
    <p v-if="data?.historyError" class="cal-error">ปฏิทินย้อนหลัง: {{ data.historyError }}</p>

    <div ref="scroller" class="cal-scroll" :aria-busy="loading">
      <table v-if="visibleRooms.length">
        <thead>
          <tr class="head-days">
            <th class="sticky-room">ห้อง</th>
            <th
              v-for="(day, index) in dates"
              :key="day"
              :class="{ weekend: weekendDays.has(day), today: day === data?.today }"
            >
              <small class="month">{{ monthLabel(day, index) }}</small>
              <b>{{ day.slice(8) }}</b>
              <small>{{ weekday(day) }}</small>
            </th>
          </tr>
          <tr v-if="showFree" class="head-free">
            <th class="sticky-room">ห้องว่าง</th>
            <th
              v-for="(day, index) in dates"
              :key="day"
              :class="{ today: day === data?.today, full: freeByDay[index] === 0 }"
            >{{ freeByDay[index] === null ? '' : freeByDay[index] }}</th>
          </tr>
        </thead>
        <tbody v-for="group in groups" :key="group.type">
          <tr v-if="grouped" class="group-row">
            <th :colspan="dates.length + 1">
              <button type="button" @click="toggleGroup(group.type)">{{ hidden.includes(group.type) ? '▸' : '▾' }} {{ group.type }} · {{ group.rooms.length }}</button>
            </th>
          </tr>
          <tr v-for="room in group.rooms" v-show="!grouped || !hidden.includes(group.type)" :key="room.roomNo">
            <th class="sticky-room" :title="room.typeName">
              <b>{{ room.roomNo }}</b>
              <small>{{ (room.typeName || '').split('/')[0] }}</small>
            </th>
            <td
              v-for="seg in segments.get(room.roomNo)"
              :key="seg.day"
              :colspan="seg.span"
              :class="[seg.cell ? 'stay' : 'empty', dropClass(room, seg), { weekend: seg.weekend, dragging: drag && drag.roomNo === room.roomNo && drag.index === seg.index }]"
              :title="seg.cell ? seg.cell.guest : (seg.day >= (data?.today || '') ? 'ว่าง' : '')"
              @click="onCellClick(room, seg, $event)"
              @dragover="onDragOver(room, seg, $event)"
              @drop="onDrop(room, seg, $event)"
            >
              <div
                v-if="seg.cell"
                class="bar"
                :class="seg.cell.kind"
                :draggable="canDrag(seg)"
                @dragstart="onDragStart(room, seg, $event)"
                @dragend="endDrag"
              >
                <span class="guest">{{ seg.cell.guest }}</span>
              </div>
              <i v-if="seg.todayLeft" class="today-line" :style="{ left: seg.todayLeft }"></i>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-else-if="!loading" class="cal-empty">ไม่มีห้องในช่วงนี้</p>
      <p v-if="loading" class="cal-loading">กำลังโหลดปฏิทิน…</p>
    </div>

    <footer class="cal-legend">
      <span><i class="booked"></i>จองแล้ว</span>
      <span><i class="unconfirmed"></i>รอยืนยัน</span>
      <span><i class="inhouse"></i>เข้าพักแล้ว</span>
      <span><i class="ooo"></i>ปิดใช้งาน</span>
      <span><i class="history"></i>ประวัติ folio</span>
      <small>กดแถบเพื่อดูรายละเอียด แก้ไข เช็คอิน หรือเช็คเอาต์ · กดช่องว่างตั้งแต่วันนี้เพื่อจองใหม่ · ลากเหลืองย้ายห้อง/วัน · ลากชมพูย้ายห้องแบบ Front Desk · กดช่องปิดใช้งานเพื่อปลดห้อง</small>
    </footer>

    <Transition name="drawer">
      <div v-if="detail" class="drawer-wrap" @click.self="closeDrawer">
        <aside class="drawer" role="dialog" aria-modal="true" :aria-label="`ห้อง ${detail.roomNo}`">
          <header class="drawer-head">
            <div>
              <span class="chip" :class="detail.kind">{{ kindLabel[detail.kind] || detail.kind }}</span>
              <h3>ห้อง {{ detail.roomNo }}</h3>
              <p>{{ detail.roomType }}</p>
            </div>
            <button type="button" class="icon-btn" aria-label="ปิด" :disabled="saving" @click="closeDrawer">✕</button>
          </header>

          <div class="drawer-body">
            <section v-if="panel !== 'new'" class="card">
              <p class="guest-name">{{ checkin?.guest || detail.guest || '-' }}</p>
              <dl>
                <template v-if="stay">
                  <div><dt>เช็คอิน</dt><dd>{{ formatDate(stay.arrival) }}</dd></div>
                  <div><dt>เช็คเอาต์</dt><dd>{{ formatDate(stay.departure) }} · {{ stay.nights }} คืน</dd></div>
                </template>
                <div v-else><dt>{{ hasResv && checkinLoading ? 'เช็คอิน – เช็คเอาต์' : 'วันที่' }}</dt><dd>{{ hasResv && checkinLoading ? 'กำลังโหลด…' : formatDate(detail.day) }}</dd></div>
                <div><dt>เลขจอง</dt><dd>{{ detail.resvNo || '-' }}</dd></div>
                <template v-if="checkin">
                  <div><dt>ผู้เข้าพัก</dt><dd>ผู้ใหญ่ {{ checkin.adults }}<template v-if="checkin.children"> · เด็ก {{ checkin.children }}</template></dd></div>
                  <div><dt>ราคาห้อง</dt><dd>฿{{ baht(checkin.rate) }} / คืน</dd></div>
                  <div v-if="checkin.phone"><dt>โทร</dt><dd>{{ checkin.phone }}</dd></div>
                  <div v-if="checkin.agent"><dt>เอเจนต์</dt><dd>{{ checkin.agent }}</dd></div>
                  <div v-if="checkin.memo"><dt>หมายเหตุ</dt><dd>{{ checkin.memo }}</dd></div>
                </template>
              </dl>
            </section>

            <!-- จองใหม่จากช่องว่าง -->
            <template v-if="panel === 'new'">
              <p v-if="newBookingLoading" class="note">กำลังโหลดฟอร์มจองใหม่…</p>
              <template v-else-if="newBooking">
                <p class="note">จองห้อง {{ newBooking.roomNo }} · วันทำการ {{ formatDate(newBooking.sysDate) }} · บันทึกด้วยขั้นตอนเดียวกับ New ของ PMS</p>
                <section v-for="section in newSections" :key="section.key" class="card">
                  <h4>{{ section.label }}</h4>
                  <div class="fields">
                    <label
                      v-for="field in section.fields"
                      :key="field.key"
                      :class="{ wide: field.type === 'textarea' || field.key === 'email' || field.key === 'memo' || field.key === 'memo2', invalid: newTried && newInvalid(field) }"
                    >
                      <span>{{ field.label }}</span>
                      <select v-if="field.type === 'select'" v-model="newForm[field.key]">
                        <option v-if="!field.required || !field.value" value="">ไม่ระบุ</option>
                        <option v-if="field.value && !(field.options || []).some((option) => option.code === field.value)" :value="field.value">{{ field.value }}</option>
                        <option v-for="option in field.options || []" :key="option.code" :value="option.code">{{ option.name }}</option>
                      </select>
                      <input v-else-if="field.type === 'number'" v-model.number="newForm[field.key]" type="number" :min="field.min" max="99" inputmode="numeric">
                      <input v-else-if="field.type === 'money'" v-model.number="newForm[field.key]" type="number" :min="field.min ?? 0" step="0.01" inputmode="decimal">
                      <input v-else-if="field.type === 'date'" v-model="newForm[field.key]" type="date" :min="field.key === 'arrival' || field.key === 'departure' ? data?.today : undefined">
                      <input v-else-if="field.type === 'time'" v-model="newForm[field.key]" type="time" step="60">
                      <textarea v-else-if="field.type === 'textarea'" v-model="newForm[field.key]" rows="3" :maxlength="field.size || 255"></textarea>
                      <input v-else v-model="newForm[field.key]" :type="field.key === 'phone' ? 'tel' : field.key === 'email' ? 'email' : 'text'" :maxlength="field.size || 30">
                      <small v-if="newTried && newInvalid(field)">{{ newInvalid(field) }}</small>
                    </label>
                  </div>
                </section>
                <button type="button" class="btn ghost wide" :disabled="saving" @click="openStopFromNew">ปิดการขายห้องนี้แทน</button>
              </template>
            </template>

            <!-- รายละเอียด -->
            <template v-else-if="panel === 'summary'">
              <p v-if="detail.source === 'folio' || detail.kind === 'history'" class="note">ประวัติเข้าพักจาก folio history ดูได้อย่างเดียว</p>
              <template v-else-if="isBooking">
                <p v-if="checkinLoading" class="note">กำลังโหลดข้อมูลการจอง…</p>
                <p v-else-if="checkinError" class="note warn">{{ checkinError }} <button type="button" class="link" @click="loadCheckin">ลองอีกครั้ง</button></p>
                <p v-else-if="checkin?.blockReason" class="note warn">{{ checkin.blockReason }}</p>
                <p v-else-if="checkin && missingCount" class="note">ยังขาดข้อมูล {{ missingCount }} รายการ ระบบจะให้กรอกเฉพาะส่วนที่ขาดตอนเช็คอิน</p>
                <p v-else-if="checkin" class="note ok">ข้อมูลครบ พร้อมเช็คอิน</p>
              </template>
              <template v-else-if="isInhouse">
                <p class="note">กดเช็คเอาต์เพื่อดูโฟลิโอ โพสต์รายการ รับชำระ ยกเลิกรายการวันทำการนี้ แล้วยืนยันเช็คเอาต์เมื่อยอดเป็น 0</p>
                <p v-if="checkinError" class="note warn">{{ checkinError }} <button type="button" class="link" @click="loadCheckin">ลองอีกครั้ง</button></p>
              </template>
              <p v-if="canEdit === false && checkin?.edit && !checkin.edit.allowed && (isInhouse || !checkin.blockReason)" class="note">แก้ไขจากปฏิทินไม่ได้: {{ checkin.edit.reason }}</p>
            </template>

            <!-- แก้ไขข้อมูลการจอง เท่าที่ PMS แก้ได้ -->
            <template v-else-if="panel === 'edit' && checkin?.edit">
              <p v-if="checkin.checkedIn" class="note">แขกเช็คอินแล้ว ห้อง มัดจำ และ Paid by แก้ไม่ได้เหมือน PMS ส่วนชื่อ วันออก และราคาแก้ได้</p>
              <section v-for="section in editSections" :key="section.key" class="card">
                <h4>{{ section.label }}</h4>
                <div class="fields">
                  <label
                    v-for="field in section.fields"
                    :key="field.key"
                    :class="{ wide: field.type === 'textarea' || field.key === 'email' || field.key === 'memo' || field.key === 'memo2', invalid: editTried && editInvalid(field) }"
                  >
                    <span>{{ field.label }}<template v-if="field.locked"> · ล็อก</template></span>
                    <select v-if="field.type === 'select'" v-model="editForm[field.key]" :disabled="field.locked">
                      <option v-if="!field.required || !field.value" value="">ไม่ระบุ</option>
                      <option v-if="field.value && !(field.options || []).some((option) => option.code === field.value)" :value="field.value">{{ field.value }}</option>
                      <option v-for="option in field.options || []" :key="option.code" :value="option.code">{{ option.name }}</option>
                    </select>
                    <input v-else-if="field.type === 'number'" v-model.number="editForm[field.key]" type="number" :min="field.min" max="99" inputmode="numeric" :disabled="field.locked">
                    <input v-else-if="field.type === 'money'" v-model.number="editForm[field.key]" type="number" :min="field.min ?? 0" step="0.01" inputmode="decimal" :disabled="field.locked">
                    <input v-else-if="field.type === 'date'" v-model="editForm[field.key]" type="date" :disabled="field.locked">
                    <input v-else-if="field.type === 'time'" v-model="editForm[field.key]" type="time" step="60" :disabled="field.locked">
                    <textarea v-else-if="field.type === 'textarea'" v-model="editForm[field.key]" rows="3" :maxlength="field.size || 255" :disabled="field.locked"></textarea>
                    <input v-else v-model="editForm[field.key]" :type="field.key === 'phone' ? 'tel' : field.key === 'email' ? 'email' : 'text'" :maxlength="field.size || 30" :disabled="field.locked">
                    <small v-if="editTried && editInvalid(field)">{{ editInvalid(field) }}</small>
                  </label>
                </div>
              </section>
              <p class="note">บันทึกด้วยขั้นตอนเดียวกับปุ่ม Save ของ PMS · ย้ายห้องเร็ว ๆ ได้ด้วยการลากแถบสีเหลืองในปฏิทิน</p>
            </template>

            <!-- ขั้นเช็คอิน -->
            <template v-else-if="panel === 'checkin' && checkin">
              <section v-if="missingCount" class="card">
                <h4>ข้อมูลที่ยังขาด <span class="count">{{ missingCount }}</span></h4>
                <div class="fields">
                  <label
                    v-for="field in checkin.missing"
                    :key="field.key"
                    :class="{ wide: field.type === 'text', invalid: checkinTried && fieldEmpty(field) }"
                  >
                    <span>{{ field.label }}</span>
                    <select v-if="field.type === 'select' && field.options?.length" v-model="checkinForm.fill[field.key]">
                      <option value="" disabled>เลือก{{ field.label }}</option>
                      <option v-for="option in field.options" :key="option.code" :value="option.code">{{ option.name }}</option>
                    </select>
                    <input v-else-if="field.type === 'number'" v-model.number="checkinForm.fill[field.key]" type="number" min="1" max="99" inputmode="numeric">
                    <input v-else v-model.trim="checkinForm.fill[field.key]" type="text" :maxlength="field.size || 30">
                    <small v-if="checkinTried && fieldEmpty(field)">กรอกช่องนี้ก่อนเช็คอิน</small>
                  </label>
                </div>
              </section>
              <p v-else class="note ok">ข้อมูลการจองครบแล้ว</p>

              <section v-if="!checkin.paidBy?.locked" class="card">
                <h4>Paid by <span class="optional">ไม่บังคับ</span></h4>
                <div class="fields">
                  <label class="wide">
                    <span>วิธีชำระ</span>
                    <select v-model="checkinForm.paidBy">
                      <option value="">ยังไม่รับเงินตอนเช็คอิน</option>
                      <option v-for="option in checkin.paidBy?.options" :key="option.code" :value="option.code">{{ option.name }}</option>
                    </select>
                  </label>
                  <template v-if="checkinForm.paidBy">
                    <label>
                      <span>เงินมัดจำห้อง (บาท)</span>
                      <input v-model.number="checkinForm.depositAmount" type="number" min="0" step="0.01" inputmode="decimal">
                    </label>
                    <label>
                      <span>อ้างอิง</span>
                      <input v-model.trim="checkinForm.reference" type="text" maxlength="16">
                    </label>
                  </template>
                  <label v-if="checkin.paidBy?.keyCode" class="wide">
                    <span>มัดจำคีย์การ์ด (บาท)</span>
                    <input v-model.number="checkinForm.keyAmount" type="number" min="0" step="0.01" inputmode="decimal">
                  </label>
                </div>
              </section>
            </template>

            <!-- ขั้นเช็คเอาต์ เท่าที่แคชเชียร์ PMS ใช้ประจำ -->
            <template v-else-if="panel === 'folio'">
              <p v-if="folioLoading" class="note">กำลังโหลดรายการในห้อง…</p>
              <template v-else-if="folio">
                <section class="card">
                  <h4>{{ folio.guestName || detail?.guest || 'ผู้เข้าพัก' }}</h4>
                  <dl class="meta">
                    <div><dt>เลขจอง</dt><dd>{{ folio.resvNo || '—' }} · โฟลิโอ {{ folio.folioNo }}</dd></div>
                    <div v-if="folio.arrival"><dt>เข้าพัก</dt><dd>{{ formatDate(folio.arrival) }} → {{ formatDate(folio.departure) }}</dd></div>
                    <div v-if="folio.rate != null"><dt>ราคาห้อง</dt><dd>฿{{ baht(folio.rate) }} / คืน</dd></div>
                  </dl>
                </section>

                <section class="card balance" :class="{ settled: folio.canCheckout, over: folio.overpaid }">
                  <span>ยอดคงเหลือ</span>
                  <b>฿{{ baht(folio.balance?.amount) }}</b>
                  <small>เซอร์วิส ฿{{ baht(folio.balance?.service) }} · ภาษี ฿{{ baht(folio.balance?.tax) }}</small>
                  <em v-if="folio.canCheckout">ยอดเป็น 0 พร้อมเช็คเอาต์</em>
                  <em v-else-if="folio.overpaid">เกินชำระ — ยกเลิกรายการชำระส่วนเกินก่อนเช็คเอาต์</em>
                  <em v-else>รับชำระให้ยอดเป็น 0 ก่อนเช็คเอาต์</em>
                  <button
                    v-if="Number(folio.balance?.amount) > 0"
                    type="button"
                    class="btn wide"
                    :disabled="saving"
                    @click="fillPayBalance"
                  >รับชำระยอดคงเหลือ ฿{{ baht(folio.balance?.amount) }}</button>
                </section>

                <section class="card">
                  <h4>รายการในห้อง <span class="count">{{ folio.lines?.length || 0 }}</span></h4>
                  <p v-if="!folio.lines?.length" class="muted">ยังไม่มีรายการในโฟลิโอ</p>
                  <ul v-else class="lines">
                    <li v-for="line in folio.lines" :key="line.recId || `${line.postedAt}-${line.code}-${line.amount}`">
                      <span>
                        {{ line.name }}<template v-if="line.qty > 1"> × {{ line.qty }}</template>
                        <small>{{ line.postedAt }}<template v-if="line.remark && line.remark !== '/'"> · {{ line.remark }}</template></small>
                      </span>
                      <span class="line-actions">
                        <b :class="{ pay: line.amount < 0 }">฿{{ baht(line.amount) }}</b>
                        <button
                          v-if="line.canVoid"
                          type="button"
                          class="link danger"
                          :disabled="saving"
                          @click="voidLine(line)"
                        >ยกเลิก</button>
                      </span>
                    </li>
                  </ul>
                  <p class="muted">ยกเลิกได้เฉพาะรายการวันทำการ {{ formatDate(folio.sysDate) }} เหมือนแคชเชียร์</p>
                </section>

                <section class="card">
                  <div class="tabs" role="tablist">
                    <button type="button" role="tab" :aria-selected="folioTab === 'charge'" :class="{ on: folioTab === 'charge' }" @click="folioTab = 'charge'">โพสต์ / รีเบท</button>
                    <button type="button" role="tab" :aria-selected="folioTab === 'payment'" :class="{ on: folioTab === 'payment' }" @click="folioTab = 'payment'">รับชำระ</button>
                  </div>
                  <form v-if="folioTab === 'charge'" class="fields" @submit.prevent="postCharge">
                    <div class="kind-toggle" role="radiogroup" aria-label="ประเภทโพสต์">
                      <button type="button" role="radio" :aria-checked="postKind === '0'" :class="{ on: postKind === '0' }" @click="setPostKind('0')">Posting</button>
                      <button type="button" role="radio" :aria-checked="postKind === '1'" :class="{ on: postKind === '1' }" @click="setPostKind('1')">Rebate</button>
                    </div>
                    <label class="wide">
                      <span>{{ postKind === '1' ? 'รายการรีเบท' : 'รายการโพสต์' }}</span>
                      <select v-model="chargeForm.trnCode" required @change="syncChargeAmount">
                        <option v-if="!postItems.length" value="" disabled>ไม่มีรายการ</option>
                        <option v-for="item in postItems" :key="item.code" :value="item.code">{{ item.code }} {{ item.name }}</option>
                      </select>
                    </label>
                    <label><span>จำนวน</span><input v-model.number="chargeForm.quantity" type="number" min="1" required inputmode="numeric" @change="syncChargeAmount"></label>
                    <label><span>จำนวนเงิน (บาท)</span><input v-model.number="chargeForm.amount" type="number" min="0" step="0.01" required inputmode="decimal"></label>
                    <label class="wide"><span>หมายเหตุ</span><input v-model="chargeForm.remark" maxlength="50"></label>
                    <button type="submit" class="btn wide" :disabled="saving || !postItems.length">{{ postKind === '1' ? 'โพสต์รีเบท' : 'โพสต์รายการ' }}</button>
                  </form>
                  <form v-else class="fields" @submit.prevent="postPayment">
                    <label class="wide">
                      <span>วิธีชำระ</span>
                      <select v-model="paymentForm.trnCode" required>
                        <option v-if="!folio.payments?.length" value="" disabled>ไม่มีวิธีชำระ</option>
                        <option v-for="item in folio.payments" :key="item.code" :value="item.code">{{ item.code }} {{ item.name }}</option>
                      </select>
                    </label>
                    <label v-if="folio.companies?.length" class="wide">
                      <span>บริษัท</span>
                      <select v-model="paymentForm.company">
                        <option value="">ไม่ระบุ</option>
                        <option v-for="item in folio.companies" :key="item.code" :value="item.code">{{ item.name }}</option>
                      </select>
                    </label>
                    <label>
                      <span>จำนวนเงิน (บาท)</span>
                      <input v-model.number="paymentForm.amount" type="number" min="0" step="0.01" required inputmode="decimal">
                    </label>
                    <label class="wide"><span>หมายเหตุ</span><input v-model="paymentForm.remark" maxlength="50"></label>
                    <button type="button" class="btn ghost wide" :disabled="saving || !(Number(folio.balance?.amount) > 0)" @click="fillPayBalance">ใส่ยอดคงเหลือทั้งหมด</button>
                    <button type="submit" class="btn wide" :disabled="saving">เพิ่มรายการชำระ</button>
                  </form>
                </section>
              </template>
            </template>
          </div>

          <footer class="drawer-foot">
            <template v-if="panel === 'summary'">
              <button type="button" class="btn ghost" @click="closeDrawer">ปิด</button>
              <button v-if="canEdit" type="button" class="btn ghost" @click="openEdit">แก้ไข</button>
              <button v-if="isBooking" type="button" class="btn primary" :disabled="!checkin?.canCheckIn" @click="openCheckin">เช็คอิน</button>
              <button v-else-if="isInhouse" type="button" class="btn primary" @click="openCheckout">เช็คเอาต์</button>
            </template>
            <template v-else-if="panel === 'new'">
              <button type="button" class="btn ghost" :disabled="saving" @click="closeDrawer">ยกเลิก</button>
              <button type="button" class="btn primary" :disabled="saving || newBookingLoading || !newBooking" @click="saveNewBooking">{{ saving ? 'กำลังจอง…' : 'บันทึกจองใหม่' }}</button>
            </template>
            <template v-else-if="panel === 'checkin'">
              <button type="button" class="btn ghost" :disabled="saving" @click="panel = 'summary'">ย้อนกลับ</button>
              <button type="button" class="btn primary" :disabled="saving" @click="confirmCheckin">{{ saving ? 'กำลังเช็คอิน…' : 'ยืนยันเช็คอิน' }}</button>
            </template>
            <template v-else-if="panel === 'edit'">
              <button type="button" class="btn ghost" :disabled="saving" @click="panel = 'summary'">ย้อนกลับ</button>
              <button type="button" class="btn primary" :disabled="saving || !editChanged" @click="saveEdit">{{ saving ? 'กำลังบันทึก…' : 'บันทึก' }}</button>
            </template>
            <template v-else>
              <button type="button" class="btn ghost" :disabled="saving" @click="panel = 'summary'">ย้อนกลับ</button>
              <button type="button" class="btn primary" :disabled="saving || !folio?.canCheckout" @click="confirmCheckout">ยืนยันเช็คเอาต์</button>
            </template>
          </footer>
        </aside>
      </div>
    </Transition>

    <div v-if="stopSale" class="cal-modal" @click.self="stopSale = null">
      <form class="sheet" @submit.prevent="confirmStop">
        <h3>ปิดการขายห้อง {{ stopSale.roomNo }}</h3>
        <label>ตั้งแต่วันที่ <input v-model="stopSale.dateBegin" type="date" :min="data?.today" required></label>
        <label>ถึงวันที่ <input v-model="stopSale.dateEnd" type="date" :min="stopSale.dateBegin" required></label>
        <label>หมายเหตุ <input v-model="stopSale.remark" maxlength="30" required></label>
        <div class="actions">
          <button type="button" @click="stopSale = null" :disabled="saving">ยกเลิก</button>
          <button type="submit" :disabled="saving">ยืนยัน</button>
        </div>
      </form>
    </div>

    <div v-if="release" class="cal-modal" @click.self="release = null">
      <form class="sheet" @submit.prevent="confirmRelease">
        <h3>ปลดการปิดขาย</h3>
        <p>ห้อง {{ release.roomNo }} · เลขจอง {{ release.resvNo || '-' }}</p>
        <p>{{ release.guest }}</p>
        <label>หมายเหตุ <input v-model="release.ref" maxlength="30" required></label>
        <div class="actions">
          <button type="button" @click="release = null" :disabled="saving">ยกเลิก</button>
          <button type="submit" :disabled="saving || !release.resvNo">ยืนยันปลดห้อง</button>
        </div>
      </form>
    </div>
  </section>
</template>

<style scoped>
.pms-cal { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.cal-toolbar { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: end; }
.cal-toolbar h2 { margin: 0; font-size: 16px; display: flex; gap: 8px; align-items: center; }
.cal-toolbar h2 span, .cal-legend i { border-radius: 4px; }
.cal-toolbar h2 span { background: #e7eef8; color: #0a5a96; font-size: 11px; padding: 1px 7px; }
.cal-toolbar p, .cal-legend small { margin: 2px 0 0; color: #6d7f96; font-size: 12px; }
.cal-toolbar label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #5c6f86; }
.cal-toolbar input, .cal-toolbar select, .cal-toolbar button, .sheet button, .sheet input, .sheet select {
  height: 36px; border: 1px solid #d4e0ee; border-radius: 7px; background: #fff; padding: 0 8px; font: inherit;
}
.sheet input, .sheet select { width: 100%; box-sizing: border-box; }
.days-field { display: flex; flex-direction: column; gap: 4px; }
.days-row { display: flex; gap: 4px; }
.days-row input[type="number"] { width: 64px; text-align: center; font-weight: 600; }
.days-row button { min-width: 36px; padding: 0 6px; color: #5c6f86; cursor: pointer; }
.days-row button:disabled { cursor: default; opacity: .6; }
.cal-toolbar .grow { flex: 1; min-width: 140px; }
.cal-toolbar .grow input { width: 100%; }
.cal-toolbar button.on { background: #001529; color: #fff; }
.cal-error { margin: 0; color: #9b2335; font-size: 13px; }
/* ตารางสูงเกือบเต็มจอ เลื่อนหน้าลงครั้งเดียวก็เห็นห้องได้มากที่สุด */
.cal-scroll { --room-w: 84px; overflow: auto; max-height: max(360px, calc(100vh - 150px)); max-height: max(360px, calc(100dvh - 150px)); border: 1px solid #e1e8f2; border-radius: 12px; background: #fff; }
table { border-collapse: separate; border-spacing: 0; min-width: 100%; font-size: 12px; }
th, td { border-bottom: 1px solid #e6edf5; border-right: 1px solid #eef2f7; height: 36px; min-width: 92px; padding: 0; white-space: nowrap; position: relative; }
thead { position: sticky; top: 0; z-index: 3; }
thead th { background: #f7fafc; text-align: center; }
.head-days th { height: 46px; }
.head-free th { height: 24px; border-bottom-color: #d4e0ee; color: #44566c; font-size: 11px; font-weight: 600; font-variant-numeric: tabular-nums; }
.head-free th.full { color: #c62828; }
.head-free th.today { background: #e7f3ff; }
.sticky-room { position: sticky; left: 0; z-index: 2; width: var(--room-w); min-width: var(--room-w); max-width: var(--room-w); box-sizing: border-box; padding: 0 8px; background: #fff; border-right-color: #d4e0ee; text-align: left; }
thead .sticky-room { background: #f7fafc; color: #5c6f86; font-size: 11px; font-weight: 600; }
tbody .sticky-room b { display: block; font-size: 13px; line-height: 1.15; font-variant-numeric: tabular-nums; }
tbody .sticky-room small { display: block; max-width: calc(var(--room-w) - 16px); overflow: hidden; text-overflow: ellipsis; color: #6d7f96; font-size: 10px; font-weight: 500; line-height: 1.15; }
tbody tr:hover .sticky-room { background: #eaf2fb; }
.head-days th b { display: block; font-size: 13px; line-height: 1.1; }
.head-days th small { display: block; color: #6d7f96; font-weight: 500; line-height: 1.1; }
.head-days th small.month { min-height: 12px; color: #0a5a96; font-weight: 700; }
.head-days th.weekend { background: #eef2f8; }
.head-days th.today { background: #0a5a96; color: #fff; }
.head-days th.today small { color: #dbeafb; }
td { cursor: pointer; }
td.empty.weekend { background: #f4f7fb; }
td.empty:hover { background: #e9f2fc; }
/* หนึ่งแถบต่อหนึ่งการเข้าพัก มีขอบและช่องไฟ การจองที่ติดกันจึงไม่กลืนกัน */
.bar { position: absolute; inset: 3px 2px; display: flex; align-items: center; border: 1px solid transparent; border-radius: 6px; }
.bar.booked { background: #f4f58a; border-color: #d6d74c; }
.bar.unconfirmed { background: #b9dcff; border-color: #86bdf0; }
.bar.inhouse { background: #ffc4ea; border-color: #ee8fcb; }
.bar.ooo { background: #ffb3b8; border-color: #ec7f88; }
.bar.history { background: #ead48a; border-color: #cdb150; }
td.stay:hover .bar { box-shadow: 0 0 0 2px rgba(10, 90, 150, .28); }
/* ชื่อเกาะขอบซ้ายของจอเมื่อเลื่อน แถบที่เริ่มก่อนช่วงที่เห็นจึงยังอ่านชื่อได้ */
.guest { position: sticky; left: calc(var(--room-w) + 4px); min-width: 0; max-width: 100%; box-sizing: border-box; padding: 0 7px; overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-weight: 700; color: #142033; }
/* ลากย้าย: แถบสีเหลืองจับลากได้ ช่องปลายทางเขียว = วางได้ แดง = ไม่ว่าง */
.bar[draggable="true"] { cursor: grab; }
.bar[draggable="true"]:active { cursor: grabbing; }
td.dragging .bar { opacity: .45; }
td.empty.drop-ok { background: #d8f3e2; box-shadow: inset 0 2px 0 #1f9d55, inset 0 -2px 0 #1f9d55; }
td.empty.drop-bad { background: #fde3e3; box-shadow: inset 0 2px 0 #c62828, inset 0 -2px 0 #c62828; }
td.stay.drop-ok .bar { box-shadow: 0 0 0 2px #1f9d55; }
td.stay.drop-bad .bar { box-shadow: 0 0 0 2px #c62828; }
.today-line { position: absolute; top: 0; bottom: -1px; width: 2px; margin-left: -1px; background: #0a5a96; pointer-events: none; z-index: 1; }
.group-row th { height: 30px; padding: 0 8px; background: #f4f7fb; text-align: left; }
.group-row button { position: sticky; left: 8px; border: 0; background: transparent; padding: 0; font: inherit; font-weight: 650; cursor: pointer; }
.cal-empty, .cal-loading { padding: 28px; text-align: center; color: #6d7f96; }
.cal-legend { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; font-size: 12px; }
.cal-legend i { width: 14px; height: 14px; display: inline-block; margin-right: 4px; vertical-align: -2px; }
.cal-legend .booked { background: #f4f58a; }
.cal-legend .unconfirmed { background: #b9dcff; }
.cal-legend .inhouse { background: #ffc4ea; }
.cal-legend .ooo { background: #ffb3b8; }
.cal-legend .history { background: #ead48a; }
.cal-modal { position: fixed; inset: 0; background: rgba(0, 21, 41, .45); display: grid; place-items: center; z-index: 80; padding: 16px; }
.sheet { width: min(420px, 100%); background: #fff; border-radius: 16px; padding: 18px; display: grid; gap: 8px; max-height: min(92vh, 860px); overflow: auto; }
.sheet h3, .sheet p { margin: 0; }
.muted { margin: 0; color: #6d7f96; font-size: 13px; }
.sheet label { display: grid; gap: 4px; font-size: 12px; color: #5c6f86; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.actions button[type="submit"], .cal-error button { background: #001529; color: #fff; border-color: #001529; }

/* แผงห้องด้านขวา: รายละเอียด เช็คอิน เช็คเอาต์ จบในที่เดียว */
.drawer-wrap { position: fixed; inset: 0; z-index: 70; display: flex; justify-content: flex-end; background: rgba(0, 21, 41, .32); }
.drawer { width: min(460px, 100%); height: 100%; display: flex; flex-direction: column; background: #f5f8fc; color: #142033; box-shadow: -12px 0 32px rgba(0, 21, 41, .16); }
.drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px 20px 14px; background: #fff; border-bottom: 1px solid #e1e8f2; }
.drawer-head h3 { margin: 8px 0 0; font-size: 22px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.drawer-head p { margin: 2px 0 0; color: #6d7f96; font-size: 13px; }
.icon-btn { width: 36px; height: 36px; flex: none; border: 1px solid #d4e0ee; border-radius: 10px; background: #fff; color: #44566c; font-size: 14px; cursor: pointer; }
.icon-btn:hover { background: #f1f5fa; }
.chip { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; color: #142033; }
.chip.booked { background: #f4f58a; }
.chip.unconfirmed { background: #b9dcff; }
.chip.inhouse { background: #ffc4ea; }
.chip.history { background: #ead48a; }
.chip.new { background: #d9f2e5; }
.btn.wide { width: 100%; }
.drawer-body { flex: 1; min-height: 0; overflow-y: auto; padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
.card { background: #fff; border: 1px solid #e1e8f2; border-radius: 14px; padding: 14px 16px; display: grid; gap: 10px; }
.card h4 { margin: 0; font-size: 14px; display: flex; align-items: center; gap: 8px; }
.count { background: #e7eef8; color: #0a5a96; border-radius: 999px; padding: 1px 8px; font-size: 12px; }
.optional { color: #6d7f96; font-size: 12px; font-weight: 500; }
.guest-name { margin: 0; font-size: 17px; font-weight: 700; overflow-wrap: anywhere; }
.card dl { margin: 0; display: grid; gap: 7px; }
.card dl div { display: flex; justify-content: space-between; gap: 16px; font-size: 14px; }
.card dt { color: #6d7f96; flex: none; }
.card dd { margin: 0; text-align: right; overflow-wrap: anywhere; font-variant-numeric: tabular-nums; }
.note { margin: 0; padding: 10px 14px; border-radius: 12px; background: #eaf1f9; color: #2c4460; font-size: 13px; line-height: 1.5; }
.note.warn { background: #fff3e0; color: #8a4b00; }
.note.ok { background: #e6f6ec; color: #0c6b34; }
.link { border: 0; background: transparent; padding: 0; color: inherit; font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
.fields { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 12px; }
.fields .wide { grid-column: 1 / -1; }
.fields label { display: grid; gap: 5px; align-content: start; font-size: 12px; color: #5c6f86; min-width: 0; }
.fields input, .fields select { width: 100%; min-width: 0; box-sizing: border-box; height: 42px; padding: 0 12px; border: 1px solid #cfdbe9; border-radius: 10px; background: #fff; color: #142033; font: inherit; font-size: 14px; }
.fields input:focus-visible, .fields select:focus-visible, .btn:focus-visible, .icon-btn:focus-visible, .tabs button:focus-visible { outline: 2px solid #0a5a96; outline-offset: 2px; }
.fields textarea { width: 100%; min-width: 0; box-sizing: border-box; padding: 10px 12px; border: 1px solid #cfdbe9; border-radius: 10px; background: #fff; color: #142033; font: inherit; font-size: 14px; line-height: 1.45; resize: vertical; }
.fields textarea:focus-visible { outline: 2px solid #0a5a96; outline-offset: 2px; }
.fields input:disabled, .fields select:disabled { background: #f1f5fa; color: #6d7f96; cursor: not-allowed; }
.fields .invalid input, .fields .invalid select { border-color: #c62828; background: #fff7f7; }
.fields label small { color: #c62828; }
.balance { gap: 2px; background: #fff8ec; border-color: #f3ddb5; }
.balance.settled { background: #e9f7ee; border-color: #bfe3cb; }
.balance.over { background: #fff1f0; border-color: #f3c1bc; }
.balance span, .balance small { color: #5c6f86; font-size: 12px; }
.balance b { font-size: 30px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.balance em { margin-top: 4px; font-style: normal; font-size: 13px; font-weight: 600; color: #8a4b00; }
.balance.settled em { color: #0c6b34; }
.balance.over em { color: #b42318; }
.balance .btn { margin-top: 10px; }
.lines { list-style: none; margin: 0; padding: 0; max-height: 280px; overflow-y: auto; }
.lines li { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 0; border-top: 1px solid #eef2f7; font-size: 14px; }
.lines li:first-child { border-top: 0; padding-top: 0; }
.lines span { min-width: 0; overflow-wrap: anywhere; }
.lines small { display: block; color: #8494a8; font-size: 11px; }
.lines b { flex: none; font-variant-numeric: tabular-nums; }
.lines .pay { color: #0c6b34; }
.line-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: none; }
.link { border: 0; background: none; padding: 0; color: #0061a1; font: inherit; font-size: 12px; cursor: pointer; }
.link.danger { color: #b42318; }
.link:disabled { opacity: 0.45; cursor: not-allowed; }
.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 12px; background: #eef2f7; }
.tabs button { height: 36px; border: 0; border-radius: 9px; background: transparent; color: #44566c; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.tabs button.on { background: #fff; color: #142033; box-shadow: 0 1px 3px rgba(0, 21, 41, .14); }
.kind-toggle { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; grid-column: 1 / -1; padding: 3px; border-radius: 10px; background: #f4f7fb; border: 1px solid #e1e8f2; }
.kind-toggle button { height: 34px; border: 0; border-radius: 8px; background: transparent; color: #44566c; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.kind-toggle button.on { background: #fff; color: #142033; box-shadow: 0 1px 2px rgba(0, 21, 41, .12); }
.btn { height: 44px; padding: 0 18px; border: 1px solid #001529; border-radius: 11px; background: #001529; color: #fff; font: inherit; font-size: 14px; font-weight: 600; cursor: pointer; }
.btn.ghost { background: #fff; color: #142033; border-color: #cfdbe9; }
.btn:disabled, .icon-btn:disabled { opacity: .45; cursor: not-allowed; }
.drawer-foot { display: flex; gap: 10px; padding: 14px 20px; background: #fff; border-top: 1px solid #e1e8f2; }
.drawer-foot .btn { flex: 1; }
.drawer-foot .btn.ghost { flex: 0 0 auto; }
.drawer-enter-active, .drawer-leave-active { transition: opacity .18s ease; }
.drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: transform .18s ease; }
.drawer-enter-from, .drawer-leave-to { opacity: 0; }
.drawer-enter-from .drawer, .drawer-leave-to .drawer { transform: translateX(24px); }
@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active, .drawer-leave-active, .drawer-enter-active .drawer, .drawer-leave-active .drawer { transition: none; }
}
@media (max-width: 520px) {
  .drawer-head, .drawer-body, .drawer-foot { padding-left: 14px; padding-right: 14px; }
}
</style>
