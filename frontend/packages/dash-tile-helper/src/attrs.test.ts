import { describe, expect, it } from 'vitest'
import { buildReadUrl, mappedField, parseTileAttributes } from './attrs.ts'

describe('parseTileAttributes', () => {
  it('reads JSON strings and parsed objects, kebab-case and camelCase', () => {
    const fromStrings = parseTileAttributes({
      'tile-id': 'tokens',
      'request-id': 'r1:tokens',
      'data-sources': JSON.stringify({ main: { url: '/u', args: { a: 1 }, refresh_ms: 5000, live_topic: 't' } }),
      'actions': JSON.stringify({ go: { url: '/a', confirm: true, allowed: true } }),
      'fields': '{"text":"body"}',
      'options': '{"label":"L"}',
      'params': '{"model":"m"}',
      'mode': 'view',
    })
    const fromProps = parseTileAttributes({
      tileId: 'tokens',
      requestId: 'r1:tokens',
      dataSources: { main: { url: '/u', args: { a: 1 }, refresh_ms: 5000, live_topic: 't' } },
      actions: { go: { url: '/a', confirm: true, allowed: true } },
      fields: { text: 'body' },
      options: { label: 'L' },
      params: { model: 'm' },
      mode: 'view',
    })
    expect(fromStrings).toEqual(fromProps)
    expect(fromProps.dataSources.main).toEqual({ url: '/u', args: { a: 1 }, refresh_ms: 5000, live_topic: 't' })
    expect(fromProps.actions.go).toEqual({ url: '/a', confirm: true, allowed: true })
  })

  it('treats missing keys as null or empty', () => {
    const config = parseTileAttributes({ dataSources: { main: { url: '/u' } } })
    expect(config.tileId).toBe('')
    expect(config.requestId).toBe('')
    expect(config.mode).toBe('view')
    expect(config.fields).toEqual({})
    expect(config.options).toEqual({})
    expect(config.params).toEqual({})
    expect(config.actions).toEqual({})
    expect(config.dataSources.main).toEqual({ url: '/u', args: {}, refresh_ms: null, live_topic: null })
  })

  it('survives broken input', () => {
    const config = parseTileAttributes({ 'data-sources': '{not json', 'fields': '[1]', 'options': 5 })
    expect(config.dataSources).toEqual({})
    expect(config.fields).toEqual({})
    expect(config.options).toEqual({})
  })

  it('treats a confirm that is not true as false', () => {
    const config = parseTileAttributes({ actions: { a: { url: '/a', confirm: 'yes' }, b: { url: '/b' } } })
    expect(config.actions.a.confirm).toBe(false)
    expect(config.actions.b.confirm).toBe(false)
  })

  it('treats an allowed that is not true as false', () => {
    const config = parseTileAttributes({ actions: { a: { url: '/a', allowed: 'yes' }, b: { url: '/b' }, c: { url: '/c', allowed: true } } })
    expect(config.actions.a.allowed).toBe(false)
    expect(config.actions.b.allowed).toBe(false)
    expect(config.actions.c.allowed).toBe(true)
  })
})

describe('mappedField', () => {
  it('maps through fields and falls back to the tile field name', () => {
    expect(mappedField({ text: 'body' }, 'text')).toBe('body')
    expect(mappedField({}, 'text')).toBe('text')
    expect(mappedField({ text: ['a'] }, 'text')).toBe('text')
  })
})

describe('buildReadUrl', () => {
  it('puts args in one URL-encoded JSON value', () => {
    expect(buildReadUrl('/p', { model: 'a b&c', n: null })).toBe(`/p?args=${encodeURIComponent('{"model":"a b&c","n":null}')}`)
  })

  it('appends the operation token and respects an existing query', () => {
    expect(buildReadUrl('/p?x=1', {}, 'tok/1')).toBe('/p?x=1&args=%7B%7D&operation=tok%2F1')
  })
})
