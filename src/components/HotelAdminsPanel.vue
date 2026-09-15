<script setup>
import { computed, reactive, ref, watch } from 'vue'
import api from '../api/axios'
import { useAuthStore } from '../stores/auth'

const props = defineProps({
  endpoint: { type: String, default: '' },
  hotels: { type: Array, default: () => [] },
  canRemoveSuperAdmin: { type: Boolean, default: false },
})

const auth = useAuthStore()
const loading = ref(false)
const saving = ref(false)
const removingId = ref('')
const admins = ref([])
const message = ref('')
const errorMsg = ref('')
const form = reactive({ name: '', login_id: '', password: '' })
const selectedHotelId = ref('')

const currentUserId = computed(() => auth.user?.id || '')
const hotelOptions = computed(() => props.hotels || [])
const showHotelSelect = computed(() => hotelOptions.value.length > 0)
const activeEndpoint = computed(() => {
  if (showHotelSelect.value) {
    return selectedHotelId.value
      ? `/api/admin/platform/hotels/${selectedHotelId.value}/admins`
      : ''
  }
  return props.endpoint
})
const selectedHotelName = computed(() => {
  const hotel = hotelOptions.value.find((h) => h.id === selectedHotelId.value)
  return hotel ? `${hotel.name} /${hotel.slug}` : ''
})
const canSubmitAdmin = computed(() =>
  Boolean(form.name.trim() && form.login_id.trim() && form.password.trim() && activeEndpoint.value)
)

function syncSelectedHotel() {
  if (!showHotelSelect.value) return
  const exists = hotelOptions.value.some((h) => h.id === selectedHotelId.value)
  if (!exists) selectedHotelId.value = hotelOptions.value[0]?.id || ''
}

function canRemove(row) {
  if (row.is_super_admin && !props.canRemoveSuperAdmin) return false
  if (admins.value.length <= 1) return false
  return true
}

async function loadAdmins() {
  if (!activeEndpoint.value) return
  loading.value = true
  errorMsg.value = ''
  try {
    const { data } = await api.get(activeEndpoint.value)
    admins.value = Array.isArray(data) ? data : (data?.admins || [])
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'โหลดรายชื่อแอดมินไม่สำเร็จ'
    admins.value = []
  } finally {
    loading.value = false
  }
}

async function addAdmin() {
  if (saving.value || !canSubmitAdmin.value) return
  saving.value = true
  message.value = ''
  errorMsg.value = ''
  try {
    const { data } = await api.post(activeEndpoint.value, {
      name: form.name,
      login_id: form.login_id,
      password: form.password,
    })
    form.name = ''
    form.login_id = ''
    form.password = ''
    await loadAdmins()
    const hotelHint = selectedHotelName.value ? ` ที่ ${selectedHotelName.value}` : ''
    message.value = data?.message || `เพิ่มแอดมิน ${data?.admin?.name || ''} แล้ว${hotelHint}`
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'เพิ่มแอดมินไม่สำเร็จ'
  } finally {
    saving.value = false
  }
}

async function removeAdmin(row) {
  if (!canRemove(row) || removingId.value || !activeEndpoint.value) return
  if (!window.confirm(`ถอด ${row.name} จากแอดมินสาขานี้?`)) return
  removingId.value = row.id
  message.value = ''
  errorMsg.value = ''
  try {
    await api.delete(`${activeEndpoint.value}/${row.id}`)
    await loadAdmins()
    message.value = `ถอด ${row.name} แล้ว`
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'ถอดแอดมินไม่สำเร็จ'
  } finally {
    removingId.value = ''
  }
}

watch(hotelOptions, syncSelectedHotel, { immediate: true })
watch(activeEndpoint, loadAdmins, { immediate: true })
</script>

<template>
  <div class="admins-panel">
    <p class="muted">
      {{ showHotelSelect
        ? 'เลือกสาขา แล้วใส่ชื่อ ไอดี และรหัสผ่าน — แอดมินที่ได้เป็นของสาขานั้น ไม่ได้เป็นแอดมินแพลตฟอร์ม'
        : 'เข้าสู่ระบบด้วยไอดีและรหัสผ่าน — แอดมินที่เพิ่มได้เฉพาะสาขานี้ ไม่ได้เป็นแอดมินแพลตฟอร์ม' }}
    </p>
    <p v-if="message" class="success-msg">{{ message }}</p>
    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div class="admin-form" :class="{ 'admin-form--with-hotel': showHotelSelect }">
      <div v-if="showHotelSelect" class="form-row">
        <label class="form-label">สาขา</label>
        <select v-model="selectedHotelId" class="form-input">
          <option v-for="h in hotelOptions" :key="h.id" :value="h.id">
            {{ h.name }} /{{ h.slug }}{{ h.is_active ? '' : ' (ปิด)' }}
          </option>
        </select>
      </div>
      <div class="form-row">
        <label class="form-label">ชื่อแอดมิน</label>
        <input v-model="form.name" class="form-input" type="text" autocomplete="name" placeholder="ชื่อ-นามสกุล" />
      </div>
      <div class="form-row">
        <label class="form-label">ไอดี</label>
        <input v-model="form.login_id" class="form-input" type="text" autocomplete="username" placeholder="ไอดีเข้าสู่ระบบ" />
      </div>
      <div class="form-row">
        <label class="form-label">รหัสผ่าน</label>
        <input v-model="form.password" class="form-input" type="password" autocomplete="new-password" placeholder="รหัสผ่าน" />
      </div>
      <button class="btn btn-primary" type="button" :disabled="saving || !canSubmitAdmin" @click="addAdmin">
        {{ saving ? 'กำลังเพิ่ม...' : 'เพิ่มแอดมิน' }}
      </button>
    </div>

    <div v-if="loading" class="muted">กำลังโหลดรายชื่อ...</div>
    <template v-else>
      <p v-if="showHotelSelect && selectedHotelName" class="admin-list-label">แอดมินของ {{ selectedHotelName }}</p>
      <ul v-if="admins.length" class="admin-list">
        <li v-for="row in admins" :key="row.id" class="admin-row">
          <div class="admin-meta">
            <strong>{{ row.name }}</strong>
            <span class="muted">{{ row.login || row.provider }}</span>
            <span v-if="row.id === currentUserId" class="tag">คุณ</span>
            <span v-if="row.is_super_admin" class="tag">แพลตฟอร์ม</span>
          </div>
          <button
            v-if="canRemove(row)"
            class="btn btn-outline-danger btn-sm"
            type="button"
            :disabled="Boolean(removingId)"
            @click="removeAdmin(row)"
          >
            {{ removingId === row.id ? 'กำลังถอด...' : 'ถอด' }}
          </button>
        </li>
      </ul>
      <p v-else class="muted">ยังไม่มีแอดมินสาขานี้</p>
    </template>
  </div>
</template>

<style scoped>
.admins-panel { display: flex; flex-direction: column; gap: var(--space-3); }
.muted { color: var(--color-text-muted); font-size: var(--text-sm); margin: 0; }
.success-msg { color: var(--color-success); font-size: var(--text-sm); margin: 0; }
.error-msg { color: var(--color-error); font-size: var(--text-sm); margin: 0; }
.admin-form { display: flex; flex-direction: column; gap: var(--space-2); }
.form-row { display: flex; flex-direction: column; gap: var(--space-1); }
.form-label { font-size: var(--text-sm); font-weight: 600; color: var(--color-text-secondary); }
.form-input {
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: var(--text-sm);
  background: var(--color-surface);
}
.admin-list-label { margin: 0; font-size: var(--text-label); font-weight: 600; color: var(--color-text-secondary); }
.admin-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-2); }
.admin-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--color-border);
}
.admin-meta { display: flex; flex-wrap: wrap; align-items: baseline; gap: var(--space-2); min-width: 0; }
.tag {
  font-size: var(--text-label);
  background: var(--color-surface-muted);
  padding: 1px 8px;
  border-radius: var(--radius-pill);
}
.btn-sm { min-height: 36px; padding: 0 var(--space-3); width: auto; }
.btn-outline-danger {
  background: transparent;
  border: 1px solid color-mix(in srgb, var(--color-error, #c0392b) 40%, transparent);
  color: var(--color-error, #c0392b);
}
@media (min-width: 720px) {
  .admin-form { display: grid; grid-template-columns: 1fr 1fr 1fr auto; align-items: end; gap: var(--space-2); }
  .admin-form--with-hotel { grid-template-columns: minmax(140px, 1fr) 1fr 1fr 1fr auto; }
}
</style>
