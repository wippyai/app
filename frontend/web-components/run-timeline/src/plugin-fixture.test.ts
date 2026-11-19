import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Ajv from 'ajv'
import { load } from 'js-yaml'
import { describe, expect, it } from 'vitest'
import latestRun from './fixtures/latest-run.json'
import { readTimeline } from './lib/timeline'

// Plugin fixture test. The module src/demo_run_timeline/_index.yaml declares the data schema twice:
// as the output of the point `latest_run` (what the function must return) and as the input of the
// tile `run_timeline` (what the tile accepts). This test reads both from that file, checks that they
// are equal, and validates a saved function output against them. The tile code also has to draw it.
// When the function output stops matching the schema, a broken copy below shows how this test fails.

/* eslint-disable @typescript-eslint/no-explicit-any -- the test reads loose YAML and edits loose JSON */
/** One loose JSON object: the YAML and the broken copies below have no fixed type, so `any` stays on this one alias. */
type Loose = Record<string, any>

interface Entry {
  name: string
  meta: Loose
}

const indexUrl = new URL('../../../../src/demo_run_timeline/_index.yaml', import.meta.url)
const index = load(readFileSync(fileURLToPath(indexUrl), 'utf8')) as { namespace: string, entries: Entry[] }

function entry(name: string): Entry {
  const found = index.entries.find(e => e.name === name)
  if (!found)
    throw new Error(`entry ${name} is missing from ${indexUrl.pathname}`)
  return found
}

const point = entry('latest_run')
// The tile claim sits on the component entry, in meta.implements (tile contract section 2).
const componentEntry = entry('run-timeline')
const tile: { meta: Loose } = { meta: componentEntry.meta.implements[0].descriptor }
const pointSchema = point.meta.output.schema
const tileSchema = tile.meta.inputs.main.schema

const ajv = new Ajv({ allErrors: true, strict: true })
const validateTile = ajv.compile(tileSchema)
const validatePoint = ajv.compile(pointSchema)

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

describe('plugin demo.run_timeline: declarations', () => {
  it('declares the point and the tile for one another', () => {
    expect(point.meta.type).toBe('wippy.dashboards.point')
    expect(point.meta.func).toBe(`${index.namespace}:read_latest_run`)
    expect(point.meta.output.shape).toBe('schema')
    expect(componentEntry.meta.implements[0].interface).toBe('wippy.dashboards:tile_v1')
    expect(tile.meta.tile).toBe(index.namespace)
    expect(componentEntry.meta.tag_name).toBe('run-timeline')
    expect(tile.meta.inputs.main.shape).toBe('schema')
    expect(tile.meta.default_data).toEqual({ main: { point: `${index.namespace}:latest_run`, args: {} } })
    expect(tile.meta.default_actions).toBeUndefined()
  })

  it('keeps the point output schema equal to the tile input schema', () => {
    expect(pointSchema).toEqual(tileSchema)
  })

  it('serves the tag from the view.component entry', () => {
    expect(componentEntry.meta.type).toBe('view.component')
    expect(componentEntry.meta.tag_name).toBe('run-timeline')
    expect(componentEntry.meta.url).toBe('/app/wc/run-timeline')
  })
})

describe('plugin demo.run_timeline: saved function output', () => {
  it('matches the tile input schema and the point output schema', () => {
    expect(validateTile(latestRun), JSON.stringify(validateTile.errors)).toBe(true)
    expect(validatePoint(latestRun), JSON.stringify(validatePoint.errors)).toBe(true)
  })

  it('is drawn by the tile as one run with two nodes and one child', () => {
    const { timeline, error } = readTimeline(latestRun)
    expect(error).toBeNull()
    expect(timeline?.run.duration_ms).toBe(9139)
    expect(timeline?.rows.map(r => [r.depth, r.type])).toEqual([[0, 'agent'], [1, 'tool.call'], [0, 'func']])
  })

  it.each([
    ['a run field is missing', (d: Loose) => { delete d.run.commits }],
    ['a duration is a string', (d: Loose) => { d.nodes[0].duration_ms = '7171' }],
    ['a duration is not a whole number', (d: Loose) => { d.nodes[0].duration_ms = 7171.5 }],
    ['the start time has no offset', (d: Loose) => { d.run.started_at = '2026-06-16 20:43:42' }],
    ['a node has an extra key', (d: Loose) => { d.nodes[1].extra = true }],
    ['a node has no children list', (d: Loose) => { delete d.nodes[1].children }],
    ['a child node is missing its status', (d: Loose) => { delete d.nodes[0].children[0].status }],
    ['the nodes are not a list', (d: Loose) => { d.nodes = {} }],
    ['the run is renamed', (d: Loose) => { d.latest = d.run; delete d.run }],
  ])('fails the schema and the tile when %s', (_name, damage) => {
    const broken = copy(latestRun)
    damage(broken)
    expect(validateTile(broken)).toBe(false)
    expect(validatePoint(broken)).toBe(false)
  })

  it.each([
    ['a run field is missing', (d: Loose) => { delete d.run.commits }],
    ['a duration is a string', (d: Loose) => { d.nodes[0].duration_ms = '7171' }],
    ['the nodes are not a list', (d: Loose) => { d.nodes = {} }],
    ['the run is renamed', (d: Loose) => { d.latest = d.run; delete d.run }],
  ])('makes the tile report an error when %s', (_name, damage) => {
    const broken = copy(latestRun)
    damage(broken)
    expect(readTimeline(broken).error?.code).toBe('format_mismatch')
  })
})
