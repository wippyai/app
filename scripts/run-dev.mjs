/**
 * Generic local launcher for the app-template-raw demo. Picks a free port
 * (or honors APP_PORT), rewrites the four env-store keys derived from it
 * (the file-based env store wins over process env, so a CLI-only port
 * override alone leaves WIPPY_URL/APP_BASE_URL/PUBLIC_API_URL stale), then
 * spawns `wippy run` with matching CLI overrides. See e2e/README.md.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import path from 'node:path'
import process from 'node:process'

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer()
    srv.on('error', reject)
    srv.listen(0, '0.0.0.0', () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function resolveWippyBinary() {
  if (process.env.WIPPY)
    return process.env.WIPPY
  const local = process.platform === 'win32' ? './wippy.exe' : './wippy'
  return existsSync(local) ? local : 'wippy'
}

// Session Forms dev fixtures (src/app/session_forms_demo) are removed from the
// registry by `.wippy.yaml` unless this profile is selected. The profile is
// driven by the same flag as app.env:session_forms_dev_fixtures
// (SESSION_FORMS_DEV_FIXTURES), so one setting turns on both the fixture
// agents and the touch endpoint.
const FIXTURES_PROFILE = 'session-forms-fixtures'
const FIXTURES_ENV_KEY = 'SESSION_FORMS_DEV_FIXTURES'

// Reads ONE named key the way the runtime's env store does (the .env file
// first, then the OS environment). Only the named key is looked at, and its
// value is never printed: .env can hold secrets.
function readEnvKey(filePath, key) {
  if (existsSync(filePath)) {
    for (const line of readFileSync(filePath, 'utf8').split(/\r\n|\n/)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/)
      if (match && match[1] === key)
        return match[2].trim().replace(/^(['"])(.*)\1$/, '$2')
    }
  }
  return process.env[key]
}

// Rewrites only the four port-derived keys in an existing .env, preserving
// every other line, comment, ordering and the file's own EOL style. Returns
// the list of key NAMES that changed - never values, .env can hold secrets.
function rewriteEnvPort(filePath, port) {
  if (!existsSync(filePath))
    return []

  const raw = readFileSync(filePath, 'utf8')
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const hadTrailingNewline = raw.endsWith('\n')
  const lines = raw.split(/\r\n|\n/)
  if (hadTrailingNewline)
    lines.pop()

  const origin = `http://localhost:${port}`
  const updates = { APP_PORT: String(port), WIPPY_URL: origin, APP_BASE_URL: origin, PUBLIC_API_URL: origin }
  const pending = new Set(Object.keys(updates))
  const changed = []

  const out = lines.map((line) => {
    const key = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/)?.[1]
    if (!key || !pending.has(key))
      return line
    pending.delete(key)
    changed.push(key)
    return `${key}=${updates[key]}`
  })

  const appended = pending.size > 0
  for (const key of pending) {
    out.push(`${key}=${updates[key]}`)
    changed.push(key)
  }

  writeFileSync(filePath, out.join(eol) + (hadTrailingNewline || appended ? eol : ''))
  return changed
}

async function main() {
  const cwd = process.cwd()
  const envPath = path.join(cwd, '.env')

  const requestedPort = process.env.APP_PORT
  const port = (!requestedPort || requestedPort === 'auto') ? await findFreePort() : Number(requestedPort)
  if (!Number.isInteger(port) || port <= 0)
    throw new Error(`APP_PORT must be "auto" or a positive integer, got: ${requestedPort}`)

  const feMode = process.env.FE_MODE || ''
  if (feMode && !['compat', 'managed'].includes(feMode))
    throw new Error(`FE_MODE must be "compat" or "managed", got: ${feMode}`)
  const renderEngine = process.env.RENDER_ENGINE || ''
  if (renderEngine && !['iframe', 'fragment'].includes(renderEngine))
    throw new Error(`RENDER_ENGINE must be "iframe" or "fragment", got: ${renderEngine}`)

  const wippyBin = resolveWippyBinary()
  const configs = process.env.WIPPY_CONFIG ? process.env.WIPPY_CONFIG.split(path.delimiter).filter(Boolean) : []
  // Passing any --config replaces wippy's default `.wippy.yaml`, which would
  // silently switch the release gate on the fixtures off. Keep it first.
  const rootConfig = path.join(cwd, '.wippy.yaml')
  if (configs.length > 0 && existsSync(rootConfig) && !configs.some(cfg => path.resolve(cwd, cfg) === rootConfig))
    configs.unshift('.wippy.yaml')
  const fixturesOn = readEnvKey(envPath, FIXTURES_ENV_KEY) === 'true'
  const facadeUrl = process.env.FACADE_URL || ''

  const overrides = [`app:gateway:addr=:${port}`]
  if (facadeUrl)
    overrides.push(`wippy.facade:fe_facade_url:default=${facadeUrl}`)
  if (feMode)
    overrides.push(`wippy.facade:fe_mode:default=${feMode}`)
  if (renderEngine)
    overrides.push(`wippy.facade:render_engine:default=${renderEngine}`)
  // Extra `entry:path=value` overrides, separated by newlines or `;`.
  if (process.env.WIPPY_OVERRIDES)
    overrides.push(...process.env.WIPPY_OVERRIDES.split(/[;\n]/).map(o => o.trim()).filter(Boolean))
  const args = ['run', '-c']
  for (const cfg of configs)
    args.push('--config', cfg)
  if (fixturesOn)
    args.push('--profile', FIXTURES_PROFILE)
  for (const o of overrides)
    args.push('-o', o)

  const changedKeys = rewriteEnvPort(envPath, port)
  if (changedKeys.length)
    console.log(`[run-dev] updated .env keys: ${changedKeys.join(', ')}`)

  const appOrigin = `http://localhost:${port}`
  const manifest = {
    app_port: port,
    app_origin: appOrigin,
    api_origin: appOrigin,
    websocket_url: `ws://localhost:${port}`,
    facade_url: facadeUrl || null,
    wippy: wippyBin,
    configs,
    profiles: fixturesOn ? [FIXTURES_PROFILE] : [],
    overrides,
    started_at: new Date().toISOString(),
    pid: null,
  }

  const manifestPath = process.env.RUN_DEV_MANIFEST || ''
  if (manifestPath)
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  console.log(`[run-dev] ${wippyBin} ${args.join(' ')}`)
  console.log(`[run-dev] app=${appOrigin} facade=${facadeUrl || '(none)'} manifest=${manifestPath || '(none)'}`)
  console.log(`[run-dev] session forms dev fixtures: ${fixturesOn ? `on (profile ${FIXTURES_PROFILE})` : 'off'}`)

  if (process.env.RUN_DEV_DRY_RUN === '1')
    return

  const child = spawn(wippyBin, args, { stdio: 'inherit', cwd, env: process.env })

  child.on('error', (err) => {
    console.error(`[run-dev] failed to start "${wippyBin}": ${err.message}`)
    process.exit(1)
  })

  if (manifestPath) {
    manifest.pid = child.pid
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
  }

  for (const sig of ['SIGINT', 'SIGTERM'])
    process.on(sig, () => child.kill(sig))

  child.on('exit', (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0))
  })
}

main().catch((err) => {
  console.error(`[run-dev] ${err.message}`)
  process.exit(1)
})
