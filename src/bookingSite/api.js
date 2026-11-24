import api from '../api/axios'
import { compressImage } from '../utils/compressChatImage'

export function apiOrigin() {
  return (import.meta.env.VITE_API_BASE_URL || (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3001')).replace(/\/$/, '')
}

export function img(u) {
  if (!u) return u
  if (/^https?:\/\//i.test(u) || u.startsWith('data:') || u.startsWith('blob:')) return u
  if (u.startsWith('/api/')) return apiOrigin() + u
  return u
}

export function bookingLink(base, o = {}) {
  try {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost'
    const u = new URL(base || '/', origin)
    for (const [k, v] of Object.entries(o)) {
      if (v == null || v === '') continue
      u.searchParams.set(k, v)
    }
    return u.toString()
  } catch {
    return base
  }
}

export async function getPublicContent(slug) {
  const { data } = await api.get(`/api/hotels/${encodeURIComponent(slug)}/booking-site`)
  return data
}

export async function getContent(slug) {
  const { data } = await api.get(`/api/admin/${encodeURIComponent(slug)}/booking-site`)
  return data
}

export async function saveContent(slug, content) {
  const { data } = await api.put(`/api/admin/${encodeURIComponent(slug)}/booking-site`, content)
  return data
}

export async function listImages(slug, folder) {
  const { data } = await api.get(`/api/admin/${encodeURIComponent(slug)}/booking-site/images/${encodeURIComponent(folder)}`)
  return data
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsDataURL(file)
  })
}

async function filePayload(file) {
  if (file.size <= 1.4 * 1024 * 1024 && /^image\/(jpeg|png|webp|gif)$/i.test(file.type)) {
    const dataUrl = await readAsDataUrl(file)
    const base64 = dataUrl.split(',')[1] || ''
    return { image_data: base64, image_mime: file.type }
  }
  const { base64, mime } = await compressImage(file, { maxWidth: 1920, quality: 0.84 })
  return { image_data: base64, image_mime: mime }
}

async function videoPayload(file) {
  if (file.size > 12 * 1024 * 1024) throw new Error('วิดีโอใหญ่เกิน 12MB')
  const dataUrl = await readAsDataUrl(file)
  const base64 = dataUrl.split(',')[1] || ''
  const mime = /^video\/(mp4|webm)$/i.test(file.type)
    ? file.type
    : (/\.webm$/i.test(file.name) ? 'video/webm' : 'video/mp4')
  return { image_data: base64, image_mime: mime }
}

export async function upload(slug, file, folder) {
  const isVideo = /^video\//i.test(file.type) || /\.(mp4|webm)$/i.test(file.name)
  const payload = isVideo ? await videoPayload(file) : await filePayload(file)
  const { data } = await api.post(
    `/api/admin/${encodeURIComponent(slug)}/booking-site/upload/${encodeURIComponent(folder)}`,
    payload,
  )
  return data
}
