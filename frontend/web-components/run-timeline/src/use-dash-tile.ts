import { useEvents, useProps } from '@wippy-fe/webcomponent-vue'
import { useTile } from '@wippy/dashboards-tile-helper'
import type { EmitFn, InputValidator, RenderStateDetail } from '@wippy/dashboards-tile-helper'

/** Events of every tile element (contracts section 8), plus the lifecycle events of the base class. */
export interface TileEvents {
  'render-state': RenderStateDetail
  'tile-event': { request_id: string, name: string, detail: unknown }
  'load': undefined
  'unload': undefined
  'error': { message: string, error: unknown }
  'invalid': { message: string }
}

/**
 * The tile composable with this package's wiring: the props and the event emitter of the element.
 * Call it once in `<script setup>` of a tile. `validate` checks the data of an input before the tile
 * reports `ready`.
 */
export function useDashTile(validate?: Record<string, InputValidator>) {
  const props = useProps<Record<string, unknown>>()
  const emit = useEvents<TileEvents>() as unknown as EmitFn
  return useTile({ props, emit, validate })
}
