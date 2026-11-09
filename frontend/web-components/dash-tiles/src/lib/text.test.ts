import { describe, expect, it } from 'vitest'
import { readText } from './text.ts'

describe('readText', () => {
  it('returns the string in the mapped field', () => {
    expect(readText({ text: 'Hello **world**' }, 'text')).toEqual({ text: 'Hello **world**', error: null })
    expect(readText({ body: 'x', text: 'y' }, 'body')).toEqual({ text: 'x', error: null })
  })

  it('accepts an empty string as a text', () => {
    expect(readText({ text: '' }, 'text')).toEqual({ text: '', error: null })
  })

  it('reports a format mismatch for a missing or non-string field', () => {
    for (const data of [{}, { text: 5 }, { text: null }, { other: 'x' }]) {
      const out = readText(data, 'text')
      expect(out.text).toBeNull()
      expect(out.error?.code).toBe('format_mismatch')
      expect(out.error?.field).toBe('text')
    }
  })

  it('reports a format mismatch when the data is not a record', () => {
    for (const data of [null, 'text', 3, ['a']]) {
      const out = readText(data, 'text')
      expect(out.error?.code).toBe('format_mismatch')
    }
  })
})
