import { appendFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

const bump = String(process.argv[2] ?? '').trim().toLowerCase()
const dryRun = process.argv.includes('--dry-run')
const bumpTypes = new Set(['patch', 'minor', 'major'])

if (!bumpTypes.has(bump)) {
  console.error('Usage: node scripts/bumpVersion.mjs <patch|minor|major> [--dry-run]')
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

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath) appendFileSync(outputPath, `${name}=${value}\n`)
}

const rootPackage = await readJson('package.json')
const currentVersion = rootPackage.version
const newVersion = nextVersion(currentVersion, bump)

if (!dryRun) {
  const rootLock = await readJson('package-lock.json')
  const functionsPackage = await readJson('functions/package.json')
  const functionsLock = await readJson('functions/package-lock.json')

  rootPackage.version = newVersion
  functionsPackage.version = newVersion
  setPackageLockVersion(rootLock, newVersion)
  setPackageLockVersion(functionsLock, newVersion)

  await writeJson('package.json', rootPackage)
  await writeJson('package-lock.json', rootLock)
  await writeJson('functions/package.json', functionsPackage)
  await writeJson('functions/package-lock.json', functionsLock)
}

writeOutput('version', newVersion)
console.log(`${currentVersion} -> ${newVersion}`)
