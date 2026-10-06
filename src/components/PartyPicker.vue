<script setup>
import { ref } from 'vue'

const adults = defineModel('adults', { type: Number, default: 1 })
const children = defineModel('children', { type: Number, default: 0 })
const rooms = defineModel('rooms', { type: Number, default: 1 })

const MAX_ROOMS = 10
const MAX_GUESTS = 30
const open = ref(false)

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

function changeRooms(delta) {
  const next = clamp(Number(rooms.value) + delta, 1, MAX_ROOMS)
  rooms.value = next
  if (Number(adults.value) < next) adults.value = next
}

function changeAdults(delta) {
  const min = Math.max(1, Number(rooms.value) || 1)
  adults.value = clamp(Number(adults.value) + delta, min, MAX_GUESTS)
}

function changeChildren(delta) {
  children.value = clamp(Number(children.value) + delta, 0, MAX_GUESTS)
}

</script>

<template>
  <div class="party-picker">
    <button
      type="button"
      class="party-trigger"
      :aria-expanded="open"
      @click.stop="open = !open"
    >
      <i class="ti ti-users party-trigger-icon" aria-hidden="true"></i>
      <span class="party-trigger-text">
        <span class="party-trigger-main">ผู้ใหญ่ {{ adults }} คน<template v-if="children"> · เด็ก {{ children }}</template></span>
        <span class="party-trigger-sub">{{ rooms }} ห้อง</span>
      </span>
      <i class="ti ti-chevron-down party-chevron" :class="{ open }" aria-hidden="true"></i>
    </button>

    <div v-if="open" class="party-pop" @click.stop>
      <div class="party-row">
        <span class="party-label">ห้อง</span>
        <div class="party-step">
          <button type="button" class="step-btn" :disabled="rooms <= 1" aria-label="ลดจำนวนห้อง" @click="changeRooms(-1)">−</button>
          <span class="step-value">{{ rooms }}</span>
          <button type="button" class="step-btn" :disabled="rooms >= MAX_ROOMS" aria-label="เพิ่มจำนวนห้อง" @click="changeRooms(1)">+</button>
        </div>
      </div>
      <div class="party-row">
        <span class="party-label">
          ผู้ใหญ่
          <small>อายุ 18 ปีขึ้นไป</small>
        </span>
        <div class="party-step">
          <button type="button" class="step-btn" :disabled="adults <= rooms" aria-label="ลดผู้ใหญ่" @click="changeAdults(-1)">−</button>
          <span class="step-value">{{ adults }}</span>
          <button type="button" class="step-btn" :disabled="adults >= MAX_GUESTS" aria-label="เพิ่มผู้ใหญ่" @click="changeAdults(1)">+</button>
        </div>
      </div>
      <div class="party-row">
        <span class="party-label">
          เด็ก
          <small>อายุ 0-17</small>
        </span>
        <div class="party-step">
          <button type="button" class="step-btn" :disabled="children <= 0" aria-label="ลดเด็ก" @click="changeChildren(-1)">−</button>
          <span class="step-value">{{ children }}</span>
          <button type="button" class="step-btn" :disabled="children >= MAX_GUESTS" aria-label="เพิ่มเด็ก" @click="changeChildren(1)">+</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.party-picker { position: relative; min-width: 0; }
.party-trigger {
  width: 100%;
  min-height: var(--btn-primary-height, 48px);
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--color-border, #e6e8ee);
  border-radius: 16px;
  background: #fff;
  color: var(--color-text, #1a2332);
  text-align: left;
  cursor: pointer;
}
.party-trigger-icon { font-size: 22px; color: var(--color-text, #1a2332); }
.party-trigger-text { display: flex; flex-direction: column; line-height: 1.2; flex: 1; min-width: 0; }
.party-trigger-main { font-weight: 700; font-size: 15px; }
.party-trigger-sub { font-size: 13px; color: var(--color-text-muted, #6b7280); }
.party-chevron { transition: transform 0.15s ease; }
.party-chevron.open { transform: rotate(180deg); }
.party-pop {
  position: absolute;
  z-index: 30;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  min-width: 280px;
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 12px 40px rgba(16, 24, 40, 0.16);
  padding: 8px 16px 12px;
}
.party-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid #f0f1f4;
}
.party-row:last-child { border-bottom: 0; }
.party-label { display: flex; flex-direction: column; font-weight: 700; font-size: 16px; }
.party-label small { font-weight: 500; font-size: 13px; color: var(--color-text-muted, #6b7280); }
.party-step { display: flex; align-items: center; gap: 14px; }
.step-btn {
  width: 32px;
  height: 32px;
  border-radius: 999px;
  border: 1.5px solid #d7dbe3;
  background: #fff;
  color: #111;
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.step-btn:disabled { opacity: 0.35; cursor: default; }
.step-value { min-width: 18px; text-align: center; font-weight: 600; font-size: 16px; }
</style>
