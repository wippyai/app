import type { CompiledTile, ParamDecl } from '../types'

/**
 * Parameter handling for the board (contracts section 6).
 *
 * Current values are the declared default, then the `from_path` segment, then the viewer's changes.
 * Everything here is pure, so it runs in unit tests without a DOM.
 */

/** The event name that the tile helper reserves for a finished action (contracts section 8). */
export const ACTION_DONE_EVENT = 'action-done'

export type ParamValues = Record<string, unknown>
type Decls = Record<string, ParamDecl> | undefined

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function has(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key)
}

/** The default of every declared parameter. A missing `default` key means null. */
export function defaultValues(decls: Decls): ParamValues {
  const values: ParamValues = {}
  for (const [name, decl] of Object.entries(decls ?? {}))
    values[name] = decl.default ?? null
  return values
}

function isCalendarDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value)
  if (!match)
    return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

/**
 * True when `value` is allowed for the parameter's declared type. `select` and `date` accept null
 * (no selection). `string`, `number` and `boolean` need a value of their own type.
 */
export function isValidParamValue(decl: ParamDecl | undefined, value: unknown): boolean {
  if (!decl)
    return false
  switch (decl.type) {
    case 'select': return value === null || typeof value === 'string'
    case 'date': return value === null || (typeof value === 'string' && isCalendarDate(value))
    case 'string': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'boolean': return typeof value === 'boolean'
    default: return false
  }
}

/** Segment `index` of a sub-path (`""` at the page root, `/a/b` below it), URL-decoded, else null. */
export function pathSegment(subPath: string | undefined, index: number): string | null {
  if (!subPath || !Number.isInteger(index) || index < 0)
    return null
  const raw = subPath.replace(/^\//, '').split('/')[index]
  if (raw === undefined || raw === '')
    return null
  try {
    return decodeURIComponent(raw)
  }
  catch {
    return null
  }
}

/** A path segment is text. A number or boolean parameter reads it as that type. */
function coercePathValue(type: string, text: string): unknown {
  if (type === 'number')
    return text.trim() === '' ? text : Number(text)
  if (type === 'boolean')
    return text === 'true' ? true : (text === 'false' ? false : text)
  return text
}

/** Values that the sub-path supplies: one per parameter with `from_path` whose segment is valid for its type. */
export function fromPathValues(decls: Decls, subPath: string | undefined): ParamValues {
  const values: ParamValues = {}
  for (const [name, decl] of Object.entries(decls ?? {})) {
    if (typeof decl.from_path !== 'number')
      continue
    const text = pathSegment(subPath, decl.from_path)
    if (text === null)
      continue
    const value = coercePathValue(decl.type, text)
    if (isValidParamValue(decl, value))
      values[name] = value
  }
  return values
}

/** Default first, then `from_path`, then the viewer's changes. Changes to undeclared names are ignored. */
export function currentParamValues(decls: Decls, subPath = '', changes: ParamValues = {}): ParamValues {
  const values = { ...defaultValues(decls), ...fromPathValues(decls, subPath) }
  for (const name of Object.keys(values)) {
    if (has(changes, name))
      values[name] = changes[name]
  }
  return values
}

/** Names whose value differs between two value maps. */
export function changedParams(prev: ParamValues, next: ParamValues): string[] {
  const names = new Set([...Object.keys(prev), ...Object.keys(next)])
  return [...names].filter(name => !Object.is(prev[name] ?? null, next[name] ?? null))
}

/**
 * The viewer's changes after the sub-path moves (browser back or forward). A parameter that comes
 * from the path takes the new path's value, so its earlier change is dropped when the path value
 * differs. Changes to other parameters stay.
 */
export function changesAfterPathChange(decls: Decls, previousPath: string | undefined, nextPath: string | undefined, changes: ParamValues): ParamValues {
  const before = fromPathValues(decls, previousPath)
  const after = fromPathValues(decls, nextPath)
  const kept = { ...changes }
  for (const name of changedParams(before, after))
    Reflect.deleteProperty(kept, name)
  return kept
}

/**
 * Clear parameters back to their declared default (all of them when `names` is missing). The change
 * is explicit, so a value that came from the path does not come back.
 */
export function clearedChanges(decls: Decls, changes: ParamValues, names?: string[]): ParamValues {
  const defaults = defaultValues(decls)
  const next = { ...changes }
  for (const name of names ?? Object.keys(defaults)) {
    if (has(defaults, name))
      next[name] = defaults[name]
  }
  return next
}

export interface Selection {
  name: string
  label: string
  value: unknown
  /** The value as text, for a chip. */
  text: string
}

/** The parameters whose current value differs from their default, in declaration order. */
export function activeSelections(decls: Decls, values: ParamValues): Selection[] {
  const defaults = defaultValues(decls)
  const out: Selection[] = []
  for (const [name, decl] of Object.entries(decls ?? {})) {
    const value = values[name] ?? null
    if (Object.is(value, defaults[name]))
      continue
    out.push({ name, label: decl.label || name, value, text: String(value) })
  }
  return out
}

/**
 * The parameter changes that one tile event asks for, already checked against the declared types.
 * A control tile (`param` set) sets its parameter on `change`. Any other tile uses the `on` rule for
 * the event: `{ set: { <param>: { $event: <field> } } }` reads `detail[<field>]`. An event the tile
 * does not mention, or a value of the wrong type, changes nothing.
 */
export function eventChanges(tile: CompiledTile, name: string, detail: unknown, decls: Decls): ParamValues {
  const fields = detail !== null && typeof detail === 'object' ? detail as Record<string, unknown> : {}
  const out: ParamValues = {}
  const propose = (param: string, value: unknown) => {
    if (decls && has(decls, param) && isValidParamValue(decls[param], value))
      out[param] = value
  }
  if (tile.param && name === 'change') {
    if (has(fields, 'value'))
      propose(tile.param, fields.value)
    return out
  }
  const rule = tile.on && has(tile.on, name) ? tile.on[name] : undefined
  const set = rule !== null && typeof rule === 'object' ? (rule as { set?: unknown }).set : undefined
  if (set === null || typeof set !== 'object')
    return out
  for (const [param, source] of Object.entries(set as Record<string, unknown>)) {
    if (source === null || typeof source !== 'object')
      continue
    const field = (source as { $event?: unknown }).$event
    if (typeof field === 'string' && has(fields, field))
      propose(param, fields[field])
  }
  return out
}

/**
 * The changes to apply for a `tile-event`, or an empty map. An event whose `request_id` is not the
 * tile's current one is stale and changes nothing.
 */
export function acceptTileEvent(
  tile: CompiledTile | undefined,
  currentRequestId: string | undefined,
  event: { request_id?: unknown, name?: unknown, detail?: unknown } | null | undefined,
  decls: Decls,
): ParamValues {
  if (!tile || !event || typeof event.name !== 'string')
    return {}
  if (!currentRequestId || event.request_id !== currentRequestId)
    return {}
  return eventChanges(tile, event.name, event.detail, decls)
}

/**
 * The tiles that get a new request-id after a `tile-event` `action-done` (contracts section 8): the tiles
 * whose `data` uses a point that the finished action `refreshes`. Only `status: done` refreshes anything;
 * a failed, denied, unknown or cancelled action changed nothing the board knows of. An event with another
 * request-id than the tile's current one is stale and refreshes nothing.
 */
export function tilesToRefreshAfterAction(
  tiles: Record<string, CompiledTile>,
  tileId: string,
  currentRequestId: string | undefined,
  event: { request_id?: unknown, name?: unknown, detail?: unknown } | null | undefined,
): string[] {
  const tile = has(tiles, tileId) ? tiles[tileId] : undefined
  if (!tile || !event || event.name !== ACTION_DONE_EVENT)
    return []
  if (!currentRequestId || event.request_id !== currentRequestId)
    return []
  const detail = event.detail !== null && typeof event.detail === 'object' ? event.detail as { action?: unknown, status?: unknown } : {}
  if (detail.status !== 'done' || typeof detail.action !== 'string')
    return []
  const action = tile.actions && has(tile.actions, detail.action) ? tile.actions[detail.action] : undefined
  const points = new Set((action?.refreshes ?? []).filter((p): p is string => typeof p === 'string'))
  if (points.size === 0)
    return []
  return Object.entries(tiles)
    .filter(([, other]) => Object.values(other.data ?? {}).some(source => points.has(source.point)))
    .map(([id]) => id)
}

function isParamRef(value: unknown): value is { $param: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === '$param' && typeof (value as { $param: unknown }).$param === 'string'
}

/** Replace each `{ "$param": name }` with the parameter's current value. Typed, never string interpolation. */
export function resolveParams(value: unknown, values: ParamValues): unknown {
  if (isParamRef(value))
    return has(values, value.$param) ? values[value.$param] : null
  if (Array.isArray(value))
    return value.map(item => resolveParams(item, values))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, resolveParams(v, values)]),
    )
  }
  return value
}

function collectParamNames(value: unknown, into: Set<string>): void {
  if (isParamRef(value)) {
    into.add(value.$param)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectParamNames(item, into)
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) collectParamNames(v, into)
  }
}

/** Parameters a tile depends on: those in its `data` args, plus its `params` list. */
export function tileDependencies(tile: CompiledTile): Set<string> {
  const names = new Set<string>(tile.params ?? [])
  for (const source of Object.values(tile.data ?? {}))
    collectParamNames(source.args, names)
  return names
}

export function tileDependsOn(tile: CompiledTile, paramName: string): boolean {
  return tileDependencies(tile).has(paramName)
}

/** Ids of the tiles that depend on any of the given parameters. These get a new request-id. */
export function tilesToRefreshFor(tiles: Record<string, CompiledTile>, names: string[]): string[] {
  return Object.entries(tiles)
    .filter(([, tile]) => names.some(name => tileDependsOn(tile, name)))
    .map(([id]) => id)
}

/** Ids of the tiles that get a new request-id when one parameter changes. */
export function tilesToRefresh(tiles: Record<string, CompiledTile>, paramName: string): string[] {
  return tilesToRefreshFor(tiles, [paramName])
}
