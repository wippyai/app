import type { CompiledTile } from '../types'
import { resolveParams } from './params'
import type { ParamValues } from './params'

export interface TileAttributeInput {
  pageUrl: string
  tileId: string
  tile: CompiledTile
  values: ParamValues
  requestId: string
}

function baseUrl(pageUrl: string): string {
  return pageUrl.replace(/\/+$/, '')
}

/** `data-sources` (contracts section 6): one entry per input, URL built from `page-url`. */
export function buildDataSources(pageUrl: string, tile: CompiledTile, values: ParamValues): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [input, source] of Object.entries(tile.data ?? {})) {
    out[input] = {
      url: `${baseUrl(pageUrl)}/points/${encodeURIComponent(source.point)}`,
      args: resolveParams(source.args ?? {}, values),
      refresh_ms: source.refresh_ms ?? null,
      live_topic: source.live_topic ?? null,
    }
  }
  return out
}

/**
 * `actions` (contracts section 6): one entry per action under the tile's own name. The URL names the
 * page's action, which differs from the tile's name when the page maps the tile action to another one.
 * `allowed` is true only when the server said the viewer may run the action.
 */
export function buildActions(pageUrl: string, tile: CompiledTile): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [name, action] of Object.entries(tile.actions ?? {})) {
    const target = typeof action.action === 'string' && action.action !== '' ? action.action : name
    out[name] = {
      url: `${baseUrl(pageUrl)}/actions/${encodeURIComponent(target)}`,
      confirm: action.confirm === true,
      allowed: action.allowed === true,
    }
  }
  return out
}

/**
 * `params`: current values of the parameters the tile declares. A control tile (`param` set) also
 * gets its own parameter, so it can show the selection (contracts section 6).
 */
export function buildTileParams(tile: CompiledTile, values: ParamValues): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  const names = tile.param ? [...(tile.params ?? []), tile.param] : (tile.params ?? [])
  for (const name of names)
    out[name] = Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null
  return out
}

/**
 * The attributes the board sets on a tile element, in the order it sets them.
 * `request-id` is last: it commits the configuration (contracts section 8).
 */
export function buildTileAttributes(input: TileAttributeInput): Array<[string, string]> {
  const { pageUrl, tileId, tile, values, requestId } = input
  return [
    ['tile-id', tileId],
    ['data-sources', JSON.stringify(buildDataSources(pageUrl, tile, values))],
    ['actions', JSON.stringify(buildActions(pageUrl, tile))],
    ['fields', JSON.stringify(tile.fields ?? {})],
    ['options', JSON.stringify(tile.options ?? {})],
    ['params', JSON.stringify(buildTileParams(tile, values))],
    ['mode', 'view'],
    ['request-id', requestId],
  ]
}
