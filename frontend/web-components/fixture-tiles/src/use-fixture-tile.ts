import { useEvents, useProps } from '@wippy-fe/webcomponent-vue'
import { useTile } from '@wippy/dashboards-tile-helper'
import type { EmitFn, ReadTrace, RenderStateDetail } from '@wippy/dashboards-tile-helper'

export interface TileEvents {
  'render-state': RenderStateDetail
  'tile-event': { request_id: string, name: string, detail: unknown }
  'load': undefined
  'unload': undefined
  'error': { message: string, error: unknown }
  'invalid': { message: string }
}

/** What a browser test reads from the page: every render-state and every read outcome, per tile. */
export interface FixtureLog {
  states: Record<string, RenderStateDetail[]>
  reads: Record<string, ReadTrace[]>
  /** What each tile drew, in order: the text of the data and the panel or mark that it drew. */
  drawn: Record<string, string[]>
}

export function fixtureLog(): FixtureLog {
  const w = window as unknown as { __fx?: FixtureLog }
  if (!w.__fx)
    w.__fx = { states: {}, reads: {}, drawn: {} }
  return w.__fx
}

/**
 * The tile composable of the fixtures. It is useTile with the same wiring as any plugin tile, plus a log:
 * each render-state and each read outcome goes to window.__fx, which the tests read.
 */
export function useFixtureTile(optionalInputs?: string[]) {
  const props = useProps<Record<string, unknown>>()
  const events = useEvents<TileEvents>() as unknown as EmitFn
  const log = fixtureLog()
  const tileId = () => String(props.value['tile-id'] ?? props.value.tileId ?? '')
  const emit: EmitFn = (name, detail) => {
    if (name === 'render-state') {
      const list = log.states[tileId()] ?? (log.states[tileId()] = [])
      list.push(detail as RenderStateDetail)
    }
    events(name, detail)
  }
  return useTile({
    props,
    emit,
    optionalInputs,
    deps: {
      trace: (event) => {
        const list = log.reads[tileId()] ?? (log.reads[tileId()] = [])
        list.push(event)
      },
    },
  })
}
