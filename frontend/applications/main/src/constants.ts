import type { InjectionKey } from 'vue'
import type { PageList } from '@example/app-nav'
import type { ApiInstance, HostApi } from './types'

export const HOST_API = Symbol('host_api') as InjectionKey<HostApi>
export const AXIOS_INSTANCE = Symbol('axios') as InjectionKey<ApiInstance>
/** The live list of pages the viewer may open, shared by the sidebar and the hosted-page route. */
export const PAGE_LIST = Symbol('page_list') as InjectionKey<PageList>
/**
 * Call it right before a navigation this app starts on the user's behalf, so a
 * navigation that is still waiting (an agent path before the page list is
 * loaded) is dropped instead of overriding it.
 */
export const NOTE_NAVIGATION = Symbol('note_navigation') as InjectionKey<() => void>
