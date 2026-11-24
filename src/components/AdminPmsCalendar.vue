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
const days = ref(10)
const bgn = ref(bangkokToday())
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
const checkin = ref(null)
const checkinLoading = ref(false)
const checkinError = ref('')
const checkinTried = ref(false)
const checkinForm = ref({ fill: {}, paidBy: '', depositAmount: 0, reference: '', keyAmount: 0 })

const isBooking = computed(() => ['booked', 'unconfirmed'].includes(detail.value?.kind)
  && /^\d+$/.test(String(detail.value?.resvNo || '')))
const isInhouse = computed(() => detail.value?.kind === 'inhouse' && detail.value?.source !== 'folio')
const missingCount = computed(() => checkin.value?.missing?.length || 0)

function baht(value) {
  return (Number(value) || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })
}

const dayChoices = [7, 10, 31]
const kindLabel = {
  booked: 'จองแล้ว',
  unconfirmed: 'รอยืนยัน',
  inhouse: 'เข้าพักแล้ว',
  ooo: 'ปิดใช้งาน',
  history: 'ประวัติเข้าพัก',
}

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

function staySpan(room, index) {
  const day = dates.value[index]
  const cell = cellOf(room, day)
  if (!cell) return null
  let start = index
  while (start > 0 && sameStay(cell, cellOf(room, dates.value[start - 1]))) start -= 1
  let end = index
  while (end < dates.value.length - 1 && sameStay(cell, cellOf(room, dates.value[end + 1]))) end += 1
  return { start, end, cell, isStart: start === index }
}

function spanStyle(room, index) {
  const span = staySpan(room, index)
  if (!span?.isStart) return null
  const nights = span.end - span.start + 1
  return { width: `calc(${nights * 100}% - 10px)` }
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
  if (isBooking.value) loadCheckin()
}

function closeDrawer() {
  if (saving.value) return
  detail.value = null
  folio.value = null
  checkin.value = null
  checkinError.value = ''
  checkinLoading.value = false
  panel.value = 'summary'
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

function syncChargeAmount() {
  const item = folio.value?.charges?.find((row) => row.code === chargeForm.value.trnCode)
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
  panel.value = 'folio'
  try {
    const { data: body } = await api.get(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/folio`, {
      params: { roomNo },
    })
    if (detail.value !== target) return
    folio.value = body
    if (Number(body.balance?.amount) > 0) folioTab.value = 'payment'
    chargeForm.value = { trnCode: body.charges?.[0]?.code || '', quantity: 1, amount: body.charges?.[0]?.price || 0, remark: '' }
    paymentForm.value = { trnCode: body.payments?.[0]?.code || '', amount: Math.max(0, Number(body.balance?.amount) || 0), company: body.companies?.[0]?.code || '', remark: '' }
  } catch (err) {
    if (detail.value === target) panel.value = 'summary'
    Swal.fire({ icon: 'error', title: 'เปิดรายการห้องไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    folioLoading.value = false
  }
}

async function refreshFolio(roomNo) {
  const { data: body } = await api.get(`/api/admin/${encodeURIComponent(props.hotelSlug)}/pms-calendar/folio`, {
    params: { roomNo },
  })
  folio.value = body
  paymentForm.value.amount = Math.max(0, Number(body.balance?.amount) || 0)
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
    folio.value = body
    chargeForm.value.remark = ''
    paymentForm.value.amount = Math.max(0, Number(body.balance?.amount) || 0)
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'โพสต์ค่าห้องไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
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
    folio.value = body
    paymentForm.value.amount = Math.max(0, Number(body.balance?.amount) || 0)
    paymentForm.value.remark = ''
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'เพิ่มรายการชำระไม่สำเร็จ', text: err?.response?.data?.error || '', confirmButtonColor: '#001529' })
  } finally {
    saving.value = false
  }
}

async function confirmCheckout() {
  if (!folio.value || saving.value) return
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
        <h2>ปฏิทินการจอง <span>{{ visibleRooms.length }}</span></h2>
        <p>{{ rangeLabel }} · เริ่มวันนี้ · ก่อนวันนี้มาจาก folio history</p>
      </div>
      <label>ระยะเวลา
        <select v-model.number="days" :disabled="loading" @change="load">
          <option v-for="n in dayChoices" :key="n" :value="n">{{ n }} วัน</option>
        </select>
      </label>
      <label>ตั้งแต่วันที่
        <input v-model="bgn" type="date" :disabled="loading" @change="load">
      </label>
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

    <div class="cal-scroll" :aria-busy="loading">
      <table v-if="visibleRooms.length">
        <thead>
          <tr>
            <th class="sticky-room">ห้อง</th>
            <th class="sticky-type">ประเภท</th>
            <th
              v-for="(day, index) in dates"
              :key="day"
              :class="{ weekend: isWeekend(day), today: day === data?.today }"
            >
              <small class="month">{{ monthLabel(day, index) }}</small>
              <b>{{ day.slice(8) }}</b>
              <small>{{ weekday(day) }}</small>
            </th>
          </tr>
        </thead>
        <tbody v-for="group in groups" :key="group.type">
          <tr v-if="grouped" class="group-row">
            <th :colspan="dates.length + 2">
              <button type="button" @click="toggleGroup(group.type)">{{ hidden.includes(group.type) ? '▸' : '▾' }} {{ group.type }} · {{ group.rooms.length }}</button>
            </th>
          </tr>
          <tr v-for="room in group.rooms" v-show="!grouped || !hidden.includes(group.type)" :key="room.roomNo">
            <th class="sticky-room">{{ room.roomNo }}</th>
            <td class="sticky-type" :title="room.typeName">{{ (room.typeName || '').split('/')[0] }}</td>
            <td
              v-for="(day, index) in dates"
              :key="room.roomNo + day"
              :class="[cellOf(room, day)?.kind || 'empty', { weekend: isWeekend(day), today: day === data?.today, start: staySpan(room, index)?.isStart }]"
              :title="cellOf(room, day)?.guest || (day >= (data?.today || '') ? 'ว่าง' : '')"
              @click="cellOf(room, day) ? openDetail(room, day) : openStop(room, day)"
            >
              <span v-if="staySpan(room, index)?.isStart" class="guest" :style="spanStyle(room, index)">{{ cellOf(room, day).guest }}</span>
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
      <small>กดช่องที่มีชื่อเพื่อดูรายละเอียด เช็คอิน หรือเช็คเอาต์ · กดช่องว่างตั้งแต่วันนี้เพื่อปิดการขาย · กดช่องปิดใช้งานเพื่อปลดห้อง</small>
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
            <section class="card">
              <p class="guest-name">{{ checkin?.guest || detail.guest || '-' }}</p>
              <dl>
                <div v-if="checkin?.arrival"><dt>เข้าพัก</dt><dd>{{ formatDate(checkin.arrival) }} → {{ formatDate(checkin.departure) }} · {{ checkin.nights }} คืน</dd></div>
                <div v-else><dt>วันที่</dt><dd>{{ formatDate(detail.day) }}</dd></div>
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

            <!-- รายละเอียด -->
            <template v-if="panel === 'summary'">
              <p v-if="detail.source === 'folio' || detail.kind === 'history'" class="note">ประวัติเข้าพักจาก folio history ดูได้อย่างเดียว</p>
              <template v-else-if="isBooking">
                <p v-if="checkinLoading" class="note">กำลังโหลดข้อมูลการจอง…</p>
                <p v-else-if="checkinError" class="note warn">{{ checkinError }} <button type="button" class="link" @click="loadCheckin">ลองอีกครั้ง</button></p>
                <p v-else-if="checkin?.blockReason" class="note warn">{{ checkin.blockReason }}</p>
                <p v-else-if="checkin && missingCount" class="note">ยังขาดข้อมูล {{ missingCount }} รายการ ระบบจะให้กรอกเฉพาะส่วนที่ขาดตอนเช็คอิน</p>
                <p v-else-if="checkin" class="note ok">ข้อมูลครบ พร้อมเช็คอิน</p>
              </template>
              <p v-else-if="isInhouse" class="note">กดเช็คเอาต์เพื่อดูรายการในห้อง โพสต์ค่าห้อง และรับชำระ ก่อนยืนยันเช็คเอาต์</p>
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

            <!-- ขั้นเช็คเอาต์ -->
            <template v-else-if="panel === 'folio'">
              <p v-if="folioLoading" class="note">กำลังโหลดรายการในห้อง…</p>
              <template v-else-if="folio">
                <section class="card balance" :class="{ settled: folio.canCheckout }">
                  <span>ยอดคงเหลือ · โฟลิโอ {{ folio.folioNo }}</span>
                  <b>฿{{ baht(folio.balance?.amount) }}</b>
                  <small>เซอร์วิส ฿{{ baht(folio.balance?.service) }} · ภาษี ฿{{ baht(folio.balance?.tax) }}</small>
                  <em>{{ folio.canCheckout ? 'ยอดเป็น 0 พร้อมเช็คเอาต์' : 'รับชำระให้ยอดเป็น 0 ก่อนเช็คเอาต์' }}</em>
                </section>

                <section class="card">
                  <h4>รายการในห้อง <span class="count">{{ folio.lines?.length || 0 }}</span></h4>
                  <p v-if="!folio.lines?.length" class="muted">ยังไม่มีรายการในโฟลิโอ</p>
                  <ul v-else class="lines">
                    <li v-for="(line, index) in folio.lines" :key="index">
                      <span>
                        {{ line.name }}<template v-if="line.qty > 1"> × {{ line.qty }}</template>
                        <small>{{ line.postedAt }}<template v-if="line.remark && line.remark !== '/'"> · {{ line.remark }}</template></small>
                      </span>
                      <b :class="{ pay: line.amount < 0 }">฿{{ baht(line.amount) }}</b>
                    </li>
                  </ul>
                </section>

                <section class="card">
                  <div class="tabs" role="tablist">
                    <button type="button" role="tab" :aria-selected="folioTab === 'charge'" :class="{ on: folioTab === 'charge' }" @click="folioTab = 'charge'">โพสต์ค่าห้อง</button>
                    <button type="button" role="tab" :aria-selected="folioTab === 'payment'" :class="{ on: folioTab === 'payment' }" @click="folioTab = 'payment'">รับชำระ</button>
                  </div>
                  <form v-if="folioTab === 'charge'" class="fields" @submit.prevent="postCharge">
                    <label class="wide">
                      <span>รายการ</span>
                      <select v-model="chargeForm.trnCode" required @change="syncChargeAmount">
                        <option v-for="item in folio.charges" :key="item.code" :value="item.code">{{ item.code }} {{ item.name }}</option>
                      </select>
                    </label>
                    <label><span>จำนวน</span><input v-model.number="chargeForm.quantity" type="number" min="1" required inputmode="numeric" @change="syncChargeAmount"></label>
                    <label><span>จำนวนเงิน (บาท)</span><input v-model.number="chargeForm.amount" type="number" min="0" step="0.01" required inputmode="decimal"></label>
                    <label class="wide"><span>หมายเหตุ</span><input v-model="chargeForm.remark" maxlength="50"></label>
                    <button type="submit" class="btn wide" :disabled="saving">โพสต์ค่าห้อง</button>
                  </form>
                  <form v-else class="fields" @submit.prevent="postPayment">
                    <label class="wide">
                      <span>วิธีชำระ</span>
                      <select v-model="paymentForm.trnCode" required>
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
                    <label><span>จำนวนเงิน (บาท)</span><input v-model.number="paymentForm.amount" type="number" min="0" step="0.01" required inputmode="decimal"></label>
                    <label><span>หมายเหตุ</span><input v-model="paymentForm.remark" maxlength="50"></label>
                    <button type="submit" class="btn wide" :disabled="saving">เพิ่มรายการชำระ</button>
                  </form>
                </section>
              </template>
            </template>
          </div>

          <footer class="drawer-foot">
            <template v-if="panel === 'summary'">
              <button type="button" class="btn ghost" @click="closeDrawer">ปิด</button>
              <button v-if="isBooking" type="button" class="btn primary" :disabled="!checkin?.canCheckIn" @click="openCheckin">เช็คอิน</button>
              <button v-else-if="isInhouse" type="button" class="btn primary" @click="openCheckout">เช็คเอาต์</button>
            </template>
            <template v-else-if="panel === 'checkin'">
              <button type="button" class="btn ghost" :disabled="saving" @click="panel = 'summary'">ย้อนกลับ</button>
              <button type="button" class="btn primary" :disabled="saving" @click="confirmCheckin">{{ saving ? 'กำลังเช็คอิน…' : 'ยืนยันเช็คอิน' }}</button>
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
.cal-toolbar .grow { flex: 1; min-width: 140px; }
.cal-toolbar .grow input { width: 100%; }
.cal-toolbar button.on { background: #001529; color: #fff; }
.cal-error { margin: 0; color: #9b2335; font-size: 13px; }
.cal-scroll { overflow: auto; max-height: min(70vh, 720px); border: 1px solid #e1e8f2; border-radius: 12px; background: #fff; }
table { border-collapse: separate; border-spacing: 0; min-width: 100%; font-size: 12px; }
th, td { border-bottom: 1px solid #e6edf5; border-right: 1px solid #e6edf5; height: 46px; min-width: 92px; padding: 0 4px; white-space: nowrap; position: relative; }
thead th { position: sticky; top: 0; background: #f7fafc; z-index: 2; text-align: center; height: 52px; }
.sticky-room, .sticky-type { position: sticky; background: #fff; z-index: 3; }
.sticky-room { left: 0; min-width: 64px; font-variant-numeric: tabular-nums; }
.sticky-type { left: 64px; min-width: 72px; max-width: 96px; overflow: hidden; text-overflow: ellipsis; color: #5c6f86; }
thead .sticky-room, thead .sticky-type { z-index: 4; background: #f7fafc; }
th b { display: block; font-size: 13px; line-height: 1.1; }
th small { display: block; color: #6d7f96; font-weight: 500; line-height: 1.1; }
th small.month { min-height: 12px; color: #0a5a96; font-weight: 700; }
tbody tr:nth-child(even) td.empty { background: #fbfcfe; }
.weekend { background: #f4f7fb; }
thead th.today { background: #e7f3ff; }
td.today { box-shadow: inset 3px 0 0 #0a5a96; }
thead th.today { box-shadow: inset 0 -3px 0 #0a5a96; }
td { cursor: pointer; overflow: visible; }
td.start { z-index: 1; }
td.booked { background: #f4f58a; }
td.unconfirmed { background: #b9dcff; }
td.inhouse { background: #ffc4ea; }
td.ooo { background: #ffb3b8; }
td.history { background: #ead48a; }
.guest { position: absolute; left: 4px; top: 50%; transform: translateY(-50%); overflow: hidden; text-overflow: ellipsis; font-size: 12px; font-weight: 700; color: #142033; pointer-events: none; z-index: 2; }
.group-row th { background: #f4f7fb; text-align: left; }
.group-row button { border: 0; background: transparent; font: inherit; font-weight: 650; cursor: pointer; }
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
.fields .invalid input, .fields .invalid select { border-color: #c62828; background: #fff7f7; }
.fields label small { color: #c62828; }
.balance { gap: 2px; background: #fff8ec; border-color: #f3ddb5; }
.balance.settled { background: #e9f7ee; border-color: #bfe3cb; }
.balance span, .balance small { color: #5c6f86; font-size: 12px; }
.balance b { font-size: 30px; line-height: 1.2; font-variant-numeric: tabular-nums; }
.balance em { margin-top: 4px; font-style: normal; font-size: 13px; font-weight: 600; color: #8a4b00; }
.balance.settled em { color: #0c6b34; }
.lines { list-style: none; margin: 0; padding: 0; max-height: 240px; overflow-y: auto; }
.lines li { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 8px 0; border-top: 1px solid #eef2f7; font-size: 14px; }
.lines li:first-child { border-top: 0; padding-top: 0; }
.lines span { min-width: 0; overflow-wrap: anywhere; }
.lines small { display: block; color: #8494a8; font-size: 11px; }
.lines b { flex: none; font-variant-numeric: tabular-nums; }
.lines .pay { color: #0c6b34; }
.tabs { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 12px; background: #eef2f7; }
.tabs button { height: 36px; border: 0; border-radius: 9px; background: transparent; color: #44566c; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.tabs button.on { background: #fff; color: #142033; box-shadow: 0 1px 3px rgba(0, 21, 41, .14); }
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
