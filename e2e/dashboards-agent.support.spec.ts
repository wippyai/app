import { expect, test } from '@playwright/test'
import { chartProblem, expectedChart, isTokenSum, tableProblem, toolCalls, toolNames } from './dashboards-agent.support'

/**
 * The reader of agent runs behind the Researcher test, on records in the shape that wippy/dataflow
 * stores (node/agent/node.lua, store_agent_action): type "agent.action", the iteration in the metadata,
 * the content as JSON text with { result, tool_calls }, and each call as { id, name, arguments,
 * registry_id }. It needs no LLM and no app, so it always runs.
 */
const record = (key: string, iteration: number, calls: unknown[]) => ({
  type: 'agent.action',
  key,
  content_type: 'application/json',
  content: JSON.stringify({ result: 'x', tool_calls: calls }),
  metadata: { iteration },
})

test('reads tool calls from the agent.action records, in the order of the iterations', () => {
  const run = {
    success: true,
    data: [
      // Stored out of order on purpose: the order is the iteration, not the position.
      record('2_action', 2, [{ id: 'c2', name: 'BuildDashboard', arguments: { pages: [{ title: 'T', tiles: [] }] }, registry_id: 'wippy.dashboards.agent:build_dashboard' }]),
      record('1_action', 1, [
        { id: 'c0', name: 'WebGet', arguments: { url: 'https://example.test' } },
        { id: 'c1', name: 'DashboardCatalogue', arguments: '{"kind":"points"}', registry_id: 'wippy.dashboards.agent:catalogue' },
      ]),
      { type: 'agent.observation', key: '1_obs', content: 'DashboardCatalogue BuildDashboard in text only', metadata: {} },
      // A tool definition in some other record is not a call.
      { type: 'node.input', content: JSON.stringify({ tools: [{ name: 'BuildDashboard', input_schema: {} }] }) },
    ],
  }
  const calls = toolCalls(run)
  expect(calls.map(c => c.name)).toEqual(['DashboardCatalogue', 'BuildDashboard'])
  expect(calls[0].args).toEqual({ kind: 'points' })
  expect(calls[1].args).toEqual({ pages: [{ title: 'T', tiles: [] }] })
  expect(toolNames(run)).toEqual(['WebGet', 'DashboardCatalogue', 'BuildDashboard'])
})

test('fails loudly when the run has no data records', () => {
  expect(() => toolCalls({ success: true })).toThrow(/no data records/)
})

const sums = new Map<string, Record<string, number>>([
  ['A', { prompt_tokens: 10, completion_tokens: 5, total: 15, total_tokens: 15 }],
  ['B', { prompt_tokens: 20, completion_tokens: 10, total: 30, total_tokens: 30 }],
])

test('isTokenSum needs distinct labels that cover exactly the source models', () => {
  expect(isTokenSum(['A', 'B'], [15, 30], sums)).toBe(true)
  expect(isTokenSum(['B', 'A'], [30, 15], sums)).toBe(true)
  // The same label twice: [A, A] has the right number of labels but not the right set.
  expect(isTokenSum(['A', 'A'], [15, 15], sums)).toBe(false)
  expect(isTokenSum(['A', 'C'], [15, 30], sums)).toBe(false)
  expect(isTokenSum(['A'], [15], sums)).toBe(false)
  expect(isTokenSum(['A', 'B', 'C'], [15, 30, 1], sums)).toBe(false)
  // Calls are not a token sum, and one kind of sum must hold for every label.
  expect(isTokenSum(['A', 'B'], [3, 7], sums)).toBe(false)
  expect(isTokenSum(['A', 'B'], [10, 10], sums)).toBe(false)
})

const frame = {
  fields: [
    { name: 'day', type: 'date' },
    { name: 'model', type: 'string' },
    { name: 'tokens', type: 'number' },
  ],
  rows: [['2026-11-17', 'a', 5], ['2026-11-17', 'b', 7], ['2026-11-18', 'a', 11]] as unknown[][],
}

test('a chart is compared label by label, not as a bag of numbers', () => {
  const wanted = expectedChart(frame, { x: 'day', y: ['tokens'], series: 'model' })
  expect(wanted.labels).toEqual(['2026-11-17', '2026-11-18'])
  expect(wanted.datasets).toEqual([{ label: 'a', data: [5, 11] }, { label: 'b', data: [7, null] }])
  expect(chartProblem(wanted, wanted)).toBeNull()
  // The same numbers on the wrong labels.
  const swapped = { labels: wanted.labels, datasets: [{ label: 'a', data: [11, 5] }, { label: 'b', data: [7, null] }] }
  expect(chartProblem(swapped, wanted)).toMatch(/plots 11 for "2026-11-17"/)
  expect(chartProblem({ labels: ['2026-11-18', '2026-11-17'], datasets: wanted.datasets }, wanted)).toMatch(/labels/)
})

test('a table is compared cell by cell', () => {
  const drawn = [['2026-11-17', 'a', '5'], ['2026-11-17', 'b', '7'], ['2026-11-18', 'a', '11']]
  expect(tableProblem(drawn, frame)).toBeNull()
  expect(tableProblem([['17 Nov 2026', 'a', '5'], ['17 Nov 2026', 'b', '7'], ['18 Nov 2026', 'a', '11']], frame)).toBeNull()
  expect(tableProblem(drawn.slice(1), frame)).toMatch(/2 rows/)
  expect(tableProblem([drawn[0], ['2026-11-17', 'b', '8'], drawn[2]], frame)).toMatch(/row 2, column 3/)
  expect(tableProblem([drawn[0], ['2026-11-17', 'x', '7'], drawn[2]], frame)).toMatch(/row 2, column 2/)
  // Only the shown columns count.
  expect(tableProblem([['a'], ['b'], ['a']], frame, ['model'])).toBeNull()
})
