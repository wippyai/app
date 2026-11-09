import type { TileError } from '@example/dash-tile-helper'
import { fieldIndex, mismatch, readFrame } from './frame.ts'
import type { NumericCell } from './frame.ts'

/**
 * The value of a `scalar` input: the field `field` of the single row. No row, or a null cell, is
 * `value: null` (the tile says "No value", never 0). A cell that is not a number is a format mismatch.
 */
export function readKpi(data: unknown, field: string): { value: NumericCell | null, error: TileError | null } {
  const { frame, error } = readFrame(data)
  if (!frame)
    return { value: null, error }
  const index = fieldIndex(frame, field)
  if (index < 0)
    return { value: null, error: mismatch(`The frame has no field "${field}".`, field) }
  const row = frame.rows[0]
  if (!row)
    return { value: null, error: null }
  const cell = row[index]
  if (cell === null || cell === undefined)
    return { value: null, error: null }
  if (typeof cell === 'number' && Number.isFinite(cell))
    return { value: cell, error: null }
  if (typeof cell === 'string' && /^-?\d+(\.\d+)?$/.test(cell))
    return { value: cell, error: null }
  return { value: null, error: mismatch(`The field "${field}" is not a number.`, field) }
}
