import type { TileError } from '@example/dash-tile-helper'
import { asText, fieldIndex, mismatch, readFrame } from './frame.ts'

export interface SelectOption {
  value: string
  label: string
}

/** The key of the "All" choice. Option keys are `o:` plus the value, so no value can collide with it. */
export const ALL_KEY = 'all'

export function optionKey(value: string): string {
  return `o:${value}`
}

/**
 * The choices of an `options` input. The value field is required. The label field is optional, and a
 * row without a label shows its value. A row without a value is dropped.
 */
export function readOptions(data: unknown, valueField: string, labelField: string): { options: SelectOption[], error: TileError | null } {
  const { frame, error } = readFrame(data)
  if (!frame)
    return { options: [], error }
  const valueIndex = fieldIndex(frame, valueField)
  if (valueIndex < 0)
    return { options: [], error: mismatch(`The frame has no field "${valueField}".`, valueField) }
  const labelIndex = fieldIndex(frame, labelField)
  const options: SelectOption[] = []
  for (const row of frame.rows) {
    const value = asText(row[valueIndex])
    if (value === null)
      continue
    const label = labelIndex < 0 ? null : asText(row[labelIndex])
    options.push({ value, label: label ?? value })
  }
  return { options, error: null }
}

export interface SelectItem {
  key: string
  /** The value the board gets: null for "All". */
  value: string | null
  label: string
}

/**
 * The list the viewer sees: "All" first, then the options. A current value that the options do not
 * contain (for example from the page address) is added, so the control never shows the wrong choice.
 */
export function buildSelectItems(options: SelectOption[], current: string | null, allLabel: string): SelectItem[] {
  const items: SelectItem[] = [{ key: ALL_KEY, value: null, label: allLabel }]
  for (const o of options)
    items.push({ key: optionKey(o.value), value: o.value, label: o.label })
  if (current !== null && !options.some(o => o.value === current))
    items.push({ key: optionKey(current), value: current, label: current })
  return items
}

/** The tile's own parameter: the one entry of `params` (contracts section 6), else no name and no value. */
export function currentParam(params: Record<string, unknown>): { name: string | null, value: string | null } {
  const name = Object.keys(params)[0]
  if (name === undefined)
    return { name: null, value: null }
  return { name, value: asText(params[name]) }
}
