import type { ContextAttachment } from './attention'
import { readFile, writeFile } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

export type AttentionRestartBrowser = 'chromium' | 'firefox' | 'webkit'
export type AttentionRestartPhase = 'seed' | 'verify'

export interface AttentionRestartState {
  attachment: ContextAttachment
  baseUrl: string
  browser: AttentionRestartBrowser
  engine: 'fragment' | 'iframe'
  expectedAssistantFragment: string
  expectedTargetId: string
  layout: 'compat' | 'managed'
  messageId: string
  requestId: string
  schema: 'wippy.attention.restart.v1'
  seededAt: string
  sessionId: string
  snapshotId: string
}

function requiredOption<T extends string>(name: string, allowed: readonly T[]): T {
  const value = process.env[name]
  if (!value || !allowed.includes(value as T))
    throw new Error(`${name} must be one of: ${allowed.join(', ')}`)
  return value as T
}

export function attentionRestartBrowser(): AttentionRestartBrowser {
  return requiredOption<AttentionRestartBrowser>(
    'WIPPY_ATTENTION_RESTART_BROWSER',
    ['chromium', 'firefox', 'webkit'],
  )
}

export function attentionRestartPhase(): AttentionRestartPhase {
  return requiredOption<AttentionRestartPhase>('WIPPY_ATTENTION_RESTART_PHASE', ['seed', 'verify'])
}

export function attentionRestartStateFile(): string {
  const file = process.env.WIPPY_ATTENTION_RESTART_STATE_FILE
  if (!file || !isAbsolute(file))
    throw new Error('WIPPY_ATTENTION_RESTART_STATE_FILE must be an absolute path')
  return file
}

export async function writeAttentionRestartState(state: AttentionRestartState): Promise<void> {
  await writeFile(attentionRestartStateFile(), `${JSON.stringify(state, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
}

export async function readAttentionRestartState(): Promise<AttentionRestartState> {
  const parsed = JSON.parse(await readFile(attentionRestartStateFile(), 'utf8')) as Partial<AttentionRestartState>
  if (parsed.schema !== 'wippy.attention.restart.v1')
    throw new Error('Restart handoff has an unsupported schema')
  if (!parsed.sessionId || !parsed.messageId || !parsed.attachment || !parsed.snapshotId)
    throw new Error('Restart handoff is missing persisted-session identifiers')
  return parsed as AttentionRestartState
}
