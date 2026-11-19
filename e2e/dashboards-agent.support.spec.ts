import { expect, test } from '@playwright/test'
import { toolCalls, toolNames } from './dashboards-agent.support'

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
