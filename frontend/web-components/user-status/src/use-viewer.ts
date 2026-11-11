import { onMounted, ref } from 'vue'
import { viewerIdFrom } from './lib/set-status.ts'

/**
 * The id of the signed-in user, from `GET /api/v1/user/me`. It is null until the answer arrives and
 * stays null when the call fails; the tile then offers no control, and the server still refuses a
 * call on the caller's own account (error code self_target).
 */
export function useViewerId() {
  const viewerId = ref<string | null>(null)
  onMounted(async () => {
    try {
      const { api } = await import('@wippy-fe/proxy')
      const res = await api.get('/api/v1/user/me', { validateStatus: () => true })
      viewerId.value = res.status === 200 ? viewerIdFrom(res.data) : null
    }
    catch {
      viewerId.value = null
    }
  })
  return viewerId
}
