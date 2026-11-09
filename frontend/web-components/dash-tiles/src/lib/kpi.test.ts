import { describe, expect, it } from 'vitest'
import { formatNumber } from './format.ts'
import { readKpi } from './kpi.ts'

const frame = (rows: unknown[][], type = 'number') => ({
  schema: 'wippy.dashboard_frame/v1',
  fields: [{ name: 'tokens', type, nullable: false }, { name: 'calls', type: 'number', nullable: false }],
  rows,
})

describe('formatNumber', () => {
  it('groups digits by the locale', () => {
    expect(formatNumber(550135, 'en')).toBe('550,135')
    expect(formatNumber(550135, 'de')).toBe('550.135')
    expect(formatNumber(14, 'en')).toBe('14')
  })

  it('keeps a decimal string exact', () => {
    expect(formatNumber('12345678901234567890', 'en')).toBe('12,345,678,901,234,567,890')
    expect(formatNumber('1234.5', 'en')).toBe('1,234.5')
  })
})

describe('readKpi', () => {
  it('reads the mapped field of the single row', () => {
    expect(readKpi(frame([[550135, 38]]), 'tokens')).toEqual({ value: 550135, error: null })
    expect(readKpi(frame([[550135, 38]]), 'calls')).toEqual({ value: 38, error: null })
  })

  it('keeps zero as zero', () => {
    expect(readKpi(frame([[0, 0]]), 'tokens').value).toBe(0)
  })

  it('reads a decimal that travels as a string', () => {
    expect(readKpi(frame([['12.50', 1]], 'decimal'), 'tokens')).toEqual({ value: '12.50', error: null })
  })

  it('gives null for no row or a null cell, never 0', () => {
    expect(readKpi(frame([]), 'tokens')).toEqual({ value: null, error: null })
    expect(readKpi(frame([[null, 1]]), 'tokens')).toEqual({ value: null, error: null })
  })

  it('reports a format mismatch for a missing field, a non-number or a non-frame', () => {
    expect(readKpi(frame([[1, 1]]), 'nope').error).toMatchObject({ code: 'format_mismatch', field: 'nope' })
    expect(readKpi(frame([['abc', 1]]), 'tokens').error).toMatchObject({ code: 'format_mismatch', field: 'tokens' })
    expect(readKpi(frame([[true, 1]]), 'tokens').error?.code).toBe('format_mismatch')
    expect(readKpi({ text: 'x' }, 'tokens').error?.code).toBe('format_mismatch')
    expect(readKpi(null, 'tokens').error?.code).toBe('format_mismatch')
  })
})
