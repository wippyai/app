import { inject } from 'vue'
import { AXIOS_INSTANCE, HOST_API } from '../constants'
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
