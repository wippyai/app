import type { TileConfig, TileError } from '@example/dash-tile-helper'
import { asNumber, asText, fieldIndex, mismatch, nameList, readFrame } from './frame.ts'

export interface ChartFields {
  x: string
  y: string[]
  series: string | null
}

export interface ChartDataset {
  label: string
  /** One value per label. A missing point is null, so Chart.js draws a gap and never a zero. */
  data: Array<number | null>
}

export interface ChartData {
  labels: string[]
  datasets: ChartDataset[]
}

/** Chart types that read a list of labels and one value per label. */
export const CHART_KINDS = ['bar', 'line', 'pie', 'doughnut', 'polarArea', 'radar'] as const
export type ChartKind = typeof CHART_KINDS[number]

const ROUND_KINDS: ReadonlySet<string> = new Set(['pie', 'doughnut', 'polarArea', 'radar'])

/** The `fields` attribute of a chart: `x`, `y` (a name or a list) and an optional `series`. */
export function readChartFields(fields: Record<string, unknown>): ChartFields {
  const x = typeof fields.x === 'string' && fields.x !== '' ? fields.x : 'x'
  const y = nameList(fields.y)
  const series = typeof fields.series === 'string' && fields.series !== '' ? fields.series : null
  return { x, y: y.length > 0 ? y : ['y'], series }
}

/** The chart type from `options.kind`. It defaults to `bar`. */
export function readChartKind(options: Record<string, unknown>): { kind: ChartKind, error: TileError | null } {
  const raw = options.kind
  if (raw === undefined || raw === null || raw === '')
    return { kind: 'bar', error: null }
  if (typeof raw === 'string' && (CHART_KINDS as readonly string[]).includes(raw))
    return { kind: raw as ChartKind, error: null }
  return { kind: 'bar', error: { code: 'invalid_options', message: `The chart kind "${String(raw)}" is not supported.` } }
}

/** Does the chart type draw round shapes, so the legend is needed even for one dataset? */
export function isRoundKind(kind: ChartKind): boolean {
  return ROUND_KINDS.has(kind)
}

/**
 * Chart.js data from a frame. The labels are the distinct values of `x`, in the order of the rows.
 * With a `series` field there is one dataset per series value (and per `y` field when there are several).
 * Without one there is one dataset per `y` field. A point with no row stays null. When two rows share
 * an x and a series, the later row wins.
 */
export function buildChartData(data: unknown, fields: ChartFields): { chart: ChartData | null, error: TileError | null } {
  const { frame, error } = readFrame(data)
  if (!frame)
    return { chart: null, error }
  const xIndex = fieldIndex(frame, fields.x)
  if (xIndex < 0)
    return { chart: null, error: mismatch(`The frame has no field "${fields.x}".`, fields.x) }
  const ys: Array<{ name: string, index: number }> = []
  for (const name of fields.y) {
    const index = fieldIndex(frame, name)
    if (index < 0)
      return { chart: null, error: mismatch(`The frame has no field "${name}".`, name) }
    ys.push({ name, index })
  }
  let seriesIndex = -1
  if (fields.series !== null) {
    seriesIndex = fieldIndex(frame, fields.series)
    if (seriesIndex < 0)
      return { chart: null, error: mismatch(`The frame has no field "${fields.series}".`, fields.series) }
  }

  const labels: string[] = []
  const labelPosition = new Map<string, number>()
  const seriesValues: string[] = []
  const seen = new Set<string>()
  // For each row: the position of its label, and its series value.
  const rowPosition: number[] = []
  const rowSeries: string[] = []
  for (const row of frame.rows) {
    const label = asText(row[xIndex]) ?? ''
    let position = labelPosition.get(label)
    if (position === undefined) {
      position = labels.length
      labelPosition.set(label, position)
      labels.push(label)
    }
    rowPosition.push(position)
    const series = seriesIndex >= 0 ? asText(row[seriesIndex]) ?? '' : ''
    rowSeries.push(series)
    if (seriesIndex >= 0 && !seen.has(series)) {
      seen.add(series)
      seriesValues.push(series)
    }
  }

  const datasets: ChartDataset[] = []
  const groups = seriesIndex >= 0 ? seriesValues : [null]
  for (const group of groups) {
    for (const y of ys) {
      const values: Array<number | null> = labels.map(() => null)
      frame.rows.forEach((row, r) => {
        if (group !== null && rowSeries[r] !== group)
          return
        values[rowPosition[r] ?? 0] = asNumber(row[y.index])
      })
      const label = group === null ? y.name : ys.length === 1 ? group : `${group} (${y.name})`
      datasets.push({ label, data: values })
    }
  }
  return { chart: { labels, datasets }, error: null }
}

/** The colours Chart.js cannot take from a CSS variable. They are read from the theme at run time. */
export interface ChartColors {
  text: string
  muted: string
  grid: string
}

/**
 * Chart.js options as plain data (they travel as a JSON attribute). Axis text, grid and legend use the
 * resolved theme colours. A legend shows when it tells datasets apart.
 */
export function buildChartOptions(kind: ChartKind, datasetCount: number, colors: ChartColors): Record<string, unknown> {
  const options: Record<string, unknown> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: datasetCount > 1 || isRoundKind(kind),
        labels: { color: colors.text },
      },
    },
  }
  if (kind === 'bar' || kind === 'line') {
    options.scales = {
      x: { ticks: { color: colors.muted }, grid: { color: colors.grid } },
      y: { beginAtZero: true, ticks: { color: colors.muted }, grid: { color: colors.grid } },
    }
  }
  return options
}

/** The rows of the text alternative: the labels with one value per dataset. */
export function chartTable(chart: ChartData): { head: string[], rows: Array<{ label: string, values: Array<number | null> }> } {
  return {
    head: chart.datasets.map(d => d.label),
    rows: chart.labels.map((label, i) => ({ label, values: chart.datasets.map(d => d.data[i] ?? null) })),
  }
}

/** The check for the helper: a ready frame that the chart cannot draw becomes an error before `ready`. */
export function validateChart(data: unknown, config: TileConfig): TileError | null {
  const kind = readChartKind(config.options)
  if (kind.error)
    return kind.error
  return buildChartData(data, readChartFields(config.fields)).error
}
