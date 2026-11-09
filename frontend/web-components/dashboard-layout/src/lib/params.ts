import type { CompiledTile, ParamDecl } from '../types'

/**
 * Parameter handling for the board.
 *
 * Stage B3 resolves every parameter to its declared default. Stage D1 adds argument state, `on`
 * rules and `from_path`: extend `currentParamValues` (default first, then `from_path`, then user
 * changes) and keep `resolveParams` and `tileDependsOn` as they are.
 */

export type ParamValues = Record<string, unknown>

export function currentParamValues(decls: Record<string, ParamDecl> | undefined): ParamValues {
  const values: ParamValues = {}
  for (const [name, decl] of Object.entries(decls ?? {}))
    values[name] = decl.default ?? null
  return values
}

function isParamRef(value: unknown): value is { $param: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false
  const keys = Object.keys(value)
  return keys.length === 1 && keys[0] === '$param' && typeof (value as { $param: unknown }).$param === 'string'
}

function hasValue(values: ParamValues, name: string): boolean {
  return Object.prototype.hasOwnProperty.call(values, name)
}

/** Replace each `{ "$param": name }` with the parameter's current value. Typed, never string interpolation. */
export function resolveParams(value: unknown, values: ParamValues): unknown {
  if (isParamRef(value))
    return hasValue(values, value.$param) ? values[value.$param] : null
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

/** Ids of the tiles that get a new request-id when one parameter changes. */
export function tilesToRefresh(tiles: Record<string, CompiledTile>, paramName: string): string[] {
  return Object.entries(tiles)
    .filter(([, tile]) => tileDependsOn(tile, paramName))
    .map(([id]) => id)
}
