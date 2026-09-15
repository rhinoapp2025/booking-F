const IMAGES = {
  suite:    'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80',
  deluxe:   'https://images.unsplash.com/photo-1611892440504-42a792e24d32?auto=format&fit=crop&w=1200&q=80',
  superior: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
  twin:     'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1200&q=80',
  standard: 'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=1200&q=80',
}

export function defaultRoomImage(typeName) {
  const n = String(typeName || '').toUpperCase()
  if (n.includes('SUI') || n.includes('SUITE')) return IMAGES.suite
  if (n.includes('TWIN') || n.includes('DLXT') || n.includes('SUPT')) return IMAGES.twin
  if (n.includes('DLX') || n.includes('DELUXE')) return IMAGES.deluxe
  if (n.includes('SUP') || n.includes('SUPERIOR')) return IMAGES.superior
  return IMAGES.standard
}

export function roomCoverUrl(room) {
  const list = Array.isArray(room?.images) ? room.images : []
  const first = list[0]
  const url = typeof first === 'string' ? first : first?.url || first?.src || ''
  return url || defaultRoomImage(room?.name)
}
