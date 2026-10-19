/**
 * Generic local launcher for the app-template-raw demo. Picks a free port
 * (or honors APP_PORT) and spawns `wippy run` with matching CLI overrides.
 *
 * The file-based env store wins over process env, so a CLI-only port override
 * alone leaves WIPPY_URL/APP_BASE_URL/PUBLIC_API_URL stale. The launcher never
 * edits the project's .env for this. It writes a per-run copy of .env with the
 * four port-derived keys replaced, under .local/run-dev/, and points the
 * runtime's env file at that copy (`-o app.env:file:file_path=...`). The copy
 * is removed when the runtime exits. A dry run (RUN_DEV_DRY_RUN=1) writes
 * nothing. See e2e/README.md.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
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

// SESSION_FORMS_DEV_FIXTURES=true selects this profile, which keeps the Session
// Forms dev fixtures in the registry (see README.md).
const FIXTURES_PROFILE = 'session-forms-fixtures'
const FIXTURES_ENV_KEY = 'SESSION_FORMS_DEV_FIXTURES'

// Reads one named key the way the runtime's env store does, from the .env file
// first and then the OS environment. It looks only at that key and never
// prints the value, because .env can hold secrets.
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

// Builds the text of a per-run env file: the contents of an existing .env with
// only the four port-derived keys replaced, preserving every other line,
// comment, ordering and the file's own EOL style (missing keys are appended).
// Pure: it reads the source file and writes nothing. Returns the text and the
// names of the keys that changed, never their values.
function buildPortEnv(filePath, port) {
  const raw = existsSync(filePath) ? readFileSync(filePath, 'utf8') : ''
  const eol = raw.includes('\r\n') ? '\r\n' : '\n'
  const hadTrailingNewline = raw === '' || raw.endsWith('\n')
  const lines = raw === '' ? [] : raw.split(/\r\n|\n/)
  if (raw !== '' && hadTrailingNewline)
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

  return { text: out.join(eol) + (hadTrailingNewline || appended ? eol : ''), changed }
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
  // Passing --config replaces the default `.wippy.yaml`, so keep it in the list.
  const rootConfig = path.join(cwd, '.wippy.yaml')
  if (configs.length > 0 && existsSync(rootConfig) && !configs.some(cfg => path.resolve(cwd, cfg) === rootConfig))
    configs.unshift('.wippy.yaml')
  const fixturesOn = readEnvKey(envPath, FIXTURES_ENV_KEY) === 'true'
  const facadeUrl = process.env.FACADE_URL || ''

  const dryRun = process.env.RUN_DEV_DRY_RUN === '1'
  const appOrigin = `http://localhost:${port}`
  const portEnv = buildPortEnv(envPath, port)
  // Per-run env file, so the project's .env is never rewritten.
  const runEnvPath = path.join(cwd, '.local', 'run-dev', `env-${port}`).replaceAll(path.sep, '/')

  const overrides = [`app:gateway:addr=:${port}`, `app.env:file:file_path=${runEnvPath}`]
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
    env_file: runEnvPath,
    started_at: new Date().toISOString(),
    pid: null,
  }

  const manifestPath = process.env.RUN_DEV_MANIFEST || ''
  if (manifestPath && !dryRun)
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))

  console.log(`[run-dev] ${wippyBin} ${args.join(' ')}`)
  console.log(`[run-dev] app=${appOrigin} facade=${facadeUrl || '(none)'} manifest=${manifestPath || '(none)'}`)
  console.log(`[run-dev] session forms dev fixtures: ${fixturesOn ? `on (profile ${FIXTURES_PROFILE})` : 'off'}`)
  console.log(`[run-dev] env file for this run: ${runEnvPath} (port keys: ${portEnv.changed.join(', ')}; .env is not modified)`)
  if (readEnvKey(envPath, 'ENCRYPTION_KEY') === undefined)
    console.warn('[run-dev] warning: no ENCRYPTION_KEY in .env or the environment; a key the runtime generates goes to the per-run env file and is lost when it exits')

  if (dryRun) {
    console.log('[run-dev] dry run: nothing written, runtime not started')
    return
  }

  mkdirSync(path.dirname(runEnvPath), { recursive: true })
  writeFileSync(runEnvPath, portEnv.text)
  const removeRunEnv = () => rmSync(runEnvPath, { force: true })

  // The port-derived keys also go to the child's process env, so tools started
  // from the same shell (for example Playwright) agree with the runtime.
  const childEnv = {
    ...process.env,
    APP_PORT: String(port),
    WIPPY_URL: appOrigin,
    APP_BASE_URL: appOrigin,
    PUBLIC_API_URL: appOrigin,
  }
  const child = spawn(wippyBin, args, { stdio: 'inherit', cwd, env: childEnv })

  child.on('error', (err) => {
    removeRunEnv()
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
    removeRunEnv()
    process.exit(code ?? (signal ? 1 : 0))
  })
}

main().catch((err) => {
  console.error(`[run-dev] ${err.message}`)
  process.exit(1)
})
