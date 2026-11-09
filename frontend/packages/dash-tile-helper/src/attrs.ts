import type { ActionDecl, DataSource, TileConfig } from './types.ts'

/** Props schema of the tile attributes. Kebab-case on purpose: only declared kebab-case attributes are reactive after mount. */
export const tilePropsSchema = {
  type: 'object',
  properties: {
    'tile-id': { type: 'string', default: '', description: 'Tile id in the page.' },
    'request-id': { type: 'string', default: '', description: 'A new id for each configuration. The board sets it last, and the tile starts work only when it is set.' },
    'data-sources': { type: 'object', description: 'Map from input name to { url, args, refresh_ms, live_topic }.' },
    'actions': { type: 'object', description: 'Map from action name to { url, confirm }.' },
    'fields': { type: 'object', description: 'Map from the tile field names to data field names.' },
    'options': { type: 'object', description: 'Tile options.' },
    'params': { type: 'object', description: 'Current values of the page parameters the tile declares.' },
    'mode': { type: 'string', default: 'view', description: 'view (the POC has no edit mode).' },
  },
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** An attribute arrives as a parsed object (props schema type object) or as a JSON string. Anything else is null. */
function readObject(value: unknown): Record<string, unknown> | null {
  if (isRecord(value))
    return value
  if (typeof value === 'string' && value.trim() !== '') {
    try {
      const parsed: unknown = JSON.parse(value)
      return isRecord(parsed) ? parsed : null
    }
    catch {
      return null
    }
  }
  return null
}

/** The value under a kebab-case attribute name or its camelCase prop name. */
function pick(raw: Record<string, unknown>, kebab: string): unknown {
  if (kebab in raw)
    return raw[kebab]
  const camel = kebab.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())
  return raw[camel]
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function readSource(value: unknown): DataSource {
  const source = isRecord(value) ? value : {}
  const refresh = source.refresh_ms
  const topic = source.live_topic
  return {
    url: typeof source.url === 'string' ? source.url : '',
    args: isRecord(source.args) ? source.args : {},
    refresh_ms: typeof refresh === 'number' && Number.isFinite(refresh) && refresh > 0 ? refresh : null,
    live_topic: typeof topic === 'string' && topic !== '' ? topic : null,
  }
}

function readAction(value: unknown): ActionDecl {
  const action = isRecord(value) ? value : {}
  return {
    url: typeof action.url === 'string' ? action.url : '',
    confirm: action.confirm === true,
  }
}

/**
 * Parse the tile attributes (contracts section 8). `raw` is the props object of `useProps()` or a map
 * of attribute strings. Missing keys become null or empty values, because the server leaves null keys out.
 */
export function parseTileAttributes(raw: Record<string, unknown>): TileConfig {
  const sources = readObject(pick(raw, 'data-sources')) ?? {}
  const actions = readObject(pick(raw, 'actions')) ?? {}
  const dataSources: Record<string, DataSource> = {}
  for (const [name, value] of Object.entries(sources))
    dataSources[name] = readSource(value)
  const declared: Record<string, ActionDecl> = {}
  for (const [name, value] of Object.entries(actions))
    declared[name] = readAction(value)
  return {
    tileId: readString(pick(raw, 'tile-id'), ''),
    requestId: readString(pick(raw, 'request-id'), ''),
    dataSources,
    actions: declared,
    fields: readObject(pick(raw, 'fields')) ?? {},
    options: readObject(pick(raw, 'options')) ?? {},
    params: readObject(pick(raw, 'params')) ?? {},
    mode: readString(pick(raw, 'mode'), 'view') || 'view',
  }
}

/** The data field a tile field maps to: `fields[name]` when it is a string, else the tile field name itself. */
export function mappedField(fields: Record<string, unknown>, name: string): string {
  const mapped = fields[name]
  return typeof mapped === 'string' && mapped !== '' ? mapped : name
}

/**
 * The URL of one read (contracts section 3): `args` as one URL-encoded JSON value in the `args`
 * query parameter, and `operation` when the read follows a `computing` result.
 */
export function buildReadUrl(url: string, args: Record<string, unknown>, operation?: string): string {
  const join = url.includes('?') ? '&' : '?'
  let out = `${url}${join}args=${encodeURIComponent(JSON.stringify(args))}`
  if (operation !== undefined && operation !== '')
    out += `&operation=${encodeURIComponent(operation)}`
  return out
}
