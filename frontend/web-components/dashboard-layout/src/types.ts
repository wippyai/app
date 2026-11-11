/** Props of the `dashboard-layout` element. HTML attributes are kebab-case, props are camelCase. */
export interface ComponentProps {
  subPath?: string
  pageUrl?: string
  layout?: LayoutProp
  tiles?: Record<string, CompiledTile>
  params?: Record<string, ParamDecl>
}

/** `@wippy-fe/layout` `breakpoints` and `layouts`, as the page spec stores them. */
export interface LayoutProp {
  breakpoints?: Record<string, number>
  layouts: Record<string, PanelTreeProp>
}

export interface PanelSlotProp {
  panel: string
  size: string
  minSize?: string
  maxSize?: string
}

export interface PanelTreeProp {
  direction: 'horizontal' | 'vertical'
  children: Array<PanelSlotProp | PanelTreeProp>
  size?: string
}

export interface ParamDecl {
  type: string
  label?: string
  /** Missing when the default is null: the server cannot write null inside an object. */
  default?: unknown
  from_path?: number
}

export interface CompiledDataSource {
  point: string
  args?: Record<string, unknown>
  refresh_ms?: number | null
  live_topic?: string | null
}

export interface CompiledAction {
  /** The page's action name. The tile may know the action under another, local name. */
  action?: string
  confirm?: boolean
  /** True when the viewer who read the props may run the action. The endpoint still checks each call. */
  allowed?: boolean
  refreshes?: string[]
}

export interface CompiledTile {
  tag: string
  fields?: Record<string, unknown>
  options?: Record<string, unknown>
  data?: Record<string, CompiledDataSource>
  actions?: Record<string, CompiledAction>
  params?: string[]
  param?: string | null
  on?: Record<string, unknown>
}

export type RenderStatus = 'loading' | 'computing' | 'ready' | 'empty' | 'denied' | 'error'

/** Detail of the `tile-event` event (contracts section 8). */
export interface TileEventDetail {
  request_id: string
  name: string
  detail?: unknown
}

/** Detail of the `render-state` event (contracts section 8). */
export interface RenderStateDetail {
  request_id: string
  status: RenderStatus
  error?: { code?: string, message?: string }
  computed_at?: string | null
  data_as_of?: string | null
  source_title?: string | null
  stale?: boolean
  completeness?: string | null
}
