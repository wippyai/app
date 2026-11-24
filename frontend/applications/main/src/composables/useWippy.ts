import { inject } from 'vue'
import type { PageList } from '@example/app-nav'
import { AXIOS_INSTANCE, HOST_API, PAGE_LIST } from '../constants'
import type { ApiInstance, HostApi } from '../types'

export function useHost(): HostApi {
  const host = inject(HOST_API)
  if (!host) throw new Error('HostApi not provided')
  return host
}

export function useApi(): ApiInstance {
  const api = inject(AXIOS_INSTANCE)
  if (!api) throw new Error('Api instance not provided')
  return api
}

export function usePages(): PageList {
  const pages = inject(PAGE_LIST)
  if (!pages) throw new Error('Page list not provided')
  return pages
}
