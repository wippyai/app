import { describe, expect, it } from 'vitest'
import type { CompiledTile, ParamDecl } from '../types'
import {
  acceptTileEvent,
  activeSelections,
  changedParams,
  changesAfterPathChange,
  clearedChanges,
  currentParamValues,
  eventChanges,
  fromPathValues,
  isValidParamValue,
  pathSegment,
  tilesToRefreshFor,
} from './params'

// Argument state of the board (stage D1): path values, events, clearing and dependent tiles.

const usageDecls: Record<string, ParamDecl> = {
  model: { type: 'select', label: 'Model', from_path: 0 },
  day: { type: 'date', label: 'Day' },
}

describe('pathSegment', () => {
  it('reads segment N of the sub-path', () => {
    expect(pathSegment('/claude-haiku-4-5', 0)).toBe('claude-haiku-4-5')
    expect(pathSegment('/a/b', 1)).toBe('b')
  })

  it('gives null at the page root, past the end, or for an empty segment', () => {
    expect(pathSegment('', 0)).toBeNull()
    expect(pathSegment(undefined, 0)).toBeNull()
    expect(pathSegment('/a', 1)).toBeNull()
    expect(pathSegment('/a//c', 1)).toBeNull()
  })

  it('decodes the segment and gives null for broken encoding', () => {
    expect(pathSegment('/a%20b%2Fc', 0)).toBe('a b/c')
    expect(pathSegment('/%E0%A4%A', 0)).toBeNull()
  })
})

describe('isValidParamValue', () => {
  it('checks each declared type', () => {
    expect(isValidParamValue({ type: 'select' }, 'x')).toBe(true)
    expect(isValidParamValue({ type: 'select' }, null)).toBe(true)
    expect(isValidParamValue({ type: 'select' }, 3)).toBe(false)
    expect(isValidParamValue({ type: 'date' }, '2026-08-31')).toBe(true)
    expect(isValidParamValue({ type: 'date' }, null)).toBe(true)
    expect(isValidParamValue({ type: 'date' }, '2026-02-30')).toBe(false)
    expect(isValidParamValue({ type: 'date' }, '31/08/2026')).toBe(false)
    expect(isValidParamValue({ type: 'string' }, 'a')).toBe(true)
    expect(isValidParamValue({ type: 'string' }, null)).toBe(false)
    expect(isValidParamValue({ type: 'number' }, 0)).toBe(true)
    expect(isValidParamValue({ type: 'number' }, Number.NaN)).toBe(false)
    expect(isValidParamValue({ type: 'number' }, '1')).toBe(false)
    expect(isValidParamValue({ type: 'boolean' }, false)).toBe(true)
    expect(isValidParamValue({ type: 'boolean' }, 'true')).toBe(false)
  })

  it('refuses an undeclared parameter and an unknown type', () => {
    expect(isValidParamValue(undefined, 'x')).toBe(false)
    expect(isValidParamValue({ type: 'mystery' }, 'x')).toBe(false)
  })
})

describe('from_path and current values', () => {
  it('applies the path segment over the default', () => {
    expect(fromPathValues(usageDecls, '/claude-haiku-4-5')).toEqual({ model: 'claude-haiku-4-5' })
    expect(currentParamValues(usageDecls, '/claude-haiku-4-5')).toEqual({ model: 'claude-haiku-4-5', day: null })
  })

  it('keeps the default at the page root', () => {
    expect(currentParamValues(usageDecls, '')).toEqual({ model: null, day: null })
    expect(currentParamValues({ model: { type: 'select', default: 'a', from_path: 0 } }, '')).toEqual({ model: 'a' })
  })

  it('reads number and boolean segments as their type and drops an invalid one', () => {
    const decls: Record<string, ParamDecl> = {
      n: { type: 'number', from_path: 0, default: 1 },
      b: { type: 'boolean', from_path: 1 },
      d: { type: 'date', from_path: 2 },
    }
    expect(currentParamValues(decls, '/7/true/2026-08-31')).toEqual({ n: 7, b: true, d: '2026-08-31' })
    expect(currentParamValues(decls, '/x/maybe/nope')).toEqual({ n: 1, b: null, d: null })
  })

  it('lets the viewer change win over the path and the default', () => {
    expect(currentParamValues(usageDecls, '/claude-haiku-4-5', { model: 'claude-sonnet-4-6', day: '2026-08-31' }))
      .toEqual({ model: 'claude-sonnet-4-6', day: '2026-08-31' })
    expect(currentParamValues(usageDecls, '/claude-haiku-4-5', { model: null })).toEqual({ model: null, day: null })
  })

  it('ignores a change to an undeclared parameter', () => {
    expect(currentParamValues(usageDecls, '', { other: 'x' })).toEqual({ model: null, day: null })
  })
})

describe('changedParams', () => {
  it('lists the names whose value differs, treating a missing key as null', () => {
    expect(changedParams({ a: 1, b: null }, { a: 2, b: null })).toEqual(['a'])
    expect(changedParams({ a: 1 }, { a: 1, b: null })).toEqual([])
    expect(changedParams({ a: 1 }, { a: 1, b: 'x' })).toEqual(['b'])
  })
})

describe('changesAfterPathChange', () => {
  it('drops a change to a path parameter when the path value differs', () => {
    expect(changesAfterPathChange(usageDecls, '/a', '/b', { model: 'z', day: '2026-08-31' })).toEqual({ day: '2026-08-31' })
    expect(changesAfterPathChange(usageDecls, '/a', '', { model: 'z' })).toEqual({})
  })

  it('keeps the change when the path value is the same', () => {
    expect(changesAfterPathChange(usageDecls, '/a', '/a', { model: 'z' })).toEqual({ model: 'z' })
  })
})

describe('clearedChanges', () => {
  const decls: Record<string, ParamDecl> = { ...usageDecls, limit: { type: 'number', default: 5 } }

  it('returns a parameter to its default, not to the path value', () => {
    const changes = clearedChanges(decls, { model: 'z' }, ['model'])
    expect(changes).toEqual({ model: null })
    expect(currentParamValues(decls, '/claude-haiku-4-5', changes).model).toBeNull()
  })

  it('clears every parameter when no name is given', () => {
    expect(clearedChanges(decls, { model: 'z', day: '2026-08-31', limit: 9 })).toEqual({ model: null, day: null, limit: 5 })
  })

  it('does not invent a change for an undeclared name', () => {
    expect(clearedChanges(decls, {}, ['nope'])).toEqual({})
  })
})

describe('activeSelections', () => {
  it('lists the parameters that differ from their default, with their label', () => {
    expect(activeSelections(usageDecls, { model: 'claude-haiku-4-5', day: null })).toEqual([
      { name: 'model', label: 'Model', value: 'claude-haiku-4-5', text: 'claude-haiku-4-5' },
    ])
  })

  it('is empty when every value is the default', () => {
    expect(activeSelections(usageDecls, { model: null, day: null })).toEqual([])
    expect(activeSelections({ limit: { type: 'number', default: 5 } }, { limit: 5 })).toEqual([])
  })

  it('falls back to the parameter name without a label', () => {
    expect(activeSelections({ q: { type: 'string' } }, { q: 'x' })[0].label).toBe('q')
  })
})

describe('eventChanges', () => {
  const picker: CompiledTile = { tag: 'dash-select', param: 'model' }
  const chart: CompiledTile = { tag: 'dash-chart', on: { select: { set: { day: { $event: 'x' } } } } }

  it('sets the control parameter from change, and null clears it', () => {
    expect(eventChanges(picker, 'change', { value: 'claude-sonnet-4-6' }, usageDecls)).toEqual({ model: 'claude-sonnet-4-6' })
    expect(eventChanges(picker, 'change', { value: null }, usageDecls)).toEqual({ model: null })
  })

  it('ignores a change without a value or with the wrong type', () => {
    expect(eventChanges(picker, 'change', {}, usageDecls)).toEqual({})
    expect(eventChanges(picker, 'change', { value: 7 }, usageDecls)).toEqual({})
    expect(eventChanges(picker, 'change', undefined, usageDecls)).toEqual({})
  })

  it('applies an on rule and reads the named field of the detail', () => {
    expect(eventChanges(chart, 'select', { x: '2026-08-31', series: 'm', value: 1 }, usageDecls)).toEqual({ day: '2026-08-31' })
  })

  it('ignores an event the tile does not mention', () => {
    expect(eventChanges(chart, 'hover', { x: '2026-08-31' }, usageDecls)).toEqual({})
    expect(eventChanges({ tag: 'dash-kpi' }, 'select', { x: '2026-08-31' }, usageDecls)).toEqual({})
    expect(eventChanges(chart, 'change', { value: 'x' }, usageDecls)).toEqual({})
  })

  it('ignores an invalid value, a missing field and an undeclared parameter', () => {
    expect(eventChanges(chart, 'select', { x: 'not a date' }, usageDecls)).toEqual({})
    expect(eventChanges(chart, 'select', { y: '2026-08-31' }, usageDecls)).toEqual({})
    expect(eventChanges(chart, 'select', { x: '2026-08-31' }, { model: usageDecls.model })).toEqual({})
    expect(eventChanges(chart, 'select', { x: '2026-08-31' }, undefined)).toEqual({})
  })

  it('does not read inherited keys', () => {
    expect(eventChanges({ tag: 'x', on: {} }, 'toString', {}, usageDecls)).toEqual({})
    expect(eventChanges(chart, 'select', JSON.parse('{"__proto__": {"x": "2026-08-31"}}'), usageDecls)).toEqual({})
  })
})

describe('acceptTileEvent', () => {
  const picker: CompiledTile = { tag: 'dash-select', param: 'model' }
  const event = { request_id: 'r2:model_picker', name: 'change', detail: { value: 'claude-sonnet-4-6' } }

  it('accepts an event with the current request-id of the tile', () => {
    expect(acceptTileEvent(picker, 'r2:model_picker', event, usageDecls)).toEqual({ model: 'claude-sonnet-4-6' })
  })

  it('ignores an event with another request-id', () => {
    expect(acceptTileEvent(picker, 'r3:model_picker', event, usageDecls)).toEqual({})
    expect(acceptTileEvent(picker, undefined, event, usageDecls)).toEqual({})
  })

  it('ignores a missing tile or a malformed event', () => {
    expect(acceptTileEvent(undefined, 'r2:model_picker', event, usageDecls)).toEqual({})
    expect(acceptTileEvent(picker, 'r2:model_picker', null, usageDecls)).toEqual({})
    expect(acceptTileEvent(picker, 'r2:model_picker', { request_id: 'r2:model_picker' }, usageDecls)).toEqual({})
  })
})

describe('dependent tiles after a change', () => {
  const usageTiles: Record<string, CompiledTile> = {
    text: { tag: 'dash-text', data: { main: { point: 'summary' } } },
    model_picker: { tag: 'dash-select', param: 'model', params: [], data: { main: { point: 'models' } } },
    tokens: { tag: 'dash-kpi', data: { main: { point: 'tokens', args: { model: { $param: 'model' } } } } },
    by_day: {
      tag: 'dash-chart',
      data: { main: { point: 'by_day', args: { model: { $param: 'model' } } } },
      on: { select: { set: { day: { $event: 'x' } } } },
    },
    by_model: {
      tag: 'dash-table',
      data: { main: { point: 'by_model', args: { model: { $param: 'model' }, day: { $param: 'day' } } } },
    },
  }

  it('refreshes tokens, by_day and by_model for model, and not text or the picker', () => {
    expect(tilesToRefreshFor(usageTiles, ['model'])).toEqual(['tokens', 'by_day', 'by_model'])
  })

  it('refreshes only by_model for day', () => {
    expect(tilesToRefreshFor(usageTiles, ['day'])).toEqual(['by_model'])
  })

  it('lists a tile once for several parameters, and none for no change', () => {
    expect(tilesToRefreshFor(usageTiles, ['model', 'day'])).toEqual(['tokens', 'by_day', 'by_model'])
    expect(tilesToRefreshFor(usageTiles, [])).toEqual([])
  })
})
