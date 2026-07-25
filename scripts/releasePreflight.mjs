import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const SEMVER_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export const PREFLIGHT_GATES = Object.freeze([
  'release metadata',
  'frontend build and budget',
  'Functions build and tests',
  'Worker dry run',
  'security audits',
  'release and end-to-end checks',
])

export const PRODUCTION_MUTATION_JOBS = Object.freeze([
  'deploy-firebase',
  'deploy-worker',
  'deploy-pages',
])

export function createReleaseMetadata({ revision, version, repository = '', workflowRunId = '', eventName = '' }) {
  assertRevision(revision)
  assertVersion(version)
  return {
    schemaVersion: 1,
    revision,
    version,
    releaseTag: `v${version}`,
    repository,
    workflowRunId: String(workflowRunId),
    eventName,
  }
}

export function verifyReleaseMetadata(metadata, { revision, version }) {
  const failures = []
  if (!metadata || typeof metadata !== 'object') {
    return ['Release metadata must be an object.']
  }
  if (metadata.schemaVersion !== 1) failures.push('Release metadata schemaVersion must be 1.')
  if (metadata.revision !== revision) failures.push(`Release metadata revision must be ${revision}.`)
  if (metadata.version !== version) failures.push(`Release metadata version must be ${version}.`)
  if (metadata.releaseTag !== `v${version}`) failures.push(`Release metadata releaseTag must be v${version}.`)
  return failures
}

export function assertRevision(revision) {
  if (!SHA_PATTERN.test(String(revision ?? ''))) throw new Error('Release revision must be a 40-character lowercase commit SHA.')
}

export function assertVersion(version) {
  if (!SEMVER_PATTERN.test(String(version ?? ''))) throw new Error('Release version must be semantic version metadata.')
}

export function resolveProductionPlan(gateResults) {
  const failedGate = PREFLIGHT_GATES.find((gate) => gateResults?.[gate] !== true)
  return failedGate
    ? { blocked: true, failedGate, mutations: [] }
    : { blocked: false, failedGate: undefined, mutations: [...PRODUCTION_MUTATION_JOBS] }
}

async function listFiles(rootDir, includes) {
  const files = []
  async function visit(path, relativePath) {
    const entries = await readdir(path, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = join(path, entry.name)
      const entryRelativePath = join(relativePath, entry.name)
      if (entry.isDirectory()) await visit(entryPath, entryRelativePath)
      else if (entry.isFile()) files.push(entryRelativePath.replaceAll('\\', '/'))
    }
  }

  for (const include of includes) await visit(join(rootDir, include), include)
  return files.sort()
}

async function digestFile(path) {
  const data = await readFile(path)
  return { bytes: data.byteLength, sha256: createHash('sha256').update(data).digest('hex') }
}

export async function createArtifactManifest({ rootDir, includes, metadata }) {
  const files = []
  for (const path of await listFiles(rootDir, includes)) {
    files.push({ path, ...(await digestFile(join(rootDir, path))) })
  }
  return {
    schemaVersion: 1,
    revision: metadata.revision,
    version: metadata.version,
    files,
  }
}

export async function verifyArtifactManifest({ rootDir, manifest, metadata, expected }) {
  const failures = verifyReleaseMetadata(metadata, expected)
  if (manifest?.schemaVersion !== 1) failures.push('Preflight artifact manifest schemaVersion must be 1.')
  if (manifest?.revision !== expected.revision) failures.push(`Preflight artifact manifest revision must be ${expected.revision}.`)
  if (manifest?.version !== expected.version) failures.push(`Preflight artifact manifest version must be ${expected.version}.`)

  for (const entry of manifest?.files ?? []) {
    const path = join(rootDir, entry.path)
    try {
      const actual = await digestFile(path)
      if (actual.bytes !== entry.bytes || actual.sha256 !== entry.sha256) {
        failures.push(`Preflight artifact digest mismatch: ${entry.path}.`)
      }
    } catch {
      failures.push(`Preflight artifact is missing: ${entry.path}.`)
    }
  }
  return failures
}

function flagValues(args, name) {
  return args.flatMap((arg, index) => arg === name && args[index + 1] ? [args[index + 1]] : [])
}

function flagValue(args, name) {
  return flagValues(args, name)[0]
}

function requireFlag(args, name) {
  const value = flagValue(args, name)
  if (!value) throw new Error(`${name} is required.`)
  return value
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

async function cli(args) {
  const command = args[0]
  if (command === 'create-metadata') {
    const metadata = createReleaseMetadata({
      revision: requireFlag(args, '--revision'),
      version: requireFlag(args, '--version'),
      repository: flagValue(args, '--repository') ?? '',
      workflowRunId: flagValue(args, '--run-id') ?? '',
      eventName: flagValue(args, '--event') ?? '',
    })
    await writeJson(requireFlag(args, '--output'), metadata)
    return
  }

  if (command === 'verify-metadata') {
    const failures = verifyReleaseMetadata(await readJson(requireFlag(args, '--file')), {
      revision: requireFlag(args, '--revision'),
      version: requireFlag(args, '--version'),
    })
    if (failures.length) throw new Error(failures.join('\n'))
    return
  }

  if (command === 'create-manifest') {
    const rootDir = resolve(requireFlag(args, '--root'))
    const metadata = await readJson(resolve(requireFlag(args, '--metadata')))
    await writeJson(requireFlag(args, '--output'), await createArtifactManifest({
      rootDir,
      includes: flagValues(args, '--include'),
      metadata,
    }))
    return
  }

  if (command === 'verify-manifest') {
    const rootDir = resolve(requireFlag(args, '--root'))
    const metadata = await readJson(resolve(requireFlag(args, '--metadata')))
    const manifest = await readJson(resolve(requireFlag(args, '--manifest')))
    const failures = await verifyArtifactManifest({
      rootDir,
      manifest,
      metadata,
      expected: {
        revision: requireFlag(args, '--revision'),
        version: requireFlag(args, '--version'),
      },
    })
    if (failures.length) throw new Error(failures.join('\n'))
    return
  }

  throw new Error(`Unknown release preflight command: ${command ?? '(missing)'}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  cli(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
