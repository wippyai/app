import { describe, expect, it } from 'vitest'
import type { CompiledTile } from '../types'
import { buildActions, buildDataSources, buildTileAttributes, buildTileParams } from './tile-attrs'

const tile: CompiledTile = {
  tag: 'dash-chart',
  fields: { x: 'day', y: ['tokens'] },
  options: { label: 'Tokens by day' },
  data: {
    main: { point: 'by_day', args: { model: { $param: 'model' } }, refresh_ms: 30000, live_topic: 'dash.users.changed' },
    extra: { point: 'with space', args: {} },
  },
  actions: { set_status: { confirm: true, allowed: true, refreshes: ['users'] }, ping: {} },
  params: ['day'],
}

const values = { model: 'claude-sonnet-4-6', day: null }

describe('buildDataSources', () => {
  it('builds each url from page-url and the point name', () => {
    const sources = buildDataSources('/api/v1/dashboards/pages/llm_usage', tile, values) as Record<string, Record<string, unknown>>
    expect(sources.main.url).toBe('/api/v1/dashboards/pages/llm_usage/points/by_day')
    expect(sources.main.args).toEqual({ model: 'claude-sonnet-4-6' })
    expect(sources.main.refresh_ms).toBe(30000)
    expect(sources.main.live_topic).toBe('dash.users.changed')
  })

  it('encodes the point name and defaults refresh_ms and live_topic to null', () => {
    const sources = buildDataSources('/p/x', tile, values) as Record<string, Record<string, unknown>>
    expect(sources.extra.url).toBe('/p/x/points/with%20space')
    expect(sources.extra.refresh_ms).toBeNull()
    expect(sources.extra.live_topic).toBeNull()
  })

  it('treats missing refresh_ms and live_topic as null', () => {
    const sources = buildDataSources('/p/x', { tag: 'dash-kpi', data: { main: { point: 'tokens' } } }, {}) as Record<string, Record<string, unknown>>
    expect(sources.main).toEqual({ url: '/p/x/points/tokens', args: {}, refresh_ms: null, live_topic: null })
  })

  it('ignores a trailing slash on page-url', () => {
    const sources = buildDataSources('/p/x/', tile, values) as Record<string, Record<string, unknown>>
    expect(sources.main.url).toBe('/p/x/points/by_day')
  })

  it('gives an empty object for a tile without data', () => {
    expect(buildDataSources('/p/x', { tag: 'dash-text' }, {})).toEqual({})
  })
})

describe('buildActions', () => {
  it('builds each url from page-url and the action name, with confirm and allowed as booleans', () => {
    expect(buildActions('/p/x', tile)).toEqual({
      set_status: { url: '/p/x/actions/set_status', confirm: true, allowed: true },
      ping: { url: '/p/x/actions/ping', confirm: false, allowed: false },
    })
  })

  it('passes allowed false when the server says the viewer may not run the action', () => {
    const refused: CompiledTile = { tag: 'user-status', actions: { set_status: { confirm: true, allowed: false } } }
    expect(buildActions('/p/x', refused)).toEqual({
      set_status: { url: '/p/x/actions/set_status', confirm: true, allowed: false },
    })
  })

  it('names the page action in the url when the page maps the tile action to another name', () => {
    const aliased: CompiledTile = { tag: 'user-status', actions: { set_status: { action: 'disable_user', confirm: true, allowed: true } } }
    expect(buildActions('/p/x', aliased)).toEqual({
      set_status: { url: '/p/x/actions/disable_user', confirm: true, allowed: true },
    })
  })
})

describe('buildTileParams', () => {
  it('holds the current value of each parameter the tile declares', () => {
    expect(buildTileParams(tile, values)).toEqual({ day: null })
    expect(buildTileParams({ tag: 'x', params: ['model'] }, values)).toEqual({ model: 'claude-sonnet-4-6' })
  })

  it('gives a control tile its own parameter', () => {
    expect(buildTileParams({ tag: 'dash-select', param: 'model' }, values)).toEqual({ model: 'claude-sonnet-4-6' })
    expect(buildTileParams({ tag: 'dash-select', param: 'day', params: ['model'] }, values)).toEqual({ model: 'claude-sonnet-4-6', day: null })
  })

  it('gives null for a parameter that has no value', () => {
    expect(buildTileParams({ tag: 'dash-select', param: 'model' }, {})).toEqual({ model: null })
  })
})

describe('buildTileAttributes', () => {
  const attrs = buildTileAttributes({ pageUrl: '/p/x', tileId: 'by_day', tile, values, requestId: 'r1:by_day' })

  it('sets request-id last and mode to view', () => {
    expect(attrs.map(([name]) => name)).toEqual([
      'tile-id', 'data-sources', 'actions', 'fields', 'options', 'params', 'mode', 'request-id',
    ])
    expect(attrs[attrs.length - 1]).toEqual(['request-id', 'r1:by_day'])
    expect(Object.fromEntries(attrs).mode).toBe('view')
  })

  it('serializes the JSON attributes', () => {
    const map = Object.fromEntries(attrs)
    expect(map['tile-id']).toBe('by_day')
    expect(JSON.parse(map.fields)).toEqual({ x: 'day', y: ['tokens'] })
    expect(JSON.parse(map.options)).toEqual({ label: 'Tokens by day' })
    expect(JSON.parse(map['data-sources']).main.args).toEqual({ model: 'claude-sonnet-4-6' })
  })

  it('defaults fields and options to empty objects', () => {
    const map = Object.fromEntries(buildTileAttributes({ pageUrl: '/p', tileId: 't', tile: { tag: 'dash-text' }, values: {}, requestId: 'r' }))
    expect(map.fields).toBe('{}')
    expect(map.options).toBe('{}')
    expect(map['data-sources']).toBe('{}')
    expect(map.actions).toBe('{}')
    expect(map.params).toBe('{}')
  })
})
