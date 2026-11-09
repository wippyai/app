import { createInputReader } from './reader.ts'
import type { InputReader } from './reader.ts'
import type {
  ActionResult,
  ActionStatus,
  EmitFn,
  InputState,
  RenderStateDetail,
  RenderStatus,
  TileConfig,
  TileDeps,
  TileError,
} from './types.ts'

/** Checks the data of one input. Returns an error when the tile cannot use it, else null. */
export type InputValidator = (data: unknown, config: TileConfig) => TileError | null

export interface TileSnapshot {
  /** The status of the whole tile, from all its inputs. */
  status: RenderStatus
  inputs: Record<string, InputState>
}

export interface TileController {
  /** Start the reads of every input. The tile calls it once `request-id` is set. */
  start: () => void
  /** Stop reads, timers and subscriptions. */
  dispose: () => void
  snapshot: () => TileSnapshot
  /** Read one input (or all) again now. */
  refresh: (input?: string) => void
  /** Run a declared action (contracts sections 8 and 10). Never throws. */
  runAction: (name: string, tileArgs?: Record<string, unknown>) => Promise<ActionResult>
  /** Dispatch a declared tile event as `tile-event` `{ request_id, name, detail }`. */
  emitTileEvent: (name: string, detail: unknown) => void
}

/**
 * One status for a tile with several inputs. While any input has no terminal state yet, the tile is
 * `computing` (some input computes) or `loading`. Then `denied` wins over `error`, `error` over
 * `empty`, and `empty` over `ready`.
 */
export function aggregateStatus(inputs: InputState[]): RenderStatus {
  if (inputs.length === 0)
    return 'ready'
  if (inputs.some(i => !i.settled))
    return inputs.some(i => i.status === 'computing') ? 'computing' : 'loading'
  // After the first read, a follow-up read that computes shows as computing.
  if (inputs.some(i => i.status === 'computing'))
    return 'computing'
  if (inputs.some(i => i.status === 'denied'))
    return 'denied'
  if (inputs.some(i => i.status === 'error'))
    return 'error'
  if (inputs.some(i => i.status === 'empty'))
    return 'empty'
  return 'ready'
}

/** The `render-state` detail for a snapshot. Only values that exist are included. */
export function buildRenderState(requestId: string, status: RenderStatus, inputs: InputState[]): RenderStateDetail {
  const detail: RenderStateDetail = { request_id: requestId, status }
  if (status === 'error' || status === 'denied') {
    const failing = inputs.find(i => i.status === status && i.error)
    if (failing?.error)
      detail.error = { ...failing.error, input: failing.error.input ?? failing.name }
  }
  const latest = (values: Array<string | null>): string | null => {
    const present = values.filter((v): v is string => v !== null)
    return present.length === 0 ? null : present.reduce((a, b) => (a > b ? a : b))
  }
  const oldest = (values: Array<string | null>): string | null => {
    const present = values.filter((v): v is string => v !== null)
    return present.length === 0 ? null : present.reduce((a, b) => (a < b ? a : b))
  }
  const computedAt = latest(inputs.map(i => i.computedAt))
  const dataAsOf = oldest(inputs.map(i => i.dataAsOf))
  const title = inputs.map(i => i.sourceTitle).find((t): t is string => t !== null) ?? null
  if (computedAt)
    detail.computed_at = computedAt
  if (dataAsOf)
    detail.data_as_of = dataAsOf
  if (title)
    detail.source_title = title
  if (inputs.some(i => i.stale))
    detail.stale = true
  const completeness = inputs.some(i => i.completeness === 'partial')
    ? 'partial'
    : inputs.map(i => i.completeness).find((c): c is string => c !== null) ?? null
  if (completeness)
    detail.completeness = completeness
  return detail
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

const ACTION_STATES: ReadonlySet<string> = new Set(['done', 'failed', 'denied', 'unknown'])

interface Pending {
  args: string
  key: string
}

export function createTileController(
  config: TileConfig,
  deps: TileDeps,
  emit: EmitFn,
  onChange: (snapshot: TileSnapshot) => void,
  validators: Record<string, InputValidator> = {},
): TileController {
  const readers = new Map<string, InputReader>()
  const states: Record<string, InputState> = {}
  let disposed = false
  let firstTerminalSent = false
  let lastKey = ''
  // Idempotency keys of calls whose outcome is unknown, so a retry of the same call keeps its key.
  const pendingKeys = new Map<string, Pending>()

  /** A ready value that the tile cannot use becomes an error before anything is reported, so the first terminal state is right. */
  function validate(name: string, state: InputState): InputState {
    const check = validators[name]
    if (!check || state.status !== 'ready')
      return state
    const error = check(state.data, config)
    if (!error)
      return state
    return { ...state, status: 'error', data: null, stale: false, error: { ...error, input: error.input ?? name } }
  }

  function snapshot(): TileSnapshot {
    const inputs = Object.values(states)
    return { status: aggregateStatus(inputs), inputs: { ...states } }
  }

  function report() {
    const snap = snapshot()
    onChange(snap)
    if (disposed)
      return
    const inputs = Object.values(snap.inputs)
    if (!firstTerminalSent) {
      // The first read has exactly one terminal state. Before it, only `computing` is reported.
      if (snap.status === 'loading')
        return
      if (snap.status !== 'computing')
        firstTerminalSent = true
    }
    const detail = buildRenderState(config.requestId, snap.status, inputs)
    const key = JSON.stringify(detail)
    if (key === lastKey)
      return
    lastKey = key
    emit('render-state', detail)
  }

  for (const [name, source] of Object.entries(config.dataSources)) {
    states[name] = {
      name,
      status: 'loading',
      data: null,
      stale: false,
      error: null,
      computedAt: null,
      dataAsOf: null,
      sourceTitle: null,
      completeness: null,
      settled: false,
    }
    readers.set(name, createInputReader(name, source, deps, (state) => {
      states[name] = validate(name, state)
      report()
    }))
  }

  function start() {
    if (disposed)
      return
    if (readers.size === 0) {
      report()
      return
    }
    for (const reader of readers.values())
      reader.start()
  }

  function dispose() {
    disposed = true
    for (const reader of readers.values())
      reader.dispose()
  }

  function refresh(input?: string) {
    if (input !== undefined)
      readers.get(input)?.read()
    else
      for (const reader of readers.values()) reader.read()
  }

  function emitTileEvent(name: string, detail: unknown) {
    emit('tile-event', { request_id: config.requestId, name, detail })
  }

  async function runAction(name: string, tileArgs: Record<string, unknown> = {}): Promise<ActionResult> {
    const decl = config.actions[name]
    const finish = (status: ActionStatus, error: TileError | null, envelope: unknown, announce = true): ActionResult => {
      if (announce)
        emitTileEvent('action-done', { action: name, status })
      return { action: name, status, error, envelope }
    }
    if (!decl || !decl.url)
      return finish('failed', { code: 'undeclared', message: 'This action is not declared for the tile.' }, null)
    if (decl.confirm) {
      const confirmed = await deps.confirm({ action: name, args: tileArgs })
      if (!confirmed)
        return finish('cancelled', null, null, false)
    }
    // Reuse a key only to retry a call whose outcome was unknown. A call still in flight has not stored
    // its key, so an overlapping call with the same arguments gets its own key.
    const argsKey = JSON.stringify(tileArgs)
    const previous = pendingKeys.get(name)
    const key = previous && previous.args === argsKey ? previous.key : deps.uuid()
    pendingKeys.delete(name)
    let status: number
    let body: unknown
    try {
      const res = await deps.http.post(decl.url, { args: tileArgs, idempotency_key: key })
      status = res.status
      body = res.data
    }
    catch {
      // No answer: the action may have run. The retry keeps its key.
      pendingKeys.set(name, { args: argsKey, key })
      return finish('unknown', { code: 'network_error', message: 'The action could not be reached.' }, null)
    }
    const env = isRecord(body) && typeof body.state === 'string' ? body : null
    const rawError = env && isRecord(env.error) ? env.error : null
    const error: TileError | null = rawError
      ? {
          code: typeof rawError.code === 'string' ? rawError.code : 'action_failed',
          message: typeof rawError.message === 'string' ? rawError.message : 'The action failed.',
        }
      : null
    let result: ActionStatus
    if (status === 403)
      result = 'denied'
    else if (env && typeof env.state === 'string' && ACTION_STATES.has(env.state) && status < 500)
      result = env.state as ActionStatus
    else if (status >= 500)
      result = 'unknown'
    else
      result = 'failed'
    // A definite answer ends the call. Only an unknown outcome keeps the key for a retry.
    if (result === 'unknown')
      pendingKeys.set(name, { args: argsKey, key })
    const fallback: TileError | null = result === 'done'
      ? null
      : error ?? { code: result === 'denied' ? 'denied' : `http_${status}`, message: result === 'denied' ? 'You may not run this action.' : 'The action did not finish.' }
    return finish(result, fallback, body)
  }

  return { start, dispose, snapshot, refresh, runAction, emitTileEvent }
}
