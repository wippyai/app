import { access, cp, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const runtime = path.join(root, '.local', 'e2e-runtime-tmp')
const marker = path.join(runtime, '.e2e-runtime')
const decoder = new TextDecoder('utf-8', { fatal: true })
const lock = decoder.decode(await readFile(path.join(root, 'wippy.lock')))
const directories = /^directories:\r?\n    modules: \.wippy\r?\n    src: \.\/src\r?\n/

if (!directories.test(lock))
  throw new Error('The test runtime expects the declared source and module directories')

for (const input of ['src', 'static', 'e2e/fixtures/app'])
  await access(path.join(root, input))

try {
  if (!(await lstat(runtime)).isDirectory() || (await readFile(marker, 'utf8')) !== 'app-template-e2e\n')
    throw new Error('Refusing to change an unowned test runtime')
}
catch (error) {
  if (error.code !== 'ENOENT')
    throw error
  // An existing directory without the ownership marker must stay untouched.
  try {
    await lstat(runtime)
    throw new Error('Refusing to change an unowned test runtime')
  }
  catch (runtimeError) {
    if (runtimeError.code !== 'ENOENT')
      throw runtimeError
  }
}

await mkdir(runtime, { recursive: true })
await writeFile(marker, 'app-template-e2e\n', 'utf8')
for (const name of ['src', 'static']) {
  const target = path.join(runtime, name)
  if (path.dirname(target) !== runtime)
    throw new Error('Test source target is outside the runtime')
  await rm(target, { recursive: true, force: true })
  await cp(path.join(root, name), target, { recursive: true })
}
await cp(path.join(root, 'e2e/fixtures/app'), path.join(runtime, 'src/app'), { recursive: true })
await writeFile(path.join(runtime, 'wippy.lock'), lock.replace(directories, 'directories:\n    modules: ../../.wippy\n    src: ./src\n'), 'utf8')
try {
  await cp(path.join(root, '.env'), path.join(runtime, '.env'))
}
catch (error) {
  if (error.code !== 'ENOENT')
    throw error
  await rm(path.join(runtime, '.env'), { force: true })
}
console.log('Prepared .local/e2e-runtime-tmp with test agents. Existing runtime data is preserved.')
