export const LOCATION_TYPE_OPTIONS = [
  { value: 'near_attraction', label: 'ติดสถานที่ท่องเที่ยว' },
  { value: 'near_beach', label: 'ติดหาด' },
  { value: 'near_sea', label: 'ติดทะเล' },
  { value: 'in_city', label: 'ในเมือง' },
  { value: 'out_of_city', label: 'นอกเมือง' },
]

export function locationTypeLabel(value) {
  const key = String(value || '').trim()
  if (!key) return ''
  return LOCATION_TYPE_OPTIONS.find((o) => o.value === key)?.label || ''
}
