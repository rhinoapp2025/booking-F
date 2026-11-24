<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useHotelRoute } from '../composables/useHotelRoute'
import { getPublicContent, bookingLink, img } from '../bookingSite/api.js'
import { applyTheme, clearTheme } from '../bookingSite/theme.js'
import { defaultNav, isSectionVisible, navHref, pageSectionOrder } from '../bookingSite/sections.js'
import { hasShopMapUrl, resolveShopMapEmbedUrl } from '../utils/shopMapEmbed'
import LoopCarousel from '../bookingSite/LoopCarousel.vue'
import { serviceIcon } from '../bookingSite/serviceIcons.js'
import '../bookingSite/style.css'

const { hotelSlug: shopSlug } = useHotelRoute()
const rootEl = ref(null)
const c = ref(null)
const cur = ref(0)
const menuOpen = ref(false)
const loadError = ref('')
const paused = ref(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion:reduce)').matches)
let timer
let prevTitle = ''

const toLocalYmd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
function addDays(ymd, days) {
  const [y, m, d] = String(ymd || '').split('-').map(Number)
  const date = new Date(y, (m || 1) - 1, d || 1)
  date.setDate(date.getDate() + days)
  return toLocalYmd(date)
}
const todayYmd = computed(() => toLocalYmd(new Date()))
const checkIn = ref(todayYmd.value)
const checkOut = ref(addDays(todayYmd.value, 1))
const adults = ref(1)
const children = ref(0)
const rooms = ref(1)
const minCheckOut = computed(() => addDays(checkIn.value || todayYmd.value, 1))

watch(checkIn, (value) => {
  if (!value) return
  if (!checkOut.value || checkOut.value <= value) checkOut.value = addDays(value, 1)
})
watch(rooms, (value) => {
  const count = Math.max(1, Number(value) || 1)
  if (adults.value < count) adults.value = count
})

const h = computed(() => c.value.hero[cur.value] || c.value.hero[0])
const tg = computed(() => (c.value.site.newTab ? '_blank' : '_self'))
const showHeroBooking = computed(() => h.value?.showBooking !== false)
const heroBtnHref = computed(() => {
  const link = (h.value?.link || '').trim()
  return link || book()
})
const heroBtnLabel = computed(() => (h.value?.button || '').trim())
const slideCopyStyle = computed(() => {
  const s = {}
  const t = (h.value?.titleColor || '').trim()
  const x = (h.value?.textColor || '').trim()
  if (t) s['--slide-title'] = t
  if (x) s['--slide-lead'] = x
  return s
})
const bg = u => (u ? { background: `url("${img(u)}") center/cover` } : null)
function youtubeId(url) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') return parsed.pathname.slice(1).split('/')[0]
    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (parsed.pathname.startsWith('/embed/')) return parsed.pathname.split('/')[2] || ''
      if (parsed.pathname.startsWith('/shorts/')) return parsed.pathname.split('/')[2] || ''
      return parsed.searchParams.get('v') || ''
    }
  } catch {
    return ''
  }
  return ''
}
function slideVideo(slide) {
  const value = String(slide?.video || '').trim()
  if (!value || slide?.showVideo === false) return null
  const id = youtubeId(value)
  if (id) {
    return { kind: 'youtube', src: `https://www.youtube.com/embed/${id}?autoplay=1&loop=1&playlist=${id}&controls=1&rel=0&playsinline=1&modestbranding=1&enablejsapi=1` }
  }
  return { kind: 'file', src: img(value) }
}
function syncSlideVideos() {
  document.querySelectorAll('.booking-site .slide-video').forEach((el) => {
    const active = el.closest('.slide')?.classList.contains('on')
    el.muted = false
    el.volume = 1
    if (active) el.play().catch(() => {})
    else el.pause()
  })
  document.querySelectorAll('.booking-site .slide-embed').forEach((frame) => {
    frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*')
    frame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'playVideo', args: [] }), '*')
  })
}
const showImg = o => o?.showImage !== false
const itemBg = o => (showImg(o) && o?.image ? bg(o.image) : null)
const promoBoxStyle = p => {
  const s = { ...itemBg(p) }
  const t = (p?.titleColor || '').trim()
  const x = (p?.textColor || '').trim()
  if (t) s['--promo-title'] = t
  if (x) s['--promo-text'] = x
  return s
}
const roomCardStyle = r => {
  const s = {}
  const t = (r?.titleColor || '').trim()
  const x = (r?.textColor || '').trim()
  const l = (r?.linkColor || '').trim()
  if (t) s['--room-title'] = t
  if (x) s['--room-text'] = x
  if (l) s['--room-link'] = l
  return Object.keys(s).length ? s : null
}
function stayQuery() {
  return {
    checkIn: checkIn.value,
    checkOut: checkOut.value,
    adults: Math.max(1, Number(adults.value) || 1),
    children: Math.max(0, Number(children.value) || 0),
    rooms: Math.max(1, Number(rooms.value) || 1),
  }
}
const book = link => bookingLink(link || c.value.site.bookingUrl, stayQuery())

const trim = v => String(v || '').trim()
const shopAddress = computed(() => [trim(c.value?.site?.address), trim(c.value?.location?.addressDetail)].filter(Boolean).join('\n'))
const shopPhone = computed(() => trim(c.value?.site?.phone))
const shopEmail = computed(() => trim(c.value?.site?.email))
const ownMapUrl = computed(() => {
  const u = trim(c.value?.about?.mapUrl)
  return hasShopMapUrl(u) ? u : ''
})
const mapUrl = computed(() => {
  if (ownMapUrl.value) return ownMapUrl.value
  const u = trim(c.value?.location?.mapUrl)
  return hasShopMapUrl(u) ? u : ''
})
const mapEmbed = computed(() => (ownMapUrl.value
  ? resolveShopMapEmbedUrl(ownMapUrl.value, trim(c.value.about.mapEmbedUrl))
  : resolveShopMapEmbedUrl(mapUrl.value, trim(c.value?.location?.embedUrl))))
const aboutMedia = computed(() => {
  if (!c.value?.about) return null
  if (c.value.about.showMap !== false && mapEmbed.value) return 'map'
  if (showImg(c.value.about)) return 'image'
  return null
})
function search() {
  if (!checkIn.value || !checkOut.value || checkOut.value <= checkIn.value) {
    checkOut.value = addDays(checkIn.value || todayYmd.value, 1)
  }
  const u = book()
  if (c.value.site.newTab) window.open(u, '_blank', 'noopener')
  else location.href = u
}

const menuItems = computed(() => {
  if (!c.value) return []
  const list = c.value.nav?.length ? c.value.nav : defaultNav
  return list.filter(n => n.show !== false && n.label?.trim() && isSectionVisible(c.value, n.section, showImg))
})
const pageSections = computed(() => (c.value ? pageSectionOrder(c.value.nav) : []))

function play() {
  clearInterval(timer)
  if (!paused.value && c.value?.hero?.length) {
    timer = setInterval(() => (cur.value = (cur.value + 1) % c.value.hero.length), 6000)
  }
}
const toggle = () => { paused.value = !paused.value; play() }
const pick = i => { cur.value = i; paused.value = true; play() }
watch(cur, () => nextTick(syncSlideVideos))

function scrollToId(id) {
  const el = document.getElementById(id)
  if (!el) return false
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  return true
}

function onMenuClick(section, event) {
  menuOpen.value = false
  if (section === 'book') return
  const id = String(navHref(section) || '').replace(/^#/, '')
  if (!id || !scrollToId(id)) return
  event?.preventDefault()
  const next = `#${id}`
  if (location.hash !== next) history.pushState(null, '', next)
}

function scrollToHash() {
  const id = decodeURIComponent(String(location.hash || '').replace(/^#/, ''))
  if (!id) return
  scrollToId(id)
}

function paint() {
  if (rootEl.value && c.value) applyTheme(c.value.theme, rootEl.value)
}

watch(rootEl, () => paint())
watch(
  () => c.value?.theme,
  () => paint(),
  { deep: true },
)

let unlockSound = null
onMounted(async () => {
  prevTitle = document.title
  try {
    c.value = await getPublicContent(shopSlug.value)
    document.title = c.value.site.name || document.title
    await nextTick()
    paint()
    play()
    await nextTick()
    scrollToHash()
    unlockSound = () => {
      syncSlideVideos()
      window.removeEventListener('pointerdown', unlockSound)
      unlockSound = null
    }
    window.addEventListener('pointerdown', unlockSound)
  } catch (err) {
    loadError.value = err?.response?.data?.error || err?.message || 'โหลดเว็บไซต์ไม่สำเร็จ'
  }
})
onUnmounted(() => {
  clearInterval(timer)
  if (unlockSound) window.removeEventListener('pointerdown', unlockSound)
  clearTheme(rootEl.value || document.documentElement)
  if (prevTitle) document.title = prevTitle
})
</script>

<template>
  <div v-if="loadError" class="booking-site-status">
    <p class="err" role="alert">{{ loadError }}</p>
  </div>
  <div v-else-if="!c" class="booking-site-status">กำลังโหลดเว็บไซต์...</div>
  <div v-else class="booking-site" ref="rootEl">
    <header class="hero" :class="{ 'no-overlay': c.theme?.heroOverlay === false }" id="top">
      <a class="logo" href="#top" @click="onMenuClick('top', $event)">{{ c.site.logoText }}<small v-if="c.site.logoSub">{{ c.site.logoSub }}</small></a>
      <button type="button" class="menu-toggle" :aria-expanded="menuOpen" aria-controls="booking-site-menu" @click="menuOpen = !menuOpen">{{ menuOpen ? '×' : '☰' }}</button>
      <nav id="booking-site-menu" class="menu" :class="{ open: menuOpen }" aria-label="เมนูหลัก">
        <a
          v-for="(n, i) in menuItems"
          :key="i"
          :href="n.section === 'book' ? book() : navHref(n.section)"
          :target="n.section === 'book' ? tg : undefined"
          :rel="n.section === 'book' ? 'noopener' : undefined"
          :class="{ bk: n.section === 'book' }"
          @click="onMenuClick(n.section, $event)"
        >{{ n.label }}</a>
      </nav>

      <div v-for="(s, i) in c.hero" :key="i" class="slide" :class="['g' + (i % 4), { on: i === cur }]" :style="itemBg(s)">
        <video
          v-if="slideVideo(s)?.kind === 'file'"
          class="slide-video"
          :src="slideVideo(s).src"
          :poster="s.image ? img(s.image) : undefined"
          loop
          playsinline
          controls
          @loadeddata="syncSlideVideos"
        />
        <iframe
          v-else-if="i === cur && slideVideo(s)?.kind === 'youtube'"
          class="slide-embed"
          :src="slideVideo(s).src"
          title="วิดีโอพื้นหลัง"
          allow="autoplay; encrypted-media"
          referrerpolicy="strict-origin-when-cross-origin"
        />
      </div>

      <div class="copy" :style="slideCopyStyle">
        <h1>{{ h.title }}</h1>
        <p>{{ h.text }}</p>
        <a v-if="heroBtnLabel" class="btn" :href="heroBtnHref" :target="tg" rel="noopener">{{ heroBtnLabel }}</a>
      </div>

      <div class="barwrap">
        <form v-if="showHeroBooking" class="bar" @submit.prevent="search">
          <div>
            <label for="hero-check-in">เช็คอิน</label>
            <input id="hero-check-in" type="date" v-model="checkIn" :min="todayYmd" required>
          </div>
          <div>
            <label for="hero-check-out">เช็คเอาต์</label>
            <input id="hero-check-out" type="date" v-model="checkOut" :min="minCheckOut" required>
          </div>
          <div>
            <label for="hero-adults">ผู้ใหญ่</label>
            <input id="hero-adults" type="number" v-model.number="adults" :min="rooms" max="30" required>
          </div>
          <div>
            <label for="hero-children">เด็ก</label>
            <input id="hero-children" type="number" v-model.number="children" min="0" max="30">
          </div>
          <div>
            <label for="hero-rooms">จำนวนห้อง</label>
            <input id="hero-rooms" type="number" v-model.number="rooms" min="1" max="10" required>
          </div>
          <button class="go" type="submit">ค้นหาห้องว่าง</button>
        </form>
        <button class="pause" type="button" :class="{ off: paused }" :aria-label="paused ? 'เล่นสไลด์' : 'หยุดสไลด์'" @click="toggle"></button>
      </div>

      <div class="tabs" role="tablist">
        <button v-for="(s, i) in c.hero" :key="i" type="button" class="tab" role="tab" :aria-selected="i === cur" @click="pick(i)">{{ s.tab }}</button>
      </div>
      <div class="scroll"><span>เลื่อนลงเพื่อดูเพิ่มเติม</span></div>
    </header>

    <template v-for="sec in pageSections" :key="sec">
      <section v-if="sec === 'about' && isSectionVisible(c, 'about', showImg)" id="about" class="about place" :class="{ solo: !aboutMedia, 'img-first': c.about?.imageFirst }">
        <div class="about-copy">
          <h2>{{ c.about.title || 'ที่อยู่โรงแรม' }}</h2>
          <p v-if="c.about.text" class="lead">{{ c.about.text }}</p>
          <dl class="place-info">
            <div v-if="shopAddress"><dt>ที่อยู่</dt><dd>{{ shopAddress }}</dd></div>
            <div v-if="shopPhone"><dt>โทร</dt><dd><a :href="'tel:' + shopPhone.replace(/[^\d+]/g, '')">{{ shopPhone }}</a></dd></div>
            <div v-if="shopEmail"><dt>อีเมล</dt><dd><a :href="'mailto:' + shopEmail">{{ shopEmail }}</a></dd></div>
          </dl>
          <div class="place-actions">
            <a v-if="mapUrl" class="btn" :href="mapUrl" target="_blank" rel="noopener">{{ c.location?.openMapsLabel || 'เปิดใน Google Maps' }}</a>
            <a class="link" :href="book()" :target="tg" rel="noopener">{{ c.site.bookingLabel || 'จองห้อง' }}</a>
          </div>
        </div>
        <div v-if="aboutMedia === 'map'" class="place-map">
          <iframe :src="mapEmbed" :title="'แผนที่ ' + (c.site.name || 'โรงแรม')" loading="lazy" referrerpolicy="no-referrer-when-downgrade" allowfullscreen></iframe>
        </div>
        <div v-else-if="aboutMedia === 'image'" class="img" :style="bg(c.about.image)"></div>
      </section>

      <section v-else-if="sec === 'rooms' && isSectionVisible(c, 'rooms', showImg)" id="rooms">
        <LoopCarousel :items="c.rooms" :min-loop="3" :label="c.roomsHeading || 'ห้องพัก'">
          <template #head><h2>{{ c.roomsHeading || 'ห้องพัก' }}</h2></template>
          <template #default="{ item: r, index: i }">
            <article class="card" :class="{ 'card--icon': !(showImg(r) && r.image) }" :style="roomCardStyle(r)">
              <div v-if="showImg(r) && r.image" class="img" :style="bg(r.image)"></div>
              <span v-else class="card-icon" aria-hidden="true"><i class="ti" :class="'ti-' + serviceIcon(r, i)"></i></span>
              <h3>{{ r.name }}</h3><p>{{ r.detail }}</p>
              <a v-if="r.showBook !== false" class="link" :href="book(r.link)" :target="tg" rel="noopener">จองเลย</a>
            </article>
          </template>
        </LoopCarousel>
      </section>

      <section v-else-if="sec === 'promo' && isSectionVisible(c, 'promo', showImg)" id="promo">
        <div class="head"><h2>{{ c.promosHeading || 'โปรโมชั่น' }}</h2></div>
        <div class="promo">
          <article class="pbox" v-for="(p, i) in c.promos" :key="i" :class="'g' + (i % 4)" :style="promoBoxStyle(p)">
            <h3>{{ p.title }}</h3><p>{{ p.text }}</p>
            <a v-if="p.showBook !== false" class="btn" :href="book(p.link)" :target="tg" rel="noopener">จองโปรโมชั่นนี้</a>
          </article>
        </div>
      </section>

      <section v-else-if="sec === 'dining' && isSectionVisible(c, 'dining', showImg)" id="dining" class="about" :class="{ solo: !showImg(c.dining), 'img-first': c.dining?.imageFirst !== false }">
        <div class="about-copy"><h2>{{ c.dining.title }}</h2><p class="lead">{{ c.dining.text }}</p></div>
        <div v-if="showImg(c.dining)" class="img w" :style="bg(c.dining.image)"></div>
      </section>

      <section v-else-if="sec === 'news' && isSectionVisible(c, 'news', showImg)" id="news">
        <LoopCarousel :items="c.news" :label="c.newsHeading || 'รีวิว'">
          <template #head><h2>{{ c.newsHeading || 'รีวิว' }}</h2></template>
          <template #intro><div v-if="c.newsShowImage !== false" class="news-banner img" :style="bg(c.newsImage)"></div></template>
          <template #default="{ item: n, index: i }">
            <article class="review">
              <div v-if="showImg(n)" class="news-thumb img" :class="'g' + (i % 4)" :style="bg(n.image)"></div>
              <time>{{ n.date }}</time>
              <h3>{{ n.title }}</h3>
            </article>
          </template>
        </LoopCarousel>
      </section>
    </template>

    <footer id="contact">
      <div><b>{{ c.site.name }}</b>{{ c.site.address }}<br>{{ c.site.phone }} · {{ c.site.email }}</div>
      <div><b>เมนู</b>ห้องพัก<br>รีวิว<br>โปรโมชั่น<br>ที่อยู่</div>
      <div><b>จองห้อง</b><a class="link" :href="book()" :target="tg" rel="noopener">ไปที่หน้าจอง</a></div>
    </footer>
  </div>
</template>
