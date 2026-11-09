import type { RenderStateDetail } from '../types'

/**
 * Frame state of one tile (contracts section 8).
 *
 * The board draws the frame from `render-state` events. A tile that reports nothing still gets a
 * timeout. Everything here is pure, so request-id ordering and deadlines are unit-tested.
 */

export const FIRST_STATE_DEADLINE_MS = 10_000
export const COMPUTING_DEADLINE_MS = 60_000
export const COMPONENT_LOAD_DEADLINE_MS = 15_000

export type FrameStatus =
  | 'loading-component'
  | 'load-failed'
  | 'loading'
  | 'computing'
  | 'ready'
  | 'empty'
  | 'denied'
  | 'error'
  | 'timeout'

export interface FrameState {
  requestId: string
  status: FrameStatus
  /** True once the current request-id has reached a terminal state. Timeouts stop applying then. */
  settled: boolean
  /** True when the frame timed out while the tile reported `computing`, so the message names the right limit. */
  timedOutWhileComputing: boolean
  errorCode: string | null
  errorMessage: string | null
  computedAt: string | null
  dataAsOf: string | null
  sourceTitle: string | null
  stale: boolean
  completeness: string | null
}

const TERMINAL = new Set<string>(['ready', 'empty', 'denied', 'error'])

export function isTerminal(status: string): boolean {
  return TERMINAL.has(status)
}

export function initialFrame(requestId: string, status: FrameStatus = 'loading-component'): FrameState {
  return {
    requestId,
    status,
    settled: false,
    timedOutWhileComputing: false,
    errorCode: null,
    errorMessage: null,
    computedAt: null,
    dataAsOf: null,
    sourceTitle: null,
    stale: false,
    completeness: null,
  }
}

/** A new request-id restarts the frame. Source details stay, so a refresh does not blank the footer. */
export function restartFrame(prev: FrameState | undefined, requestId: string, status: FrameStatus): FrameState {
  const next = initialFrame(requestId, status)
  if (prev) {
    next.computedAt = prev.computedAt
    next.dataAsOf = prev.dataAsOf
    next.sourceTitle = prev.sourceTitle
  }
  return next
}

/**
 * Apply one `render-state` event. An event for another request-id is ignored, so a slow tile
 * cannot overwrite the frame of a newer configuration. Returns the same object when ignored.
 */
export function applyRenderState(state: FrameState, detail: RenderStateDetail): FrameState {
  if (!detail || detail.request_id !== state.requestId)
    return state
  const status = detail.status
  if (status !== 'loading' && status !== 'computing' && !isTerminal(status))
    return state
  return {
    ...state,
    status,
    settled: state.settled || isTerminal(status),
    timedOutWhileComputing: false,
    errorCode: detail.error?.code ?? null,
    errorMessage: detail.error?.message ?? null,
    computedAt: detail.computed_at ?? state.computedAt,
    dataAsOf: detail.data_as_of ?? state.dataAsOf,
    sourceTitle: detail.source_title ?? state.sourceTitle,
    stale: detail.stale === true,
    completeness: detail.completeness ?? null,
  }
}

/** Milliseconds after the request starts at which the frame times out, for the tile's last status. */
export function deadlineMs(status: FrameStatus): number {
  return status === 'computing' ? COMPUTING_DEADLINE_MS : FIRST_STATE_DEADLINE_MS
}

/** The frame after its deadline passed. Only an unsettled frame times out. */
export function applyTimeout(state: FrameState, requestId: string): FrameState {
  if (state.requestId !== requestId || state.settled)
    return state
  if (state.status === 'timeout' || state.status === 'load-failed')
    return state
  return { ...state, status: 'timeout', timedOutWhileComputing: state.status === 'computing' }
}

export function applyLoadFailure(state: FrameState, requestId: string, message: string): FrameState {
  if (state.requestId !== requestId)
    return state
  return { ...state, status: 'load-failed', errorCode: 'component_load_failed', errorMessage: message }
}

/** Whether the frame shows a message in place of the tile. */
export function coversTile(status: FrameStatus): boolean {
  return status === 'empty' || status === 'denied' || status === 'error' || status === 'timeout'
    || status === 'load-failed'
}

/** Whether the frame shows the loading bar. */
export function showsLoadingBar(state: FrameState): boolean {
  return state.status === 'loading-component' || state.status === 'loading' || state.status === 'computing'
}

/** Sequence of request-ids for one board. Each id is unique and later than the one before it. */
export function createRequestIds(prefix = 'r') {
  let counter = 0
  return {
    next(tileId: string): string {
      counter += 1
      return `${prefix}${counter}:${tileId}`
    },
  }
}

/** The numeric order of a request-id made by `createRequestIds`, or -1 for a foreign id. */
export function requestOrder(requestId: string): number {
  const match = /^[^0-9]*(\d+):/.exec(requestId)
  return match ? Number(match[1]) : -1
}
