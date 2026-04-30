import { inject } from 'vue'
import { HOST_API, AXIOS_INSTANCE, WIPPY_INSTANCE } from '../constants'
import type { HostApi, ProxyApiInstance } from '../types'

export function useHost(): HostApi {
  const host = inject(HOST_API)
  if (!host) throw new Error('HostApi not provided')
  return host
}

export function useApi(): ProxyApiInstance['api'] {
  const api = inject(AXIOS_INSTANCE)
  if (!api) throw new Error('ProxyApiInstance not provided')
  return api
}

export function useWippy(): ProxyApiInstance {
  const instance = inject(WIPPY_INSTANCE)
  if (!instance) throw new Error('WIPPY_INSTANCE not provided')
  return instance
}
