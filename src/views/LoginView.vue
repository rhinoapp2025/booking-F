<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useHotelStore } from '../stores/hotel'
import { useHotelRoute } from '../composables/useHotelRoute'
import BrandMark from '../components/BrandMark.vue'
import { apiMediaUrl } from '../utils/resolveUiImageUrl'
import { safeInternalPath } from '../utils/safeInternalPath'
import api from '../api/axios'

const route      = useRoute()
const router     = useRouter()
const auth       = useAuthStore()
const hotelStore = useHotelStore()
const { hotelSlug, hotelPath } = useHotelRoute()

const loginId      = ref('')
const password     = ref('')
const submitting   = ref(false)
const errorMessage = ref('')

const loginImageUrl = computed(() => apiMediaUrl(hotelStore.hotel?.login_image_url))

// ซ่อน OAuth LINE / Facebook ไว้ก่อน — เปิดใช้ค่อยใส่กลับใน providers
const providers = [
  // { key: 'line',     label: 'เข้าสู่ระบบด้วย LINE',     icon: 'L' },
  // { key: 'facebook', label: 'เข้าสู่ระบบด้วย Facebook', icon: 'f' },
]

const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
const loginLinks = computed(() =>
  providers.map((p) => ({
    ...p,
    href: `${apiBase}/api/auth/${p.key}?state=${encodeURIComponent(hotelSlug.value)}`,
  }))
)

function afterLoginPath() {
  return safeInternalPath(route.query.redirect, hotelPath('/bookings'))
}

onMounted(async () => {
  const tokenFromQuery = route.query.token
  if (tokenFromQuery) {
    auth.setToken(tokenFromQuery)
    try {
      await auth.fetchMe()
    } catch {
      // ignore
    }
    router.replace(afterLoginPath())
    return
  }
  if (auth.isLoggedIn) {
    router.replace(afterLoginPath())
  }
})

async function submitLogin() {
  errorMessage.value = ''
  const id = loginId.value.trim()
  const pw = password.value
  if (!id || !pw) {
    errorMessage.value = 'กรุณากรอกไอดีและรหัสผ่านให้ครบ'
    return
  }
  submitting.value = true
  try {
    const { data } = await api.post('/api/auth/login', { login_id: id, password: pw })
    auth.setToken(data.token)
    await auth.fetchMe()
    router.replace(afterLoginPath())
  } catch (err) {
    errorMessage.value = err?.response?.data?.error || 'เข้าสู่ระบบไม่สำเร็จ'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="login-page">
    <section class="card login-card">
      <img v-if="loginImageUrl" :src="loginImageUrl" alt="" class="login-hero" />
      <div class="login-brand">
        <BrandMark show-sparkle />
      </div>
      <h1 class="login-title">{{ hotelStore.hotelName || 'โรงแรม' }}</h1>
      <p class="muted login-sub">เข้าสู่ระบบเพื่อจองห้องพัก</p>

      <form class="phone-form" @submit.prevent="submitLogin">
        <div class="form-row">
          <label class="form-label">ไอดี</label>
          <input
            v-model="loginId"
            type="text"
            class="form-input"
            placeholder="ไอดีเข้าสู่ระบบ"
            autocomplete="username"
            required
          />
        </div>
        <div class="form-row">
          <label class="form-label">รหัสผ่าน</label>
          <input
            v-model="password"
            type="password"
            class="form-input"
            placeholder="รหัสผ่าน"
            autocomplete="current-password"
            required
          />
        </div>
        <p v-if="errorMessage" class="error-msg">{{ errorMessage }}</p>
        <button type="submit" class="btn btn-primary login-btn" :disabled="submitting">
          {{ submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ' }}
        </button>
        <p class="muted login-hint">ยังไม่มีบัญชี — กรอกไอดีและรหัสผ่านใหม่แล้วกดเข้าสู่ระบบเพื่อสมัครอัตโนมัติ</p>
      </form>

      <template v-if="loginLinks.length">
        <div class="divider"><span>หรือ</span></div>

        <div class="oauth-list">
          <a v-for="p in loginLinks" :key="p.key" :href="p.href" class="oauth-btn">
            <span class="oauth-icon">{{ p.icon }}</span>
            {{ p.label }}
          </a>
        </div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100svh;
  min-height: 100dvh;
  margin: 0;
  box-sizing: border-box;
  padding:
    max(var(--space-4), env(safe-area-inset-top, 0px))
    max(var(--page-padding-x), env(safe-area-inset-right, 0px))
    max(var(--space-4), env(safe-area-inset-bottom, 0px))
    max(var(--page-padding-x), env(safe-area-inset-left, 0px));
}

.login-card {
  --login-pad-x: var(--space-5);
  --login-pad-y: var(--space-6);
  width: min(100%, 420px);
  padding: var(--login-pad-y) var(--login-pad-x);
  overflow: hidden;
}

.login-hero {
  display: block;
  width: calc(100% + (var(--login-pad-x) * 2));
  max-width: none;
  height: clamp(120px, 28vw, 200px);
  margin: calc(var(--login-pad-y) * -1) calc(var(--login-pad-x) * -1) var(--space-4);
  object-fit: cover;
  object-position: center;
}

.login-brand { display: flex; justify-content: center; margin-bottom: var(--space-4); }
.login-title { font-size: var(--text-h1); font-weight: 700; text-align: center; margin: 0 0 var(--space-1); }
.login-sub   { text-align: center; margin: 0 0 var(--space-5); }
.phone-form  { display: flex; flex-direction: column; gap: var(--space-3); }
.login-hint  { margin: 0; font-size: var(--text-label); text-align: center; }
.form-row    { display: flex; flex-direction: column; gap: var(--space-1); }
.form-label  { font-size: var(--text-label); font-weight: 500; color: var(--color-text-secondary); }
.form-input  {
  width: 100%;
  min-width: 0;
  min-height: var(--touch-min);
  padding: var(--space-2) var(--space-3);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 16px;
  box-sizing: border-box;
}
.login-btn   { width: 100%; margin-top: var(--space-2); min-height: var(--btn-primary-height); }
.error-msg   { color: var(--color-danger, var(--color-error)); font-size: var(--text-sm); margin: 0; }
.divider     { display: flex; align-items: center; gap: var(--space-3); margin: var(--space-4) 0; color: var(--color-text-muted); font-size: var(--text-sm); }
.divider::before, .divider::after { content: ''; flex: 1; border-top: 1px solid var(--color-border); }
.oauth-list  { display: flex; flex-direction: column; gap: var(--space-2); }
.oauth-btn   {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  min-height: var(--touch-min);
  padding: var(--space-3) var(--space-4);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  text-decoration: none;
  color: var(--color-text-primary);
  background: var(--color-surface-elevated);
  font-size: var(--text-sm);
  transition: border-color var(--transition), background var(--transition);
}
.oauth-btn:hover { border-color: var(--color-primary); background: var(--color-primary-light); }
.oauth-icon  { width: 24px; height: 24px; border-radius: 50%; background: var(--color-accent); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 13px; flex-shrink: 0; }

@media (max-width: 380px) {
  .login-card {
    --login-pad-x: var(--space-4);
    --login-pad-y: var(--space-4);
  }
  .login-title { font-size: var(--text-h2); }
  .login-sub { margin-bottom: var(--space-4); }
}

@media (min-width: 768px) {
  .login-card {
    --login-pad-x: var(--space-6);
    --login-pad-y: var(--space-6);
    width: min(100%, 440px);
  }
  .login-hero { height: clamp(160px, 22vw, 240px); }
}

@media (max-height: 700px) {
  .login-page {
    align-items: flex-start;
  }
  .login-hero { height: 112px; }
  .login-brand { margin-bottom: var(--space-3); }
  .login-sub { margin-bottom: var(--space-3); }
}
</style>
