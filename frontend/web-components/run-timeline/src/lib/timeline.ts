import type { TileError } from '@wippy/dashboards-tile-helper'

/** One node of the run, as the function `demo.run_timeline:read_latest_run` returns it. */
export interface RunNode {
  type: string
  status: string
  duration_ms: number
  children: RunNode[]
}

export interface Run {
  type: string
  status: string
  started_at: string
  duration_ms: number
  commits: number
}

/** A node placed in the flat list the tile draws. `share` is the bar width, 0 to 1. */
export interface TimelineRow {
  depth: number
  type: string
  status: string
  duration_ms: number
  share: number
}

export interface Timeline {
  run: Run
  rows: TimelineRow[]
}

function mismatch(message: string): TileError {
  return { code: 'format_mismatch', message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function readNode(raw: unknown): RunNode | null {
  if (!isRecord(raw) || typeof raw.type !== 'string' || typeof raw.status !== 'string' || !isCount(raw.duration_ms))
    return null
  // A missing `children` is a leaf. A value that is not a list is not a node.
  const rawChildren = raw.children === undefined ? [] : raw.children
  if (!Array.isArray(rawChildren))
    return null
  const children: RunNode[] = []
  for (const c of rawChildren) {
    const child = readNode(c)
    if (child === null)
      return null
    children.push(child)
  }
  return { type: raw.type, status: raw.status, duration_ms: raw.duration_ms, children }
}

/** Bar width of a node: its duration over the run's duration, from 0 to 1. */
export function barShare(durationMs: number, runMs: number): number {
  if (runMs <= 0)
    return 0
  return Math.min(1, Math.max(0, durationMs / runMs))
}

/**
 * The run and its nodes as a flat list in tree order (a parent, then its children). Data that does not
 * match the shape is a format mismatch, never an empty tree shown as ready.
 */
export function readTimeline(data: unknown): { timeline: Timeline | null, error: TileError | null } {
  if (!isRecord(data) || !isRecord(data.run) || !Array.isArray(data.nodes))
    return { timeline: null, error: mismatch('The data is not a run with nodes.') }
  const r = data.run
  if (typeof r.type !== 'string' || typeof r.status !== 'string' || typeof r.started_at !== 'string'
    || !isCount(r.duration_ms) || !isCount(r.commits))
    return { timeline: null, error: mismatch('The run has a missing or wrong field.') }
  const run: Run = { type: r.type, status: r.status, started_at: r.started_at, duration_ms: r.duration_ms, commits: r.commits }

  const top: RunNode[] = []
  for (const raw of data.nodes) {
    const node = readNode(raw)
    if (node === null)
      return { timeline: null, error: mismatch('A node has a missing or wrong field.') }
    top.push(node)
  }

  const rows: TimelineRow[] = []
  const walk = (nodes: RunNode[], depth: number) => {
    for (const n of nodes) {
      rows.push({ depth, type: n.type, status: n.status, duration_ms: n.duration_ms, share: barShare(n.duration_ms, run.duration_ms) })
      walk(n.children, depth + 1)
    }
  }
  walk(top, 0)
  return { timeline: { run, rows }, error: null }
}

/** 9139 shows as "9.14 s", 1 as "1 ms", 7171 as "7.17 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000)
    return `${Math.round(ms)} ms`
  const seconds = ms / 1000
  return `${seconds < 100 ? seconds.toFixed(2) : seconds.toFixed(0)} s`
}

/** The start time in the viewer's locale. An unreadable value is shown as it came. */
export function formatStart(iso: string, locale?: string | string[]): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString(locale)
}
