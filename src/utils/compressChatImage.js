/**
 * Resize and compress an image file before upload.
 * @returns {Promise<{ base64: string, mime: string }>}
 */
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i

function looksLikeImageFile(file) {
  const type = String(file?.type || '').toLowerCase()
  const name = String(file?.name || '')
  if (type.startsWith('image/')) return true
  if (type === 'application/octet-stream' || !type) return true
  return IMAGE_EXT_RE.test(name)
}

function isHeicName(file) {
  const type = String(file?.type || '').toLowerCase()
  const name = String(file?.name || '')
  return type.includes('heic') || type.includes('heif') || /\.hei[cf]$/i.test(name)
}

export function compressImage(file, { maxWidth = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !looksLikeImageFile(file)) {
      reject(new Error('เลือกไฟล์รูปภาพเท่านั้น'))
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    const cleanup = () => URL.revokeObjectURL(objectUrl)

    img.onerror = () => {
      cleanup()
      reject(new Error(
        isHeicName(file)
          ? 'รูป HEIC ไม่รองรับ — ถ่ายหรือบันทึกเป็น JPG แล้วลองใหม่'
          : 'โหลดรูปไม่สำเร็จ',
      ))
    }
    img.onload = () => {
      cleanup()
      const scale = Math.min(1, maxWidth / Math.max(img.width, 1))
      const width = Math.max(1, Math.round(img.width * scale))
      const height = Math.max(1, Math.round(img.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('ไม่สามารถประมวลผลรูปได้'))
        return
      }
      ctx.drawImage(img, 0, 0, width, height)

      const finishFromDataUrl = (dataUrl) => {
        const base64 = String(dataUrl).split(',')[1] || ''
        if (!base64) {
          reject(new Error('บีบอัดรูปไม่สำเร็จ'))
          return
        }
        resolve({ base64, mime: 'image/jpeg' })
      }

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            try {
              finishFromDataUrl(canvas.toDataURL('image/jpeg', quality))
            } catch {
              reject(new Error('บีบอัดรูปไม่สำเร็จ'))
            }
            return
          }
          const blobReader = new FileReader()
          blobReader.onerror = () => reject(new Error('อ่านรูปไม่สำเร็จ'))
          blobReader.onload = () => finishFromDataUrl(blobReader.result)
          blobReader.readAsDataURL(blob)
        },
        'image/jpeg',
        quality,
      )
    }
    img.src = objectUrl
  })
}

/** @deprecated use compressImage */
export function compressChatImage(file, maxWidth = 1280, quality = 0.82) {
  return compressImage(file, { maxWidth, quality })
}
