import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import test from 'node:test'

import {
  createArtifactManifest,
  createReleaseMetadata,
  resolveProductionPlan,
  verifyArtifactManifest,
  verifyReleaseMetadata,
} from './releasePreflight.mjs'

const revision = '0123456789abcdef0123456789abcdef01234567'
const version = '1.4.1'

test('release metadata is immutable and rejects revision or version drift', () => {
  const metadata = createReleaseMetadata({ revision, version, repository: 'metalfurius/nexo', workflowRunId: 42 })
  assert.deepEqual(verifyReleaseMetadata(metadata, { revision, version }), [])
  assert.match(verifyReleaseMetadata(metadata, { revision: 'fedcba9876543210fedcba9876543210fedcba98', version }).join('\n'), /revision/)
  assert.match(verifyReleaseMetadata(metadata, { revision, version: '1.4.2' }).join('\n'), /version/)
})

test('artifact manifest detects tampering after preflight', async () => {
  const rootDir = await mkdtemp(join(process.env.TEMP ?? process.env.TMP ?? '.', 'nexo-preflight-test-'))
  try {
    await mkdir(join(rootDir, 'dist'), { recursive: true })
    await mkdir(join(rootDir, 'functions', 'lib'), { recursive: true })
    await mkdir(join(rootDir, 'worker'), { recursive: true })
    const metadata = createReleaseMetadata({ revision, version })
    await writeFile(join(rootDir, 'release-metadata.json'), `${JSON.stringify(metadata)}\n`)
    await writeFile(join(rootDir, 'dist', 'version.json'), `${JSON.stringify({ revision, version })}\n`)
    await writeFile(join(rootDir, 'functions', 'lib', 'index.js'), 'export const revision = process.env.BUILD_SHA\n')
    await writeFile(join(rootDir, 'worker', 'worker.js'), 'export default {}\n')
    const manifest = await createArtifactManifest({
      rootDir,
      includes: ['dist', 'functions/lib', 'worker'],
      metadata,
    })
    assert.deepEqual(await verifyArtifactManifest({
      rootDir,
      manifest,
      metadata,
      expected: { revision, version },
    }), [])

    await writeFile(join(rootDir, 'worker', 'worker.js'), 'export default { tampered: true }\n')
    assert.match((await verifyArtifactManifest({
      rootDir,
      manifest,
      metadata,
      expected: { revision, version },
    })).join('\n'), /digest mismatch/)
  } finally {
    await rm(rootDir, { recursive: true, force: true })
  }
})

test('late preflight failure blocks every production mutation', () => {
  const gateResults = {
    'release metadata': true,
    'frontend build and budget': true,
    'Functions build and tests': true,
    'Worker dry run': true,
    'security audits': true,
    'release and end-to-end checks': false,
  }
  assert.deepEqual(resolveProductionPlan(gateResults), {
    blocked: true,
    failedGate: 'release and end-to-end checks',
    mutations: [],
  })
})

test('a successful preflight exposes the only ordered mutation path', () => {
  assert.deepEqual(resolveProductionPlan({
    'release metadata': true,
    'frontend build and budget': true,
    'Functions build and tests': true,
    'Worker dry run': true,
    'security audits': true,
    'release and end-to-end checks': true,
  }), {
    blocked: false,
    failedGate: undefined,
    mutations: ['deploy-firebase', 'deploy-worker', 'deploy-pages'],
  })
})
