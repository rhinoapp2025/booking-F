<script setup>
import { computed, ref, watch } from 'vue'
import api from '../api/axios'
import { compressImage } from '../utils/compressChatImage'

const props = defineProps({
  open: { type: Boolean, default: false },
  hotelSlug: { type: String, required: true },
  booking: { type: Object, default: null },
})

const emit = defineEmits(['close', 'submitted'])

const COMMENT_MAX = 100
const rating = ref(5)
const comment = ref('')
const imagePreview = ref('')
const imageData = ref('')
const imageMime = ref('')
const busy = ref(false)
const errorMsg = ref('')
const fileInputRef = ref(null)

const commentLeft = computed(() => COMMENT_MAX - String(comment.value || '').length)

watch(
  () => props.open,
  (on) => {
    if (!on) return
    rating.value = 5
    comment.value = ''
    imagePreview.value = ''
    imageData.value = ''
    imageMime.value = ''
    errorMsg.value = ''
    busy.value = false
    if (fileInputRef.value) fileInputRef.value.value = ''
  },
)

function setRating(n) {
  rating.value = n
}

function close() {
  if (busy.value) return
  emit('close')
}

async function onPickImage(e) {
  const file = e.target.files?.[0]
  if (!file) return
  errorMsg.value = ''
  try {
    const compressed = await compressImage(file, { maxWidth: 1280, quality: 0.82 })
    imageData.value = compressed.base64
    imageMime.value = compressed.mime
    imagePreview.value = `data:${compressed.mime};base64,${compressed.base64}`
  } catch (err) {
    errorMsg.value = err?.message || 'เลือกรูปไม่สำเร็จ'
    imageData.value = ''
    imageMime.value = ''
    imagePreview.value = ''
  }
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function clearImage() {
  imageData.value = ''
  imageMime.value = ''
  imagePreview.value = ''
}

async function submit() {
  if (!props.booking?.id || busy.value) return
  const text = String(comment.value || '').trim()
  if (text.length > COMMENT_MAX) {
    errorMsg.value = `ข้อความไม่เกิน ${COMMENT_MAX} ตัวอักษร`
    return
  }
  if (!rating.value || rating.value < 1 || rating.value > 5) {
    errorMsg.value = 'เลือกจำนวนดาว'
    return
  }
  busy.value = true
  errorMsg.value = ''
  try {
    await api.post(`/api/reviews/${props.hotelSlug}`, {
      booking_id: props.booking.id,
      rating: rating.value,
      comment: text || undefined,
      ...(imageData.value
        ? { imageData: imageData.value, imageMime: imageMime.value }
        : {}),
    })
    emit('submitted')
    emit('close')
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'ส่งรีวิวไม่สำเร็จ'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="review-backdrop" @click.self="close">
      <div class="review-sheet" role="dialog" aria-modal="true" aria-label="เขียนรีวิว">
        <div class="review-head">
          <h2 class="review-title">รีวิวการเข้าพัก</h2>
          <button type="button" class="review-close" :disabled="busy" aria-label="ปิด" @click="close">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>

        <div class="review-body">
          <p v-if="booking" class="review-stay">
            {{ booking.check_in_date }} → {{ booking.check_out_date }}
          </p>

          <div class="review-field">
            <p class="review-label">ให้คะแนน</p>
            <div class="star-row" role="radiogroup" aria-label="จำนวนดาว">
              <button
                v-for="n in 5"
                :key="n"
                type="button"
                class="star-btn"
                :class="{ on: n <= rating }"
                :aria-checked="n === rating"
                :aria-label="`${n} ดาว`"
                role="radio"
                @click="setRating(n)"
              >★</button>
            </div>
          </div>

          <div class="review-field">
            <p class="review-label">
              รูปภาพ
              <span class="review-hint">ไม่บังคับ · JPG/PNG/WebP</span>
            </p>
            <input
              ref="fileInputRef"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              class="review-file-hidden"
              @change="onPickImage"
            />
            <div v-if="imagePreview" class="review-image-preview">
              <img :src="imagePreview" alt="รูปรีวิว" />
              <button type="button" class="btn btn-outline btn-sm" :disabled="busy" @click="clearImage">ลบรูป</button>
            </div>
            <button
              v-else
              type="button"
              class="btn btn-outline review-upload-btn"
              :disabled="busy"
              @click="fileInputRef?.click()"
            >
              <i class="ti ti-photo" aria-hidden="true"></i>
              อัปโหลดรูป
            </button>
          </div>

          <div class="review-field">
            <p class="review-label">
              ข้อความ
              <span class="review-hint">ไม่เกิน {{ COMMENT_MAX }} ตัวอักษร</span>
            </p>
            <textarea
              v-model="comment"
              class="form-input review-textarea"
              rows="3"
              :maxlength="COMMENT_MAX"
              placeholder="เล่าประสบการณ์สั้นๆ"
              :disabled="busy"
            />
            <p class="char-count">เหลือ {{ commentLeft }} ตัวอักษร</p>
          </div>

          <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>
        </div>

        <div class="review-foot">
          <button type="button" class="btn btn-outline" :disabled="busy" @click="close">ยกเลิก</button>
          <button type="button" class="btn btn-primary" :disabled="busy" @click="submit">
            {{ busy ? 'กำลังส่ง...' : 'ส่งรีวิว' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.review-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding: 0;
  background: rgba(0, 0, 0, 0.5);
  box-sizing: border-box;
}

.review-sheet {
  width: 100%;
  max-width: 480px;
  max-height: min(90vh, 720px);
  display: flex;
  flex-direction: column;
  background: var(--color-surface, #fff);
  border-radius: var(--radius-card, 16px) var(--radius-card, 16px) 0 0;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.18);
  overflow: hidden;
}

.review-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  border-bottom: 1px solid var(--color-border, #e5e5e5);
  flex-shrink: 0;
}

.review-title {
  margin: 0;
  font-size: var(--text-h3, 1.125rem);
  font-weight: 700;
  color: var(--color-text-primary, #2d2424);
}

.review-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1px solid var(--color-border, #e5e5e5);
  border-radius: var(--radius-md, 10px);
  background: var(--color-surface-elevated, #fff);
  color: var(--color-text-secondary, #6b5f5b);
  cursor: pointer;
  flex-shrink: 0;
}

.review-close:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.review-body {
  padding: var(--space-4, 16px);
  display: flex;
  flex-direction: column;
  gap: var(--space-4, 16px);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.review-stay {
  margin: 0;
  font-size: var(--text-sm, 0.875rem);
  color: var(--color-text-muted, #9a8e89);
}

.review-field {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
}

.review-label {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: var(--text-sm, 0.875rem);
  font-weight: 600;
  color: var(--color-text-primary, #2d2424);
}

.review-hint {
  font-size: var(--text-label, 0.75rem);
  font-weight: 500;
  color: var(--color-text-muted, #9a8e89);
}

.star-row {
  display: flex;
  gap: 4px;
}

.star-btn {
  border: none;
  background: transparent;
  padding: 2px 4px;
  cursor: pointer;
  color: #cfc8c2;
  font-size: 2rem;
  line-height: 1;
  font-family: inherit;
}

.star-btn.on {
  color: #d97706;
}

.review-file-hidden {
  display: none;
}

.review-upload-btn {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.review-image-preview {
  display: flex;
  flex-direction: column;
  gap: var(--space-2, 8px);
  align-items: flex-start;
}

.review-image-preview img {
  width: 100%;
  max-height: 180px;
  object-fit: cover;
  border-radius: var(--radius-md, 10px);
  border: 1px solid var(--color-border, #e5e5e5);
}

.review-textarea {
  resize: vertical;
  min-height: 88px;
}

.char-count {
  margin: 0;
  font-size: var(--text-label, 0.75rem);
  color: var(--color-text-muted, #9a8e89);
  text-align: right;
}

.review-foot {
  display: flex;
  gap: var(--space-3, 12px);
  padding: var(--space-4, 16px);
  border-top: 1px solid var(--color-border, #e5e5e5);
  flex-shrink: 0;
}

.review-foot .btn {
  flex: 1;
}

@media (min-width: 720px) {
  .review-backdrop {
    align-items: center;
    padding: var(--space-4, 16px);
  }

  .review-sheet {
    border-radius: var(--radius-card, 16px);
  }
}
</style>
