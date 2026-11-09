import { describe, expect, it } from 'vitest'
import type { CompiledTile } from '../types'
import { currentParamValues, resolveParams, tileDependencies, tileDependsOn, tilesToRefresh } from './params'

describe('currentParamValues', () => {
  it('uses the declared default, and null when the default is null or missing', () => {
    const values = currentParamValues({
      model: { type: 'select', default: null },
      day: { type: 'date', default: '2026-06-10' },
      limit: { type: 'number', default: 0 },
    })
    expect(values).toEqual({ model: null, day: '2026-06-10', limit: 0 })
  })

  it('treats a missing default key as null', () => {
    expect(currentParamValues({ model: { type: 'select', label: 'Model' } })).toEqual({ model: null })
  })

  it('returns no values without declarations', () => {
    expect(currentParamValues(undefined)).toEqual({})
  })
})

describe('resolveParams', () => {
  const values = { model: 'claude-sonnet-4-6', limit: 0, tags: ['a'] }

  it('replaces a $param reference with the typed value', () => {
    expect(resolveParams({ model: { $param: 'model' } }, values)).toEqual({ model: 'claude-sonnet-4-6' })
    expect(resolveParams({ limit: { $param: 'limit' } }, values)).toEqual({ limit: 0 })
  })

  it('never interpolates into strings', () => {
    expect(resolveParams({ label: 'model is {{model}}' }, values)).toEqual({ label: 'model is {{model}}' })
  })

  it('resolves inside arrays and nested objects', () => {
    expect(resolveParams({ list: [{ $param: 'model' }, 1], nested: { t: { $param: 'tags' } } }, values))
      .toEqual({ list: ['claude-sonnet-4-6', 1], nested: { t: ['a'] } })
  })

  it('gives null for an unknown parameter', () => {
    expect(resolveParams({ x: { $param: 'nope' } }, values)).toEqual({ x: null })
  })

  it('does not treat an object with more keys as a reference', () => {
    expect(resolveParams({ $param: 'model', other: 1 }, values)).toEqual({ $param: 'model', other: 1 })
  })
})

const tiles: Record<string, CompiledTile> = {
  picker: { tag: 'dash-select', param: 'model', params: [], data: { main: { point: 'models' } } },
  tokens: { tag: 'dash-kpi', data: { main: { point: 'tokens', args: { model: { $param: 'model' } } } } },
  chart: { tag: 'dash-chart', data: { main: { point: 'by_day', args: { filter: { models: [{ $param: 'model' }] } } } } },
  note: { tag: 'dash-text', params: ['day'], data: { main: { point: 'note' } } },
  plain: { tag: 'dash-text', data: { main: { point: 'plain', args: {} } } },
}

describe('tileDependencies', () => {
  it('reads $param references in data args and the params list', () => {
    expect([...tileDependencies(tiles.tokens)]).toEqual(['model'])
    expect([...tileDependencies(tiles.chart)]).toEqual(['model'])
    expect([...tileDependencies(tiles.note)]).toEqual(['day'])
    expect([...tileDependencies(tiles.plain)]).toEqual([])
  })

  it('does not count the control tile as depending on its own parameter', () => {
    expect(tileDependsOn(tiles.picker, 'model')).toBe(false)
  })
})

describe('compiled tiles with missing null keys', () => {
  it('reads dependencies from a tile that has no param, params or refresh keys', () => {
    const bare: CompiledTile = { tag: 'dash-kpi', data: { main: { point: 'tokens', args: { model: { $param: 'model' } } } } }
    expect([...tileDependencies(bare)]).toEqual(['model'])
    expect(tileDependsOn({ tag: 'dash-text' }, 'model')).toBe(false)
  })
})

describe('tilesToRefresh', () => {
  it('lists only dependent tiles', () => {
    expect(tilesToRefresh(tiles, 'model')).toEqual(['tokens', 'chart'])
    expect(tilesToRefresh(tiles, 'day')).toEqual(['note'])
    expect(tilesToRefresh(tiles, 'other')).toEqual([])
  })
})
