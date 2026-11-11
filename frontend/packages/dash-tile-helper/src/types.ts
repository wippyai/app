/** Types of the tile protocol `tile_v1` (docs/dashboards-poc/contracts.md, sections 7 and 8). */

export type RenderStatus = 'loading' | 'computing' | 'ready' | 'empty' | 'denied' | 'error'

export interface TileError {
  code: string
  message: string
  input?: string
  field?: string
}

/** One entry of the `data-sources` attribute. A missing `refresh_ms` or `live_topic` means null. */
export interface DataSource {
  url: string
  args: Record<string, unknown>
  refresh_ms: number | null
  live_topic: string | null
}

/** One entry of the `actions` attribute. */
export interface ActionDecl {
  url: string
  confirm: boolean
}

/** The tile attributes, parsed. A missing key is null (or empty), never undefined. */
export interface TileConfig {
  tileId: string
  requestId: string
  dataSources: Record<string, DataSource>
  actions: Record<string, ActionDecl>
  fields: Record<string, unknown>
  options: Record<string, unknown>
  params: Record<string, unknown>
  mode: string
}

/** What one input currently holds. */
export interface InputState {
  name: string
  status: RenderStatus
  /** The last good data. It stays during a new read and after a failure; then `stale` is true. */
  data: unknown
  /** True when `data` is older than the current status (a computing result or a failed read). */
  stale: boolean
  error: TileError | null
  computedAt: string | null
  dataAsOf: string | null
  sourceTitle: string | null
  completeness: string | null
  /** True once the first read of this configuration reached a terminal state. */
  settled: boolean
}

/** The `detail` of the `render-state` event. */
export interface RenderStateDetail {
  request_id: string
  status: RenderStatus
  error?: TileError
  computed_at?: string
  data_as_of?: string
  source_title?: string
  stale?: boolean
  completeness?: string
}

/** Result of an HTTP call. The transport must not throw for an HTTP status, only for a network failure. */
export interface HttpResponse {
  status: number
  data: unknown
}

export interface TileHttp {
  get: (url: string) => Promise<HttpResponse>
  post: (url: string, body: unknown) => Promise<HttpResponse>
}

/** Subscribes to a live topic. Returns the function that unsubscribes. */
export type SubscribeFn = (topic: string, callback: () => void) => () => void

export interface ConfirmRequest {
  action: string
  args: Record<string, unknown>
  /** The question to show. A default names the action. */
  message?: string
}

/** Options of one action run. */
export interface RunActionOptions {
  /** The question of the confirmation, when the action has `confirm: true`. */
  confirmMessage?: string
}

/** Everything that touches the outside world, so unit tests run without a server. */
export interface TileDeps {
  http: TileHttp
  subscribe: SubscribeFn
  /** Resolves true when the viewer confirms. */
  confirm: (request: ConfirmRequest) => Promise<boolean>
  uuid: () => string
  /** False while the page is hidden. Timed refresh skips a read then. */
  isVisible: () => boolean
}

/** `emit('render-state', detail)` of `useEvents()`. Events bubble and are composed. */
export type EmitFn = (name: string, detail: unknown) => void

export type ActionStatus = 'done' | 'failed' | 'denied' | 'unknown' | 'cancelled'

export interface ActionResult {
  action: string
  status: ActionStatus
  error: TileError | null
  /** The response body when the server sent one. */
  envelope: unknown
}
