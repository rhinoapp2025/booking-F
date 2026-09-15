/** Only same-origin app paths. Blocks protocol-relative and external URLs. */
export function safeInternalPath(path, fallback = '/') {
  const next = String(path || '').trim()
  if (!next.startsWith('/') || next.startsWith('//') || next.includes('://')) {
    return fallback
  }
  return next
}
