/**
 * Resize and compress an image file before upload.
 * @returns {Promise<{ base64: string, mime: string }>}
 */
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|heic|heif|bmp)$/i

export function compressImage(file, { maxWidth = 1280, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const type = String(file?.type || '').toLowerCase()
    const looksLikeImage = type.startsWith('image/') || IMAGE_EXT_RE.test(file?.name || '')
    if (!file || !looksLikeImage) {
      reject(new Error('เลือกไฟล์รูปภาพเท่านั้น'))
      return
    }
    if (type.includes('heic') || type.includes('heif') || /\.hei[cf]$/i.test(file.name || '')) {
      reject(new Error('รูป HEIC ไม่รองรับ — ถ่ายหรือบันทึกเป็น JPG/PNG แล้วลองใหม่'))
      return
    }

    const reader = new FileReader()
    reader.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('โหลดรูปไม่สำเร็จ'))
      img.onload = () => {
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
          quality
        )
      }
      img.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}

/** @deprecated use compressImage */
export function compressChatImage(file, maxWidth = 1280, quality = 0.82) {
  return compressImage(file, { maxWidth, quality })
}
