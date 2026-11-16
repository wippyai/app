import type { InjectionKey } from 'vue'
import type { PageList } from '@example/app-nav'
import type { ApiInstance, HostApi } from './types'

export const HOST_API = Symbol('host_api') as InjectionKey<HostApi>
export const AXIOS_INSTANCE = Symbol('axios') as InjectionKey<ApiInstance>
/** The live list of pages the viewer may open, shared by the sidebar and the hosted-page route. */
export const PAGE_LIST = Symbol('page_list') as InjectionKey<PageList>
