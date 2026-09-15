<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import api from '../api/axios'
import BottomNav from '../components/BottomNav.vue'
import AccountMenuDrawer from '../components/AccountMenuDrawer.vue'
import ChatImage from '../components/ChatImage.vue'
import { useAuthStore } from '../stores/auth'
import { useHotelRoute } from '../composables/useHotelRoute'
import { compressImage } from '../utils/compressChatImage'

const auth   = useAuthStore()
const route  = useRoute()
const { hotelSlug } = useHotelRoute()
const accountMenuRef = ref(null)

const isAdminMode = computed(() => auth.canAccessHotelAdmin(hotelSlug.value))
const isSystemThread = computed(() => {
  const found = threads.value.find((t) => sameId(t.user_id, activeThread.value))
  return Boolean(found?.is_system)
})

const messages    = ref([])
const draft       = ref('')
const loading     = ref(true)
const sending     = ref(false)
const errorMsg    = ref('')
const chatRef     = ref(null)
const fileInputRef = ref(null)

const threads     = ref([])
const activeThread = ref(null)
const loadingThreads = ref(false)

function queryThreadId() {
  const q = route.query.userId || route.query.relatedUserId || route.query.user_id
  const raw = Array.isArray(q) ? q[0] : q
  return raw ? String(raw) : null
}

function sameId(a, b) {
  return String(a || '') === String(b || '')
}

function isNearBottom() {
  const el = chatRef.value
  if (!el) return true
  return el.scrollHeight - el.scrollTop - el.clientHeight < 96
}

async function fetchMessages(userId = null, { silent = false, forceScroll = false } = {}) {
  if (!silent) loading.value = true
  try {
    const params = userId ? { user_id: userId } : {}
    const stick = forceScroll || isNearBottom()
    const { data } = await api.get(`/api/chat/${hotelSlug.value}/messages`, { params })
    messages.value = data
    if (!silent) loading.value = false
    if (!silent || stick || forceScroll) {
      await nextTick()
      scrollToBottom({ instant: !silent || forceScroll })
      // layout อีกรอบหลังเรนเดอร์ฟองข้อความ
      requestAnimationFrame(() => scrollToBottom({ instant: true }))
    }
  } catch {
    errorMsg.value = 'โหลดข้อความไม่สำเร็จ'
    if (!silent) loading.value = false
  } finally {
    if (!silent) loading.value = false
  }
}

async function fetchThreads({ silent = false } = {}) {
  if (!silent) loadingThreads.value = true
  try {
    const { data } = await api.get(`/api/chat/${hotelSlug.value}/threads`)
    threads.value = data
  } finally {
    if (!silent) loadingThreads.value = false
  }
}

async function sendMessage() {
  const text = draft.value.trim()
  if (!text || sending.value) return
  if (isAdminMode.value && !activeThread.value) {
    errorMsg.value = 'เลือกแชทก่อนส่งข้อความ'
    return
  }
  if (isSystemThread.value) {
    errorMsg.value = 'แชทระบบเป็นแจ้งเตือนอย่างเดียว'
    return
  }
  sending.value = true
  errorMsg.value = ''
  try {
    await api.post(`/api/chat/${hotelSlug.value}/messages`, {
      message: text,
      ...(isAdminMode.value && activeThread.value ? { user_id: activeThread.value } : {}),
    })
    draft.value = ''
    await fetchMessages(activeThread.value, { silent: true, forceScroll: true })
    if (isAdminMode.value) await fetchThreads({ silent: true })
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'ส่งข้อความไม่สำเร็จ'
  } finally {
    sending.value = false
  }
}

async function handleImageFile(e) {
  const file = e.target.files?.[0]
  if (!file) return
  if (isAdminMode.value && !activeThread.value) {
    errorMsg.value = 'เลือกแชทก่อนส่งรูป'
    if (fileInputRef.value) fileInputRef.value.value = ''
    return
  }
  if (isSystemThread.value) {
    errorMsg.value = 'แชทระบบเป็นแจ้งเตือนอย่างเดียว'
    if (fileInputRef.value) fileInputRef.value.value = ''
    return
  }
  try {
    const compressed = await compressImage(file, { maxWidth: 1024, quality: 0.8 })
    await api.post(`/api/chat/${hotelSlug.value}/messages`, {
      imageData: compressed.base64,
      imageMime: compressed.mime,
      ...(isAdminMode.value && activeThread.value ? { user_id: activeThread.value } : {}),
    })
    await fetchMessages(activeThread.value, { silent: true, forceScroll: true })
    if (isAdminMode.value) await fetchThreads({ silent: true })
  } catch (err) {
    errorMsg.value = err?.response?.data?.error || 'ส่งรูปไม่สำเร็จ'
  }
  if (fileInputRef.value) fileInputRef.value.value = ''
}

function scrollToBottom({ instant = false } = {}) {
  const el = chatRef.value
  if (!el) return
  const top = el.scrollHeight
  if (instant) el.scrollTop = top
  else el.scrollTo({ top, behavior: 'smooth' })
}

function isMine(msg) {
  if (msg.sender_role === 'system') return false
  if (isAdminMode.value) return msg.sender_role === 'admin'
  return msg.sender_role === 'customer'
}

function bubbleSide(msg) {
  if (isMine(msg)) return 'mine'
  return msg.sender_role === 'system' ? 'system' : 'theirs'
}

function formatTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

const activeThreadName = computed(() => {
  const found = threads.value.find((t) => sameId(t.user_id, activeThread.value))
  return found?.user_name || ''
})

const headerTitle = computed(() => {
  if (isAdminMode.value && activeThread.value && activeThreadName.value) {
    return activeThreadName.value
  }
  return isAdminMode.value ? 'แชทแอดมิน' : 'แชทกับโรงแรม'
})

const canCompose = computed(() => {
  if (!isAdminMode.value) return true
  if (!activeThread.value || isSystemThread.value) return false
  return true
})

function selectThread(userId) {
  activeThread.value = userId ? String(userId) : null
  errorMsg.value = ''
  fetchMessages(activeThread.value, { forceScroll: true })
}

function closeThread() {
  activeThread.value = null
  messages.value = []
  loading.value = false
  errorMsg.value = ''
}

async function bootstrapChat() {
  messages.value = []
  threads.value = []
  errorMsg.value = ''
  loading.value = true
  if (isAdminMode.value) {
    activeThread.value = queryThreadId()
    await fetchThreads()
    if (activeThread.value) await fetchMessages(activeThread.value)
    else {
      messages.value = []
      loading.value = false
    }
  } else {
    activeThread.value = null
    await fetchMessages()
  }
}

let pollTimer = null
onMounted(() => {
  bootstrapChat()
  pollTimer = setInterval(() => {
    if (isAdminMode.value) {
      fetchThreads({ silent: true })
      if (activeThread.value) fetchMessages(activeThread.value, { silent: true })
    } else {
      fetchMessages(null, { silent: true })
    }
  }, 10000)
})
onUnmounted(() => clearInterval(pollTimer))

watch(hotelSlug, () => {
  bootstrapChat()
})

watch(
  () => [route.query.userId, route.query.relatedUserId, route.query.user_id, isAdminMode.value],
  () => {
    if (!isAdminMode.value) return
    const q = queryThreadId()
    if (q && !sameId(q, activeThread.value)) selectThread(q)
  }
)
</script>

<template>
  <div class="chat-page app-page" :class="{ 'is-admin-chat': isAdminMode, 'is-thread-open': isAdminMode && activeThread }">
    <AccountMenuDrawer ref="accountMenuRef" />

    <header class="page-header">
      <button
        v-if="isAdminMode && activeThread"
        type="button"
        class="icon-btn chat-back"
        title="กลับรายการแชท"
        @click="closeThread"
      >
        <i class="ti ti-arrow-left"></i>
      </button>
      <h1 class="page-title">{{ headerTitle }}</h1>
      <button type="button" class="icon-btn" @click="accountMenuRef?.open()">
        <i class="ti ti-user-circle"></i>
      </button>
    </header>

    <div class="chat-layout">
      <aside v-if="isAdminMode" class="thread-list">
        <div v-if="loadingThreads" class="thread-loading"><i class="ti ti-loader-2 spin"></i></div>
        <ul v-else class="thread-ul">
          <li
            v-for="t in threads"
            :key="t.user_id"
            :class="['thread-item', { active: sameId(activeThread, t.user_id), system: t.is_system }]"
            @click="selectThread(t.user_id)"
          >
            <div class="thread-avatar" :class="{ system: t.is_system }">
              <i v-if="t.is_system" class="ti ti-bell"></i>
              <template v-else>{{ (t.user_name || '?').slice(0, 1) }}</template>
            </div>
            <div class="thread-body">
              <div class="thread-name">{{ t.user_name }}</div>
              <div class="thread-preview muted">{{ t.last_message }}</div>
            </div>
            <span v-if="t.unread > 0" class="thread-badge">{{ t.unread > 99 ? '99+' : t.unread }}</span>
          </li>
          <li v-if="!threads.length" class="thread-empty muted">ยังไม่มีแชท</li>
        </ul>
      </aside>

      <main class="chat-main">
        <div ref="chatRef" class="chat-messages">
          <div v-if="loading" class="state-card"><i class="ti ti-loader-2 spin state-card-icon"></i></div>
          <template v-else>
            <div
              v-for="msg in messages"
              :key="msg.id"
              :class="['chat-bubble-wrap', bubbleSide(msg)]"
            >
              <div class="chat-bubble">
                <ChatImage v-if="msg.image_url" :filename="msg.image_url" />
                <p v-else class="bubble-text">{{ msg.body || msg.message }}</p>
                <span class="bubble-time">{{ formatTime(msg.created_at) }}</span>
              </div>
            </div>
            <div v-if="isAdminMode && !activeThread" class="state-card empty-chat">
              <i class="ti ti-message-circle state-card-icon"></i>
              <p class="state-card-title">เลือกแชทจากรายการเพื่อตอบแขก</p>
            </div>
            <div v-else-if="!messages.length" class="state-card empty-chat">
              <i class="ti ti-bell state-card-icon" v-if="isSystemThread"></i>
              <i v-else class="ti ti-message-circle state-card-icon"></i>
              <p class="state-card-title">{{ isSystemThread ? 'ยังไม่มีการแจ้งเตือน' : 'ยังไม่มีข้อความ' }}</p>
            </div>
          </template>
        </div>

        <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

        <div v-if="canCompose" class="chat-input-bar">
          <button type="button" class="icon-btn" :disabled="isAdminMode && !activeThread" @click="fileInputRef?.click()">
            <i class="ti ti-photo"></i>
          </button>
          <input ref="fileInputRef" type="file" accept="image/*" class="hidden" @change="handleImageFile" />
          <input
            v-model="draft"
            class="chat-input"
            placeholder="พิมพ์ข้อความ..."
            :disabled="isAdminMode && !activeThread"
            @keydown.enter.exact.prevent="sendMessage"
          />
          <button
            type="button"
            class="icon-btn send-btn"
            :disabled="sending || !draft.trim() || (isAdminMode && !activeThread)"
            @click="sendMessage"
          >
            <i class="ti ti-send"></i>
          </button>
        </div>
      </main>
    </div>

    <BottomNav active="chat" />
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  max-height: 100dvh;
  overflow: hidden;
  padding-bottom: var(--bottom-nav-total, 64px);
  box-sizing: border-box;
}
.page-header {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-3) var(--page-padding-x);
  flex-shrink: 0;
}
.page-title {
  font-size: var(--text-h2);
  font-weight: 700;
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chat-layout {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
.thread-list {
  width: 100%;
  overflow-y: auto;
  flex-shrink: 0;
  background: var(--color-surface);
}
.thread-ul { list-style: none; margin: 0; padding: 0; }
.thread-item {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--page-padding-x);
  border-bottom: 1px solid var(--color-border);
  cursor: pointer;
  position: relative;
}
.thread-item.active { background: var(--color-primary-light); }
.thread-item.system { background: color-mix(in srgb, var(--color-primary-light) 55%, var(--color-surface)); }
.thread-item.system.active { background: var(--color-primary-light); }
.thread-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary-light);
  color: var(--color-primary);
  font-weight: 700;
  font-size: var(--text-sm);
}
.thread-avatar.system {
  background: var(--color-primary);
  color: #fff;
  font-size: 18px;
}
.thread-body { min-width: 0; flex: 1; padding-right: 28px; }
.thread-name { font-size: var(--text-sm); font-weight: 600; }
.thread-preview {
  font-size: var(--text-label);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  white-space: pre-wrap;
  margin-top: 2px;
}
.thread-badge {
  position: absolute;
  top: var(--space-3);
  right: var(--page-padding-x);
  background: var(--color-error);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  border-radius: var(--radius-pill);
  padding: 0 6px;
  min-width: 18px;
  text-align: center;
  line-height: 18px;
}
.thread-empty { padding: var(--space-6) var(--page-padding-x); font-size: var(--text-sm); list-style: none; }
.thread-loading { display: flex; justify-content: center; padding: var(--space-6); }

.chat-main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  background: var(--color-background);
}
.is-admin-chat .chat-main { display: none; }
.is-admin-chat.is-thread-open .chat-main { display: flex; }
.is-admin-chat.is-thread-open .thread-list { display: none; }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-3) var(--page-padding-x);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  align-items: stretch;
}
.chat-bubble-wrap {
  display: flex;
  width: 100%;
  justify-content: flex-start;
}
.chat-bubble-wrap.mine { justify-content: flex-end; }
.chat-bubble-wrap.theirs,
.chat-bubble-wrap.system { justify-content: flex-start; }

.chat-bubble {
  max-width: min(82%, 22rem);
  padding: var(--space-2) var(--space-3);
  border-radius: 16px 16px 16px 4px;
  background: var(--color-surface-elevated);
  box-shadow: var(--shadow-sm);
  word-break: break-word;
}
.chat-bubble-wrap.mine .chat-bubble {
  background: var(--color-primary);
  color: #fff;
  border-radius: 16px 16px 4px 16px;
}
.chat-bubble-wrap.system .chat-bubble {
  background: var(--color-surface-muted, #f4f4f5);
  color: var(--color-text-secondary);
  box-shadow: none;
  white-space: pre-wrap;
}
.bubble-text { margin: 0; font-size: var(--text-sm); line-height: 1.5; }
.bubble-time { font-size: 10px; opacity: 0.65; display: block; text-align: right; margin-top: 2px; }

.chat-input-bar {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) var(--page-padding-x) calc(var(--space-2) + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  flex-shrink: 0;
}
.chat-input {
  flex: 1;
  min-width: 0;
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-pill);
  font-family: inherit;
  font-size: var(--text-sm);
  background: var(--color-surface-elevated);
  outline: none;
}
.send-btn:disabled,
.chat-input:disabled,
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.hidden { display: none; }
.error-msg { color: var(--color-danger); font-size: var(--text-sm); padding: 0 var(--page-padding-x); }
.empty-chat { padding: var(--space-6) 0; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

@media (min-width: 900px) {
  .chat-page { padding-bottom: 0; }
  .chat-back { display: none !important; }
  .is-admin-chat .thread-list {
    display: block;
    width: 300px;
    border-right: 1px solid var(--color-border);
  }
  .is-admin-chat.is-thread-open .thread-list { display: block; }
  .is-admin-chat .chat-main { display: flex; }
  .chat-bubble { max-width: min(70%, 26rem); }
}
</style>
