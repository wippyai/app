import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, isAbsolute, relative, resolve } from 'node:path'
import process from 'node:process'

const EVIDENCE_ROOT = 'C:/Projects/gen-2-chat/.local/evidence/attention-context'
const CANDIDATE_ROOT = 'C:/Projects/gen-2-chat/.local/worktrees/app-template-attention'
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024
const METRIC_FIELDS = [
  'snapshotJsonBytes',
  'candidateCount',
  'pathSegmentCount',
  'uniquePathSegmentCount',
  'recentEventCount',
  'samplePointCount',
  'candidatesBytes',
  'candidatePathsBytes',
  'captureBytes',
  'focusBytes',
  'pointerBytes',
  'recentEventsBytes',
] as const

function within(root: string, target: string): boolean {
  const part = relative(root, target)
  return part !== '' && !isAbsolute(part) && part !== '..' && !part.startsWith('../') && !part.startsWith('..\\')
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid metrics object')
  return value as Record<string, unknown>
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error('invalid metrics number')
  return value
}

function uuid(value: unknown): string | undefined {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value) ? value : undefined
}

function allowlistedMetrics(value: unknown) {
  const source = record(value)
  if (source.schema !== 'wippy.attention.e2e.payload-metrics.v1' || !Array.isArray(source.sends) || source.sends.length > 4096)
    throw new Error('invalid metrics envelope')
  if (source.httpStages !== undefined && (!Array.isArray(source.httpStages) || source.httpStages.length > 4096))
    throw new Error('invalid HTTP metrics')
  const cell = source.cell === undefined ? undefined : record(source.cell)
  if (cell && (!['compat', 'managed'].includes(String(cell.layout))
    || !['iframe', 'fragment'].includes(String(cell.engine))
    || !['enabled', 'disabled'].includes(String(cell.mode))
    || !['none', 'denied'].includes(String(cell.visualMode))
    || typeof cell.visualCapture !== 'boolean')) {
    throw new Error('invalid metrics cell')
  }
  return {
    schema: 'wippy.attention.e2e.payload-metrics.v1',
    cell: cell
      ? {
          layout: cell.layout,
          engine: cell.engine,
          mode: cell.mode,
          visualMode: cell.visualMode,
          visualCapture: cell.visualCapture,
          actionTtlSeconds: count(cell.actionTtlSeconds),
        }
      : undefined,
    // The wire hook does not observe server/model projection; never infer it.
    renderedMetricsAvailable: false,
    httpStages: ((source.httpStages ?? []) as unknown[]).map((value) => {
      const stage = record(value)
      if (!['GET', 'POST', 'DELETE'].includes(String(stage.method)) || !Array.isArray(stage.attention) || stage.attention.length > 128)
        throw new Error('invalid HTTP stage metric')
      if (stage.status !== undefined && (count(stage.status) < 100 || count(stage.status) > 599))
        throw new Error('invalid HTTP status')
      return {
        at: count(stage.at),
        requestId: uuid(stage.requestId),
        method: stage.method,
        requestBytes: count(stage.requestBytes),
        status: stage.status === undefined ? undefined : count(stage.status),
        failed: stage.failed === true,
        attachmentCount: count(stage.attachmentCount),
        attention: stage.attention.map((value) => {
          const snapshot = record(value)
          return Object.fromEntries(METRIC_FIELDS.map(field => [field, count(snapshot[field])]))
        }),
      }
    }),
    sends: source.sends.map((value) => {
      const send = record(value)
      if (!Array.isArray(send.attention) || send.attention.length > 128)
        throw new Error('invalid metrics attachment count')
      return {
        at: count(send.at),
        requestId: uuid(send.requestId),
        socketId: uuid(send.socketId),
        commandBytes: count(send.commandBytes),
        attachmentArrayBytes: count(send.attachmentArrayBytes),
        attachmentCount: count(send.attachmentCount),
        attention: send.attention.map((value) => {
          const snapshot = record(value)
          return Object.fromEntries(METRIC_FIELDS.map(field => [field, count(snapshot[field])]))
        }),
      }
    }),
  }
}

export default class AttentionMetricsReporter implements Reporter {
  private readonly output: string
  private plannedTests = 0
  private globalErrorCount = 0
  private readonly tests: Array<{
    title: string
    file: string
    line: number
    project?: string
    status: TestResult['status']
    durationMs: number
    retry: number
    metricAttachments: Array<{
      status: 'captured' | 'invalid-or-unavailable'
      metrics?: ReturnType<typeof allowlistedMetrics>
    }>
  }> = []

  constructor() {
    const configured = process.env.WIPPY_ATTENTION_METRICS_FILE
    if (!configured || !isAbsolute(configured))
      throw new Error('WIPPY_ATTENTION_METRICS_FILE must be an explicit absolute JSON output path')
    this.output = resolve(configured)
    if (!within(resolve(EVIDENCE_ROOT), this.output) || extname(this.output).toLowerCase() !== '.json')
      throw new Error('Attention metrics output must be a JSON file inside the authorized Attention evidence directory')
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.plannedTests = suite.allTests().length
  }

  onError(): void {
    // Raw runner errors can embed observations, URLs, or credentials.
    this.globalErrorCount++
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const metricAttachments: (typeof this.tests)[number]['metricAttachments'] = []
    for (const attachment of result.attachments) {
      if (attachment.name !== 'attention-payload-metrics' || attachment.contentType !== 'application/json')
        continue
      try {
        let body = attachment.body
        if (!body && attachment.path) {
          const sourcePath = realpathSync(attachment.path)
          if (!within(realpathSync(CANDIDATE_ROOT), sourcePath) && !within(realpathSync(EVIDENCE_ROOT), sourcePath))
            throw new Error('metrics attachment is outside authorized roots')
          if (statSync(sourcePath).size > MAX_ATTACHMENT_BYTES)
            throw new Error('metrics attachment exceeds limit')
          body = readFileSync(sourcePath)
        }
        if (!body || body.byteLength > MAX_ATTACHMENT_BYTES)
          throw new Error('metrics attachment unavailable or excessive')
        metricAttachments.push({ status: 'captured', metrics: allowlistedMetrics(JSON.parse(body.toString('utf8'))) })
      }
      catch {
        metricAttachments.push({ status: 'invalid-or-unavailable' })
      }
    }
    this.tests.push({
      title: test.title,
      file: test.location.file,
      line: test.location.line,
      project: test.parent.project()?.name,
      status: result.status,
      durationMs: result.duration,
      retry: result.retry,
      metricAttachments,
    })
  }

  onEnd(result: FullResult): void {
    const outputDirectory = dirname(this.output)
    const root = realpathSync(EVIDENCE_ROOT)
    let existingParent = outputDirectory
    while (!existsSync(existingParent))
      existingParent = dirname(existingParent)
    const physicalParent = realpathSync(existingParent)
    if (physicalParent !== root && !within(root, physicalParent))
      throw new Error('Attention metrics output directory escapes the authorized evidence root')
    mkdirSync(outputDirectory, { recursive: true })
    const physicalDirectory = realpathSync(outputDirectory)
    if (physicalDirectory !== root && !within(root, physicalDirectory))
      throw new Error('Attention metrics output directory is not authorized')
    if (existsSync(this.output))
      throw new Error('Attention metrics report already exists; choose a fresh output filename')
    writeFileSync(this.output, `${JSON.stringify({
      schema: 'wippy.attention.e2e.metrics-report.v1',
      result: { status: result.status, startedAt: result.startTime.toISOString(), durationMs: result.duration },
      totals: {
        plannedTests: this.plannedTests,
        attempts: this.tests.length,
        passed: this.tests.filter(test => test.status === 'passed').length,
        failed: this.tests.filter(test => ['failed', 'timedOut', 'interrupted'].includes(test.status)).length,
        skipped: this.tests.filter(test => test.status === 'skipped').length,
        globalErrorCount: this.globalErrorCount,
        capturedMetricAttachments: this.tests.reduce((sum, test) => sum + test.metricAttachments.filter(item => item.status === 'captured').length, 0),
        unavailableMetricAttachments: this.tests.reduce((sum, test) => sum + test.metricAttachments.filter(item => item.status !== 'captured').length, 0),
        testsWithoutMetrics: this.tests.filter(test => test.status !== 'skipped' && test.metricAttachments.length === 0).length,
      },
      tests: this.tests,
    }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
  }
}
