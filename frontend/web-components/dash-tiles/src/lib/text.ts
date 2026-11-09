import type { TileError } from '@example/dash-tile-helper'

/**
 * The text of a `record` input: the string under `field`. A record without that string is a
 * format mismatch, not an empty text, so the tile reports an error and never shows a blank as ready.
 */
export function readText(data: unknown, field: string): { text: string | null, error: TileError | null } {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { text: null, error: { code: 'format_mismatch', message: 'The data is not a record.' } }
  const value = (data as Record<string, unknown>)[field]
  if (typeof value !== 'string')
    return { text: null, error: { code: 'format_mismatch', message: `The record has no text in the field "${field}".`, field } }
  return { text: value, error: null }
}
