import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const scriptsDirectory = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = dirname(scriptsDirectory)
const bumpScript = join(scriptsDirectory, 'bumpVersion.mjs')
const resolveScript = join(scriptsDirectory, 'resolveVersionBump.mjs')

function isolatedEnvironment(overrides = {}) {
  const environment = { ...process.env }
  for (const name of [
    'GITHUB_EVENT_NAME',
    'GITHUB_EVENT_PATH',
    'GITHUB_OUTPUT',
    'VERSION_LABEL_REQUIRED',
    'VERSION_TARGET_INPUT',
  ]) {
    delete environment[name]
  }
  return { ...environment, ...overrides }
}

function runScript(script, args, options = {}) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: options.cwd ?? repositoryRoot,
    encoding: 'utf8',
    env: isolatedEnvironment(options.env),
  })
}

async function temporaryDirectory(t, prefix) {
  const directory = await mkdtemp(join(tmpdir(), prefix))
  t.after(() => rm(directory, { force: true, recursive: true }))
  return directory
}

async function createReleaseFixture(t, version = '1.0.50') {
  const directory = await temporaryDirectory(t, 'nexo-release-tools-')
  await mkdir(join(directory, 'functions'))

  const rootPackage = { name: 'nexo', private: true, version }
  const functionsPackage = { name: 'nexo-functions', private: true, version }
  const rootLock = { name: 'nexo', version, packages: { '': { name: 'nexo', version } } }
  const functionsLock = {
    name: 'nexo-functions',
    version,
    packages: { '': { name: 'nexo-functions', version } },
  }

  await Promise.all([
    writeFile(join(directory, 'package.json'), `${JSON.stringify(rootPackage, null, 2)}\n`),
    writeFile(join(directory, 'package-lock.json'), `${JSON.stringify(rootLock, null, 2)}\n`),
    writeFile(join(directory, 'functions/package.json'), `${JSON.stringify(functionsPackage, null, 2)}\n`),
    writeFile(join(directory, 'functions/package-lock.json'), `${JSON.stringify(functionsLock, null, 2)}\n`),
  ])

  return directory
}

async function runResolver(t, labels, options = {}) {
  const directory = await temporaryDirectory(t, 'nexo-resolve-version-')
  const eventPath = join(directory, 'event.json')
  const outputPath = join(directory, 'output.txt')
  const event = {
    action: options.action ?? 'synchronize',
    pull_request: {
      head: { ref: options.headRef ?? 'feature/nexo-1.1.50' },
      labels: labels.map((name) => ({ name })),
      merged: options.merged ?? false,
    },
  }
  await writeFile(eventPath, JSON.stringify(event))

  const result = runScript(resolveScript, [], {
    env: {
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
      VERSION_LABEL_REQUIRED: options.required === false ? 'false' : 'true',
    },
  })
  const output = await readFile(outputPath, 'utf8').catch(() => '')
  return { ...result, output }
}

test('resolveVersionBump resolves a semantic release label', async (t) => {
  const result = await runResolver(t, ['release:1.1.50'])

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /Resolved release target: 1\.1\.50/)
  assert.match(result.output, /^target=1\.1\.50$/m)
  assert.match(result.output, /^should_bump=true$/m)
})

test('resolveVersionBump rejects missing, legacy, mixed and malformed release labels', async (t) => {
  const cases = [
    { labels: [], message: /release:x\.y\.z/ },
    { labels: ['minor'], message: /minor label is not valid/ },
    { labels: ['release:1.1.50', 'patch'], message: /conflicting version labels/ },
    { labels: ['release:next'], message: /Unsupported release label/ },
    { labels: ['release:01.2.3'], message: /Unsupported release label/ },
  ]

  for (const scenario of cases) {
    await t.test(scenario.labels.join(' + ') || 'missing', async (subtest) => {
      const result = await runResolver(subtest, scenario.labels)
      assert.equal(result.status, 1)
      assert.match(result.stderr, scenario.message)
    })
  }
})

test('resolveVersionBump leaves an unlabeled optional PR unchanged', async (t) => {
  const result = await runResolver(t, [], { required: false })

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.output, /^target=$/m)
  assert.match(result.output, /^should_bump=false$/m)
})

test('resolveVersionBump accepts semantic workflow dispatch targets', async (t) => {
  const directory = await temporaryDirectory(t, 'nexo-dispatch-version-')
  const outputPath = join(directory, 'output.txt')
  const accepted = runScript(resolveScript, [], {
    env: {
      GITHUB_EVENT_NAME: 'workflow_dispatch',
      GITHUB_OUTPUT: outputPath,
      VERSION_TARGET_INPUT: '1.1.51',
    },
  })
  const rejected = runScript(resolveScript, [], {
    env: { GITHUB_EVENT_NAME: 'workflow_dispatch', VERSION_TARGET_INPUT: 'next' },
  })

  assert.equal(accepted.status, 0, accepted.stderr)
  assert.equal(rejected.status, 1)
  assert.match(rejected.stderr, /semantic version target/)
})

test('bumpVersion synchronizes every release version surface and is idempotent', async (t) => {
  const directory = await createReleaseFixture(t)
  const outputPath = join(directory, 'output.txt')
  const firstRun = runScript(bumpScript, ['1.1.50', '--base-version', '1.0.50'], {
    cwd: directory,
    env: { GITHUB_OUTPUT: outputPath },
  })
  const secondRun = runScript(bumpScript, ['1.1.50'], { cwd: directory })

  assert.equal(firstRun.status, 0, firstRun.stderr)
  assert.equal(secondRun.status, 0, secondRun.stderr)
  for (const path of ['package.json', 'package-lock.json', 'functions/package.json', 'functions/package-lock.json']) {
    const value = JSON.parse(await readFile(join(directory, path), 'utf8'))
    assert.equal(value.version, '1.1.50', path)
    if (path.endsWith('package-lock.json')) assert.equal(value.packages[''].version, '1.1.50', path)
  }
  assert.match(await readFile(outputPath, 'utf8'), /^version=1\.1\.50$/m)
})

test('bumpVersion rejects legacy, malformed and mixed targets', () => {
  for (const args of [['patch'], ['minor'], ['major'], ['next'], ['01.2.3'], ['1.1.50', 'minor']]) {
    const result = runScript(bumpScript, args)
    assert.equal(result.status, 1, args.join(' '))
    assert.match(result.stderr, /Usage:|Unexpected argument/)
  }
})

test('bumpVersion refuses current and base downgrades', async (t) => {
  await t.test('current package', async (subtest) => {
    const directory = await createReleaseFixture(subtest, '2.0.0')
    const result = runScript(bumpScript, ['1.1.50'], { cwd: directory })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /Refusing to downgrade root package/)
  })

  await t.test('base version', async (subtest) => {
    const directory = await createReleaseFixture(subtest)
    const result = runScript(bumpScript, ['1.1.50', '--dry-run', '--base-version', '2.0.0'], { cwd: directory })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /must be newer than base version/)
  })
})
