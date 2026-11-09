import { describe, expect, it } from 'vitest'
import { NULL_MARKER, buildTable, columnLabel } from './table.ts'

const byModel = {
  schema: 'wippy.dashboard_frame/v1',
  fields: [
    { name: 'model_id', type: 'string', nullable: false },
    { name: 'calls', type: 'number', nullable: false },
    { name: 'tokens', type: 'number', nullable: false },
  ],
  rows: [['claude-sonnet-4-6', 17, 534297], ['claude-haiku-4-5', 21, 15838]],
}

describe('columnLabel', () => {
  it('replaces underscores and capitalises', () => {
    expect(columnLabel('model_id')).toBe('Model id')
    expect(columnLabel('tokens')).toBe('Tokens')
    expect(columnLabel('_')).toBe('_')
  })
})

describe('buildTable', () => {
  it('shows every field when columns is absent', () => {
    const { table, error } = buildTable(byModel, undefined, 'en')
    expect(error).toBeNull()
    expect(table?.columns).toEqual([
      { name: 'model_id', label: 'Model id', numeric: false },
      { name: 'calls', label: 'Calls', numeric: true },
      { name: 'tokens', label: 'Tokens', numeric: true },
    ])
    expect(table?.rows).toHaveLength(2)
  })

  it('formats numbers by locale and marks them numeric', () => {
    const { table } = buildTable(byModel, undefined, 'en')
    expect(table?.rows[0]).toEqual([
      { text: 'claude-sonnet-4-6', numeric: false, isNull: false },
      { text: '17', numeric: true, isNull: false },
      { text: '534,297', numeric: true, isNull: false },
    ])
  })

  it('shows only the listed columns, in the listed order', () => {
    const { table } = buildTable(byModel, ['tokens', 'model_id'], 'en')
    expect(table?.columns.map(c => c.name)).toEqual(['tokens', 'model_id'])
    expect(table?.rows[1]?.map(c => c.text)).toEqual(['15,838', 'claude-haiku-4-5'])
  })

  it('shows a null as a marker and never as 0', () => {
    const data = { fields: [{ name: 'a', type: 'number' }, { name: 'b', type: 'string' }], rows: [[null, null], [0, 'x']] }
    const { table } = buildTable(data, undefined, 'en')
    expect(table?.rows[0]).toEqual([
      { text: NULL_MARKER, numeric: true, isNull: true },
      { text: NULL_MARKER, numeric: false, isNull: true },
    ])
    expect(table?.rows[1]?.[0]?.text).toBe('0')
  })

  it('keeps decimal strings exact and leaves non-numbers in a number column as text', () => {
    const data = { fields: [{ name: 'a', type: 'decimal' }], rows: [['1234.50'], ['n/a']] }
    const { table } = buildTable(data, undefined, 'en')
    expect(table?.rows.map(r => r[0]?.text)).toEqual(['1,234.5', 'n/a'])
  })

  it('reports a listed column that the frame lacks', () => {
    expect(buildTable(byModel, ['nope'], 'en').error).toMatchObject({ code: 'format_mismatch', field: 'nope' })
  })

  it('reports data that is not a frame', () => {
    expect(buildTable({ rows: 3 }, undefined, 'en').error?.code).toBe('format_mismatch')
  })

  it('keeps a frame with no rows as columns with no rows', () => {
    const { table } = buildTable({ fields: byModel.fields, rows: [] }, undefined, 'en')
    expect(table?.columns).toHaveLength(3)
    expect(table?.rows).toEqual([])
  })
})
