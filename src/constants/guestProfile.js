export const GUEST_TITLES = ['นาย', 'นาง', 'นางสาว', 'Mr.', 'Mrs.', 'Ms.']

export const GUEST_NATIONS = [
  { code: 'TH', name: 'ไทย' },
  { code: 'CN', name: 'จีน' },
  { code: 'JP', name: 'ญี่ปุ่น' },
  { code: 'KR', name: 'เกาหลี' },
  { code: 'US', name: 'อเมริกัน' },
  { code: 'GB', name: 'อังกฤษ' },
  { code: 'SG', name: 'สิงคโปร์' },
  { code: 'MY', name: 'มาเลเซีย' },
  { code: 'DE', name: 'เยอรมัน' },
  { code: 'FR', name: 'ฝรั่งเศส' },
  { code: 'AU', name: 'ออสเตรเลีย' },
  { code: 'OTHER', name: 'อื่นๆ' },
]

export const GUEST_PROFILE_KEYS = [
  'guest_title',
  'guest_first_name',
  'guest_last_name',
  'guest_sex',
  'guest_nation',
  'guest_national_id',
  'guest_passport',
  'guest_birthday',
  'guest_phone',
  'guest_car_no',
  'guest_address1',
  'guest_address2',
  'guest_address3',
  'guest_special_requests',
]

export function emptyGuestProfile() {
  return {
    guest_title: '',
    guest_first_name: '',
    guest_last_name: '',
    guest_sex: '',
    guest_nation: 'TH',
    guest_national_id: '',
    guest_passport: '',
    guest_birthday: '',
    guest_phone: '',
    email: '',
    guest_car_no: '',
    guest_address1: '',
    guest_address2: '',
    guest_address3: '',
    guest_special_requests: '',
  }
}

export function guestProfileFromUser(user = {}) {
  const base = emptyGuestProfile()
  for (const key of GUEST_PROFILE_KEYS) {
    if (user[key] != null && user[key] !== '') base[key] = String(user[key])
  }
  if (!base.guest_first_name && !base.guest_last_name && user.name) {
    const parts = String(user.name).trim().split(/\s+/)
    // Skip title if name starts with a known title
    if (GUEST_TITLES.includes(parts[0]) && parts.length > 1) {
      base.guest_title = parts[0]
      base.guest_first_name = parts[1] || ''
      base.guest_last_name = parts.slice(2).join(' ')
    } else {
      base.guest_first_name = parts[0] || ''
      base.guest_last_name = parts.slice(1).join(' ')
    }
  }
  if (!base.guest_phone) {
    base.guest_phone = String(
      user.guest_phone || user.phone || (user.provider === 'phone' ? user.provider_id : '') || ''
    )
  }
  base.email = String(user.email || '')
  if (base.email.endsWith('@phone.local')) base.email = ''
  if (!base.guest_nation) base.guest_nation = 'TH'
  if (base.guest_birthday) base.guest_birthday = String(base.guest_birthday).slice(0, 10)
  return base
}

export function displayNameFromGuest(profile) {
  return [profile.guest_title, profile.guest_first_name, profile.guest_last_name]
    .map((s) => String(s || '').trim())
    .filter(Boolean)
    .join(' ')
}
