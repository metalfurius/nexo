import { appendFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

const bump = String(process.argv[2] ?? '').trim().toLowerCase()
const dryRun = process.argv.includes('--dry-run')
const bumpTypes = new Set(['patch', 'minor', 'major'])
const baseVersionIndex = process.argv.indexOf('--base-version')
const baseVersion =
  baseVersionIndex === -1 ? undefined : String(process.argv[baseVersionIndex + 1] ?? '').trim() || undefined

if (!bumpTypes.has(bump)) {
  console.error('Usage: node scripts/bumpVersion.mjs <patch|minor|major> [--dry-run] [--base-version x.y.z]')
  process.exit(1)
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function nextVersion(version, bumpType) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version ?? ''))
  if (!match) throw new Error(`Unsupported semver version: ${String(version)}`)

  const major = Number(match[1])
  const minor = Number(match[2])
  const patch = Number(match[3])

  if (bumpType === 'major') return `${major + 1}.0.0`
  if (bumpType === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function setPackageLockVersion(lockfile, version) {
  lockfile.version = version
  if (lockfile.packages?.['']) lockfile.packages[''].version = version
}

function packageLockVersionMatches(lockfile, version) {
  return lockfile.version === version && lockfile.packages?.['']?.version === version
}

function setServiceWorkerCacheVersion(source, version) {
  const cacheVersionPattern = /^const CACHE_VERSION = 'nexo-v\d+\.\d+\.\d+'$/m
  if (!cacheVersionPattern.test(source)) throw new Error('Could not find service worker CACHE_VERSION declaration.')
  return source.replace(cacheVersionPattern, `const CACHE_VERSION = 'nexo-v${version}'`)
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath) appendFileSync(outputPath, `${name}=${value}\n`)
}

const rootPackage = await readJson('package.json')
const currentVersion = rootPackage.version
const newVersion = nextVersion(baseVersion ?? currentVersion, bump)

if (!dryRun) {
  const rootLock = await readJson('package-lock.json')
  const functionsPackage = await readJson('functions/package.json')
  const functionsLock = await readJson('functions/package-lock.json')
  const serviceWorker = await readFile('public/sw.js', 'utf8')
  const nextServiceWorker = setServiceWorkerCacheVersion(serviceWorker, newVersion)

  const alreadyCurrent =
    rootPackage.version === newVersion &&
    functionsPackage.version === newVersion &&
    packageLockVersionMatches(rootLock, newVersion) &&
    packageLockVersionMatches(functionsLock, newVersion) &&
    nextServiceWorker === serviceWorker

  if (!alreadyCurrent) {
    rootPackage.version = newVersion
    functionsPackage.version = newVersion
    setPackageLockVersion(rootLock, newVersion)
    setPackageLockVersion(functionsLock, newVersion)

    await writeJson('package.json', rootPackage)
    await writeJson('package-lock.json', rootLock)
    await writeJson('functions/package.json', functionsPackage)
    await writeJson('functions/package-lock.json', functionsLock)
    await writeFile('public/sw.js', nextServiceWorker)
  }
}

writeOutput('version', newVersion)
console.log(`${currentVersion} -> ${newVersion}`)
