import { computed } from 'vue'
import { useRoute } from 'vue-router'

export function useHotelRoute() {
  const route = useRoute()
  const hotelSlug = computed(
    () => route.params.hotelSlug || localStorage.getItem('hotelSlug') || 'default'
  )

  function hotelPath(suffix = '') {
    const path = suffix.startsWith('/') ? suffix : `/${suffix}`
    return `/${hotelSlug.value}${path}`
  }

  return { hotelSlug, hotelPath }
}
