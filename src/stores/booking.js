import { defineStore } from 'pinia'
import api from '../api/axios'

export const useBookingStore = defineStore('booking', {
  state: () => ({
    myBookings:        [],
    availableRooms:    [],
    roomTypes:         [],
    loading:           false,
    error:             '',
    depositPercent:    30,
    collectFull:       false,
    advanceDays:       90,
    unpaidExpireHours: 24,
  }),

  actions: {
    // ─── ดึงรายการจองของผู้ใช้ ──────────────────────────────────────────────
    async fetchMyBookings(hotelSlug) {
      this.loading = true
      this.error   = ''
      try {
        const { data } = await api.get(`/api/bookings/${hotelSlug}/my`)
        this.myBookings = data || []
        return this.myBookings
      } catch (err) {
        this.error = err?.response?.data?.error || 'โหลดรายการจองไม่สำเร็จ'
        throw err
      } finally {
        this.loading = false
      }
    },

    async fetchAllMyBookings() {
      this.loading = true
      this.error   = ''
      try {
        const { data } = await api.get('/api/bookings/my')
        this.myBookings = data || []
        return this.myBookings
      } catch (err) {
        this.error = err?.response?.data?.error || 'โหลดรายการจองไม่สำเร็จ'
        throw err
      } finally {
        this.loading = false
      }
    },

    // ─── ดึงประเภทห้องที่ว่างในช่วงวันที่ ─────────────────────────────────
    async fetchAvailableRooms(hotelSlug, { checkIn, checkOut, adults = 1, children = 0 }) {
      this.loading = true
      this.error   = ''
      try {
        const { data } = await api.get(`/api/hotels/${hotelSlug}/available-rooms`, {
          params: { check_in: checkIn, check_out: checkOut, adults, children },
        })
        this.availableRooms = data || []
        return this.availableRooms
      } catch (err) {
        this.error = err?.response?.data?.error || 'โหลดห้องว่างไม่สำเร็จ'
        throw err
      } finally {
        this.loading = false
      }
    },

    // ─── ดึงรายการประเภทห้องทั้งหมด ────────────────────────────────────────
    async fetchRoomTypes(hotelSlug) {
      try {
        const { data } = await api.get(`/api/hotels/${hotelSlug}/room-types`)
        this.roomTypes = data || []
        return this.roomTypes
      } catch (err) {
        this.error = err?.response?.data?.error || 'โหลดประเภทห้องไม่สำเร็จ'
        throw err
      }
    },

    // ─── สร้างการจอง ─────────────────────────────────────────────────────────
    async createBooking(hotelSlug, payload) {
      this.loading = true
      this.error   = ''
      try {
        const { data } = await api.post(`/api/bookings/${hotelSlug}`, payload)
        await this.fetchMyBookings(hotelSlug)
        return data
      } catch (err) {
        this.error = err?.response?.data?.error || 'จองไม่สำเร็จ'
        throw err
      } finally {
        this.loading = false
      }
    },

    // ─── ยกเลิกการจอง ─────────────────────────────────────────────────────────
    async cancelBooking(hotelSlug, bookingId, reason = '') {
      this.loading = true
      this.error   = ''
      try {
        const { data } = await api.patch(
          `/api/bookings/${hotelSlug}/${bookingId}/cancel`,
          { reason }
        )
        await this.fetchMyBookings(hotelSlug)
        return data
      } catch (err) {
        this.error = err?.response?.data?.error || 'ยกเลิกไม่สำเร็จ'
        throw err
      } finally {
        this.loading = false
      }
    },

    // ─── อัปโหลดสลิป ──────────────────────────────────────────────────────────
    async uploadPaymentSlip(hotelSlug, bookingId, { imageData, imageMime }) {
      this.loading = true
      this.error   = ''
      try {
        const { data } = await api.post(
          `/api/bookings/${hotelSlug}/${bookingId}/slip`,
          { imageData, imageMime }
        )
        return data
      } catch (err) {
        this.error = err?.response?.data?.error || 'อัปโหลดสลิปไม่สำเร็จ'
        throw err
      } finally {
        this.loading = false
      }
    },

    // ─── โหลด settings ───────────────────────────────────────────────────────
    async fetchHotelSettings(hotelSlug) {
      try {
        const { data } = await api.get(`/api/hotels/${hotelSlug}/settings`)
        this.depositPercent    = Number(data.deposit_percent)    || 30
        this.collectFull       = data.payment_collect_mode === 'full'
        this.advanceDays       = Number(data.book_advance_days)  || 90
        this.unpaidExpireHours = Number(data.auto_cancel_hours)  || 24
        return data
      } catch {
        // ใช้ค่า default ถ้าโหลดไม่ได้
      }
    },

    clear() {
      this.myBookings     = []
      this.availableRooms = []
      this.roomTypes      = []
      this.loading        = false
      this.error          = ''
    },
  },
})
