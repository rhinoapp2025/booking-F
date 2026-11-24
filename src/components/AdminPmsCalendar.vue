<script setup>
import { computed, onMounted, ref, watch } from 'vue'
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

onMounted(load)
watch(() => props.hotelSlug, load)
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
              v-for="day in dates"
              :key="day"
              :class="{ weekend: isWeekend(day), today: day === data?.today }"
            >
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
      <small>กดช่องที่มีชื่อเพื่อดูรายละเอียด · กดช่องว่างตั้งแต่วันนี้เพื่อปิดการขาย · กดช่องปิดใช้งานเพื่อปลดห้อง</small>
    </footer>

    <div v-if="detail" class="cal-modal" @click.self="detail = null">
      <div class="sheet">
        <h3>ห้อง {{ detail.roomNo }}</h3>
        <p>{{ detail.roomType }}</p>
        <dl>
          <div><dt>วันที่</dt><dd>{{ formatDate(detail.day) }}</dd></div>
          <div><dt>ชื่อ</dt><dd>{{ detail.guest || '-' }}</dd></div>
          <div><dt>เลขจอง</dt><dd>{{ detail.resvNo || '-' }}</dd></div>
          <div><dt>สถานะ</dt><dd>{{ kindLabel[detail.kind] || detail.kind }}</dd></div>
          <div><dt>ที่มา</dt><dd>{{ detail.source === 'folio' ? 'Folio history' : 'Booking calendar' }}</dd></div>
        </dl>
        <button type="button" @click="detail = null">ปิด</button>
      </div>
    </div>

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
.cal-toolbar input, .cal-toolbar select, .cal-toolbar button, .sheet button, .sheet input {
  height: 36px; border: 1px solid #d4e0ee; border-radius: 7px; background: #fff; padding: 0 8px; font: inherit;
}
.cal-toolbar .grow { flex: 1; min-width: 140px; }
.cal-toolbar .grow input { width: 100%; }
.cal-toolbar button.on { background: #001529; color: #fff; }
.cal-error { margin: 0; color: #9b2335; font-size: 13px; }
.cal-scroll { overflow: auto; max-height: min(70vh, 720px); border: 1px solid #e1e8f2; border-radius: 12px; background: #fff; }
table { border-collapse: separate; border-spacing: 0; min-width: 100%; font-size: 12px; }
th, td { border-bottom: 1px solid #eef2f7; border-right: 1px solid #f3f6fb; height: 42px; min-width: 72px; padding: 0 6px; white-space: nowrap; position: relative; }
thead th { position: sticky; top: 0; background: #f7fafc; z-index: 2; text-align: center; }
.sticky-room, .sticky-type { position: sticky; background: #fff; z-index: 3; }
.sticky-room { left: 0; min-width: 72px; }
.sticky-type { left: 72px; min-width: 88px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; }
thead .sticky-room, thead .sticky-type { z-index: 4; background: #f7fafc; }
th b { display: block; font-size: 13px; }
th small { color: #6d7f96; font-weight: 500; }
.weekend { background: #f8fafc; }
.today { box-shadow: inset 0 -2px 0 #001529; }
td { cursor: pointer; }
td.start { z-index: 1; }
td.booked { background: rgba(240, 255, 105, .75); }
td.unconfirmed { background: rgba(86, 184, 249, .45); }
td.inhouse { background: rgba(255, 134, 215, .45); }
td.ooo { background: rgba(255, 0, 17, .28); }
td.history { background: rgba(201, 162, 39, .45); }
.guest { position: absolute; left: 6px; top: 50%; transform: translateY(-50%); overflow: hidden; text-overflow: ellipsis; font-weight: 650; pointer-events: none; z-index: 2; }
.group-row th { background: #f4f7fb; text-align: left; }
.group-row button { border: 0; background: transparent; font: inherit; font-weight: 650; cursor: pointer; }
.cal-empty, .cal-loading { padding: 28px; text-align: center; color: #6d7f96; }
.cal-legend { display: flex; flex-wrap: wrap; gap: 10px 14px; align-items: center; font-size: 12px; }
.cal-legend i { width: 14px; height: 14px; display: inline-block; margin-right: 4px; vertical-align: -2px; }
.cal-legend .booked { background: rgba(240, 255, 105, .95); }
.cal-legend .unconfirmed { background: rgba(86, 184, 249, .8); }
.cal-legend .inhouse { background: rgba(255, 134, 215, .8); }
.cal-legend .ooo { background: rgba(255, 0, 17, .55); }
.cal-legend .history { background: rgba(201, 162, 39, .9); }
.cal-modal { position: fixed; inset: 0; background: rgba(0, 21, 41, .45); display: grid; place-items: center; z-index: 80; padding: 16px; }
.sheet { width: min(420px, 100%); background: #fff; border-radius: 16px; padding: 18px; display: grid; gap: 8px; }
.sheet h3, .sheet p { margin: 0; }
.sheet dl { margin: 0; display: grid; gap: 6px; }
.sheet dl div { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
.sheet dt { color: #6d7f96; }
.sheet label { display: grid; gap: 4px; font-size: 12px; color: #5c6f86; }
.actions { display: flex; justify-content: flex-end; gap: 8px; }
.actions button[type="submit"], .cal-error button { background: #001529; color: #fff; border-color: #001529; }
</style>
