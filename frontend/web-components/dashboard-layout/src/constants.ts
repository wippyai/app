import type { InjectionKey, Ref } from 'vue'
import { useProps, useEvents, usePropsErrors } from '@wippy-fe/webcomponent-vue'
import type { ComponentProps, CompiledTile, RenderStateDetail, TileEventDetail } from './types.ts'
import type { ParamValues } from './lib/params.ts'

export interface Events {
  load: undefined
  unload: undefined
  error: { message: string, error: unknown }
  invalid: { message: string }
}

export const useComponentProps = () => useProps<ComponentProps>()
export const useComponentEvents = () => useEvents<Events>()
export const useComponentPropsErrors = usePropsErrors

/** What the board shares with the tile frames it renders. */
export interface BoardContext {
  pageUrl: Readonly<Ref<string>>
  tiles: Readonly<Ref<Record<string, CompiledTile>>>
  values: Readonly<Ref<ParamValues>>
  /** Current request-id of each tile. A new id gives the tile a new configuration. */
  requestIds: Record<string, string>
  /** Give one tile a new request-id. */
  retry: (tileId: string) => void
  /** A `tile-event` from one tile. The board applies the tile's `change` or `on` rule. */
  tileEvent: (tileId: string, detail: TileEventDetail) => void
}

export const BOARD_KEY: InjectionKey<BoardContext> = Symbol('dashboard-layout-board')

/** Events of the `dash-placeholder` test tile. */
export interface PlaceholderEvents {
  'render-state': RenderStateDetail
  load: undefined
  unload: undefined
  error: { message: string, error: unknown }
  invalid: { message: string }
}
