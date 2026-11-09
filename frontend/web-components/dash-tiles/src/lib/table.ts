import type { TileError } from '@example/dash-tile-helper'
import { asNumber, fieldIndex, mismatch, nameList, readFrame } from './frame.ts'
import type { Frame } from './frame.ts'
import { formatNumber } from './format.ts'

/** The marker for a null cell. A null is never shown as 0 or as an empty cell. */
export const NULL_MARKER = 'None'

export interface TableColumn {
  name: string
  /** Header text: the field name with underscores as spaces and a capital first letter. */
  label: string
  numeric: boolean
}

export interface TableCell {
  text: string
  numeric: boolean
  isNull: boolean
}

export interface TableModel {
  columns: TableColumn[]
  rows: TableCell[][]
}

/** `model_id` becomes `Model id`. */
export function columnLabel(name: string): string {
  const spaced = name.replace(/_+/g, ' ').trim()
  return spaced === '' ? name : spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function isNumericType(type: string): boolean {
  return type === 'number' || type === 'decimal'
}

function cellText(cell: unknown, numeric: boolean, locale: string | undefined): TableCell {
  if (cell === null || cell === undefined)
    return { text: NULL_MARKER, numeric, isNull: true }
  if (numeric) {
    const n = asNumber(cell)
    if (n !== null)
      return { text: formatNumber(typeof cell === 'string' ? cell : n, locale), numeric: true, isNull: false }
  }
  return { text: typeof cell === 'string' ? cell : String(cell), numeric, isNull: false }
}

interface Picked {
  index: number
  column: TableColumn
}

function selectColumns(frame: Frame, wanted: string[]): { picked: Picked[], error: TileError | null } {
  const names = wanted.length === 0 ? frame.fields.map(f => f.name) : wanted
  const picked: Picked[] = []
  for (const name of names) {
    const index = fieldIndex(frame, name)
    const field = frame.fields[index]
    if (!field)
      return { picked: [], error: mismatch(`The frame has no field "${name}".`, name) }
    picked.push({ index, column: { name, label: columnLabel(name), numeric: isNumericType(field.type) } })
  }
  return { picked, error: null }
}

/**
 * The table of a `table` input. `fields.columns` lists the fields to show, in order. Without it every
 * field shows. A listed field that the frame lacks is a format mismatch.
 */
export function buildTable(data: unknown, columnsField: unknown, locale?: string): { table: TableModel | null, error: TileError | null } {
  const { frame, error } = readFrame(data)
  if (!frame)
    return { table: null, error }
  const { picked, error: columnError } = selectColumns(frame, nameList(columnsField))
  if (columnError)
    return { table: null, error: columnError }
  const columns = picked.map(p => p.column)
  const rows = frame.rows.map(row => picked.map(p => cellText(row[p.index], p.column.numeric, locale)))
  return { table: { columns, rows }, error: null }
}
