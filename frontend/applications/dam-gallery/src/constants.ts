import type { InjectionKey } from 'vue'
import type { HostApi, ProxyApiInstance } from './types'

export const HOST_API = Symbol('host_api') as InjectionKey<HostApi>
export const AXIOS_INSTANCE = Symbol('axios') as InjectionKey<ProxyApiInstance['api']>
export const WIPPY_INSTANCE = Symbol('proxy') as InjectionKey<ProxyApiInstance>
