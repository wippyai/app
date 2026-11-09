import type { TileError } from '@example/dash-tile-helper'

/** One field of a `wippy.dashboard_frame/v1` frame (contracts section 7). */
export interface FrameField {
  name: string
  type: string
}

export interface Frame {
  fields: FrameField[]
  rows: unknown[][]
}

export type Cell = unknown

/** A numeric cell: a number, or a decimal or big integer that travels as a string (contracts section 7). */
export type NumericCell = number | string

export function mismatch(message: string, field?: string): TileError {
  return field === undefined
    ? { code: 'format_mismatch', message }
    : { code: 'format_mismatch', message, field }
}

/** The frame inside a ready envelope, or an error when the data is not a frame. */
export function readFrame(data: unknown): { frame: Frame | null, error: TileError | null } {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    return { frame: null, error: mismatch('The data is not a frame.') }
  const raw = data as Record<string, unknown>
  if (!Array.isArray(raw.fields) || !Array.isArray(raw.rows))
    return { frame: null, error: mismatch('The data is not a frame.') }
  const fields: FrameField[] = []
  for (const f of raw.fields) {
    if (typeof f !== 'object' || f === null || typeof (f as Record<string, unknown>).name !== 'string')
      return { frame: null, error: mismatch('The frame has a field without a name.') }
    const rec = f as Record<string, unknown>
    fields.push({ name: rec.name as string, type: typeof rec.type === 'string' ? rec.type : 'string' })
  }
  const rows: unknown[][] = []
  for (const r of raw.rows) {
    if (!Array.isArray(r))
      return { frame: null, error: mismatch('The frame has a row that is not a list.') }
    rows.push(r)
  }
  return { frame: { fields, rows }, error: null }
}

/** The position of a field in the frame, or -1. */
export function fieldIndex(frame: Frame, name: string): number {
  return frame.fields.findIndex(f => f.name === name)
}

/** A cell as a number, or null when it is missing or not numeric. Decimal strings are parsed. */
export function asNumber(cell: Cell): number | null {
  if (typeof cell === 'number')
    return Number.isFinite(cell) ? cell : null
  if (typeof cell === 'string' && /^-?\d+(\.\d+)?$/.test(cell)) {
    const n = Number(cell)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** The text of a cell, or null when it is missing. */
export function asText(cell: Cell): string | null {
  if (cell === null || cell === undefined)
    return null
  return typeof cell === 'string' ? cell : String(cell)
}

/** A list of field names from a `fields` entry: a string, or a list of strings. Anything else is empty. */
export function nameList(value: unknown): string[] {
  if (typeof value === 'string')
    return value === '' ? [] : [value]
  if (Array.isArray(value))
    return value.filter((v): v is string => typeof v === 'string' && v !== '')
  return []
}
