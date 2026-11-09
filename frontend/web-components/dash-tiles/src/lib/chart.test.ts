import { describe, expect, it } from 'vitest'
import { buildChartData, buildChartOptions, chartTable, readChartFields, readChartKind } from './chart.ts'

const byDay = {
  schema: 'wippy.dashboard_frame/v1',
  fields: [
    { name: 'day', type: 'date', nullable: false },
    { name: 'model', type: 'string', nullable: false },
    { name: 'tokens', type: 'number', nullable: false },
  ],
  rows: [
    ['2026-06-10', 'claude-haiku-4-5', 2253],
    ['2026-06-10', 'claude-sonnet-4-6', 246351],
    ['2026-06-11', 'claude-sonnet-4-6', 61350],
    ['2026-06-16', 'claude-haiku-4-5', 5281],
    ['2026-06-16', 'claude-sonnet-4-6', 32205],
    ['2026-07-16', 'claude-haiku-4-5', 1315],
    ['2026-07-16', 'claude-sonnet-4-6', 32205],
    ['2026-08-31', 'claude-haiku-4-5', 6989],
    ['2026-08-31', 'claude-sonnet-4-6', 162186],
  ],
}

const byMonth = {
  schema: 'wippy.dashboard_frame/v1',
  fields: [
    { name: 'month', type: 'string', nullable: false },
    { name: 'sessions', type: 'number', nullable: false },
  ],
  rows: [['2026-06', 8], ['2026-07', 2], ['2026-08', 4]],
}

describe('readChartFields', () => {
  it('reads x, y and series', () => {
    expect(readChartFields({ x: 'day', series: 'model', y: ['tokens'] })).toEqual({ x: 'day', y: ['tokens'], series: 'model' })
  })

  it('accepts y as a single name and defaults the names', () => {
    expect(readChartFields({ x: 'month', y: 'sessions' })).toEqual({ x: 'month', y: ['sessions'], series: null })
    expect(readChartFields({})).toEqual({ x: 'x', y: ['y'], series: null })
  })
})

describe('readChartKind', () => {
  it('defaults to bar and accepts the supported kinds', () => {
    expect(readChartKind({}).kind).toBe('bar')
    expect(readChartKind({ kind: 'line' })).toEqual({ kind: 'line', error: null })
    expect(readChartKind({ kind: 'doughnut' }).kind).toBe('doughnut')
  })

  it('reports an unsupported kind', () => {
    expect(readChartKind({ kind: 'scatter' }).error?.code).toBe('invalid_options')
    expect(readChartKind({ kind: 5 }).error?.code).toBe('invalid_options')
  })
})

describe('buildChartData with a series field', () => {
  const { chart, error } = buildChartData(byDay, { x: 'day', y: ['tokens'], series: 'model' })

  it('has the five distinct days as labels, in order', () => {
    expect(error).toBeNull()
    expect(chart?.labels).toEqual(['2026-06-10', '2026-06-11', '2026-06-16', '2026-07-16', '2026-08-31'])
  })

  it('has one dataset per series value, in the order they appear', () => {
    expect(chart?.datasets.map(d => d.label)).toEqual(['claude-haiku-4-5', 'claude-sonnet-4-6'])
  })

  it('leaves a missing point as a gap and never as 0', () => {
    expect(chart?.datasets[0]?.data).toEqual([2253, null, 5281, 1315, 6989])
    expect(chart?.datasets[1]?.data).toEqual([246351, 61350, 32205, 32205, 162186])
  })

  it('names the datasets with the y field when there are several', () => {
    const wide = buildChartData(
      { fields: [{ name: 'd', type: 'string' }, { name: 's', type: 'string' }, { name: 'a', type: 'number' }, { name: 'b', type: 'number' }], rows: [['1', 'p', 1, 2]] },
      { x: 'd', y: ['a', 'b'], series: 's' },
    )
    expect(wide.chart?.datasets.map(d => d.label)).toEqual(['p (a)', 'p (b)'])
  })
})

describe('buildChartData without a series field', () => {
  it('has one dataset per y field', () => {
    const { chart } = buildChartData(byMonth, { x: 'month', y: ['sessions'], series: null })
    expect(chart).toEqual({
      labels: ['2026-06', '2026-07', '2026-08'],
      datasets: [{ label: 'sessions', data: [8, 2, 4] }],
    })
  })

  it('supports two y fields', () => {
    const data = { fields: [{ name: 'm', type: 'string' }, { name: 'a', type: 'number' }, { name: 'b', type: 'number' }], rows: [['x', 1, 2], ['y', 3, null]] }
    const { chart } = buildChartData(data, { x: 'm', y: ['a', 'b'], series: null })
    expect(chart?.datasets).toEqual([{ label: 'a', data: [1, 3] }, { label: 'b', data: [2, null] }])
  })

  it('parses decimal strings and turns other values into gaps', () => {
    const data = { fields: [{ name: 'm', type: 'string' }, { name: 'a', type: 'decimal' }], rows: [['x', '1.5'], ['y', 'abc'], ['z', null]] }
    const { chart } = buildChartData(data, { x: 'm', y: ['a'], series: null })
    expect(chart?.datasets[0]?.data).toEqual([1.5, null, null])
  })

  it('lets the later row win for a repeated x', () => {
    const data = { fields: [{ name: 'm', type: 'string' }, { name: 'a', type: 'number' }], rows: [['x', 1], ['x', 5]] }
    expect(buildChartData(data, { x: 'm', y: ['a'], series: null }).chart?.datasets[0]?.data).toEqual([5])
  })

  it('gives empty labels and one empty dataset for a frame with no rows', () => {
    const data = { fields: [{ name: 'm', type: 'string' }, { name: 'a', type: 'number' }], rows: [] }
    expect(buildChartData(data, { x: 'm', y: ['a'], series: null }).chart).toEqual({ labels: [], datasets: [{ label: 'a', data: [] }] })
  })
})

describe('buildChartData errors', () => {
  it('reports a missing x, y or series field', () => {
    expect(buildChartData(byMonth, { x: 'nope', y: ['sessions'], series: null }).error).toMatchObject({ code: 'format_mismatch', field: 'nope' })
    expect(buildChartData(byMonth, { x: 'month', y: ['nope'], series: null }).error).toMatchObject({ field: 'nope' })
    expect(buildChartData(byMonth, { x: 'month', y: ['sessions'], series: 'nope' }).error).toMatchObject({ field: 'nope' })
  })

  it('reports data that is not a frame', () => {
    expect(buildChartData({ text: 'x' }, { x: 'x', y: ['y'], series: null }).error?.code).toBe('format_mismatch')
  })
})

describe('chartTable and buildChartOptions', () => {
  it('lists one row per label with one value per dataset', () => {
    const { chart } = buildChartData(byDay, { x: 'day', y: ['tokens'], series: 'model' })
    const table = chartTable(chart as NonNullable<typeof chart>)
    expect(table.head).toEqual(['claude-haiku-4-5', 'claude-sonnet-4-6'])
    expect(table.rows[1]).toEqual({ label: '2026-06-11', values: [null, 61350] })
  })

  const colors = { text: 'T', muted: 'M', grid: 'G' }

  it('shows the legend for several datasets and for round charts only', () => {
    const legend = (o: Record<string, unknown>) => (o.plugins as Record<string, { display?: boolean }>).legend?.display
    expect(legend(buildChartOptions('bar', 1, colors))).toBe(false)
    expect(legend(buildChartOptions('bar', 2, colors))).toBe(true)
    expect(legend(buildChartOptions('doughnut', 1, colors))).toBe(true)
  })

  it('sets axes for bar and line only, with the given colours', () => {
    const bar = buildChartOptions('bar', 1, colors) as { scales: { x: { ticks: { color: string }, grid: { color: string } } } }
    expect(bar.scales.x.ticks.color).toBe('M')
    expect(bar.scales.x.grid.color).toBe('G')
    expect(buildChartOptions('pie', 1, colors).scales).toBeUndefined()
  })
})
