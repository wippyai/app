import { describe, expect, it } from 'vitest'
import { ALL_KEY, buildSelectItems, currentParam, optionKey, readOptions } from './options.ts'

const frame = (fields: string[], rows: unknown[][]) => ({
  schema: 'wippy.dashboard_frame/v1',
  fields: fields.map(name => ({ name, type: 'string', nullable: false })),
  rows,
})

describe('readOptions', () => {
  it('reads value and label', () => {
    const data = frame(['value', 'label'], [
      ['claude-haiku-4-5', 'claude-haiku-4-5 (21 calls)'],
      ['claude-sonnet-4-6', 'claude-sonnet-4-6 (17 calls)'],
    ])
    expect(readOptions(data, 'value', 'label').options).toEqual([
      { value: 'claude-haiku-4-5', label: 'claude-haiku-4-5 (21 calls)' },
      { value: 'claude-sonnet-4-6', label: 'claude-sonnet-4-6 (17 calls)' },
    ])
  })

  it('uses the value as the label when the frame has no label field or the cell is null', () => {
    expect(readOptions(frame(['value'], [['a'], ['b']]), 'value', 'label').options)
      .toEqual([{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }])
    expect(readOptions(frame(['value', 'label'], [['a', null]]), 'value', 'label').options)
      .toEqual([{ value: 'a', label: 'a' }])
  })

  it('follows the fields mapping and turns numbers into strings', () => {
    const data = frame(['id', 'name'], [[7, 'Seven']])
    expect(readOptions(data, 'id', 'name').options).toEqual([{ value: '7', label: 'Seven' }])
  })

  it('drops a row without a value', () => {
    expect(readOptions(frame(['value'], [[null], ['a']]), 'value', 'label').options).toEqual([{ value: 'a', label: 'a' }])
  })

  it('reports a format mismatch when the value field is missing or the data is not a frame', () => {
    expect(readOptions(frame(['label'], []), 'value', 'label').error).toMatchObject({ code: 'format_mismatch', field: 'value' })
    expect(readOptions({}, 'value', 'label').error?.code).toBe('format_mismatch')
  })
})

describe('buildSelectItems', () => {
  const options = [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }]

  it('puts All first with a null value', () => {
    const items = buildSelectItems(options, null, 'All')
    expect(items[0]).toEqual({ key: ALL_KEY, value: null, label: 'All' })
    expect(items.map(i => i.value)).toEqual([null, 'a', 'b'])
  })

  it('adds a current value that is not in the options', () => {
    const items = buildSelectItems(options, 'zzz', 'All')
    expect(items.at(-1)).toEqual({ key: optionKey('zzz'), value: 'zzz', label: 'zzz' })
  })

  it('does not collide the All key with an option that has the value "all"', () => {
    const items = buildSelectItems([{ value: 'all', label: 'Everything' }], null, 'All')
    expect(new Set(items.map(i => i.key)).size).toBe(2)
  })
})

describe('currentParam', () => {
  it('reads the one parameter of the tile', () => {
    expect(currentParam({ model: 'claude-haiku-4-5' })).toEqual({ name: 'model', value: 'claude-haiku-4-5' })
    expect(currentParam({ model: null })).toEqual({ name: 'model', value: null })
  })

  it('gives no name and no value before the board supplies params', () => {
    expect(currentParam({})).toEqual({ name: null, value: null })
  })
})
