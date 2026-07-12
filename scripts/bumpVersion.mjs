import { appendFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'

const args = process.argv.slice(2)
const target = String(args[0] ?? '').trim()
let dryRun = false
let baseVersion

const plainSemverPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

if (!plainSemverPattern.test(target)) {
  console.error('Usage: node scripts/bumpVersion.mjs x.y.z [--dry-run] [--base-version x.y.z].')
  process.exit(1)
}

for (let index = 1; index < args.length; index += 1) {
  const argument = args[index]
  if (argument === '--dry-run') {
    if (dryRun) {
      console.error('--dry-run may only be provided once.')
      process.exit(1)
    }
    dryRun = true
    continue
  }
  if (argument === '--base-version') {
    if (baseVersion !== undefined) {
      console.error('--base-version may only be provided once.')
      process.exit(1)
    }
    baseVersion = String(args[index + 1] ?? '').trim()
    if (!baseVersion) {
      console.error('--base-version requires a plain semver x.y.z value.')
      process.exit(1)
    }
    index += 1
    continue
  }

  console.error(`Unexpected argument ${argument}. Expected a target x.y.z and supported flags only.`)
  process.exit(1)
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`)
}

function parseVersion(version) {
  const match = plainSemverPattern.exec(String(version ?? ''))
  if (!match) throw new Error(`Unsupported semver version: ${String(version)}`)
  return match.slice(1).map(BigInt)
}

function compareVersions(left, right) {
  const leftParts = parseVersion(left)
  const rightParts = parseVersion(right)
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] < rightParts[index] ? -1 : 1
  }
  return 0
}

function assertNotDowngrade(version, source) {
  if (compareVersions(target, version) < 0) {
    throw new Error(`Refusing to downgrade ${source} from ${version} to ${target}.`)
  }
}

function setPackageLockVersion(lockfile, version) {
  lockfile.version = version
  if (lockfile.packages?.['']) lockfile.packages[''].version = version
}

function packageLockVersionMatches(lockfile, version) {
  return lockfile.version === version && lockfile.packages?.['']?.version === version
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath) appendFileSync(outputPath, `${name}=${value}\n`)
}

const rootPackage = await readJson('package.json')
const currentVersion = String(rootPackage.version ?? '')
assertNotDowngrade(currentVersion, 'root package')
if (baseVersion) {
  parseVersion(baseVersion)
  if (compareVersions(target, baseVersion) <= 0) {
    throw new Error(`Release target ${target} must be newer than base version ${baseVersion}.`)
  }
}

if (!dryRun) {
  const rootLock = await readJson('package-lock.json')
  const functionsPackage = await readJson('functions/package.json')
  const functionsLock = await readJson('functions/package-lock.json')
  assertNotDowngrade(String(rootLock.version ?? ''), 'root lockfile')
  assertNotDowngrade(String(rootLock.packages?.['']?.version ?? ''), 'root lockfile package')
  assertNotDowngrade(String(functionsPackage.version ?? ''), 'functions package')
  assertNotDowngrade(String(functionsLock.version ?? ''), 'functions lockfile')
  assertNotDowngrade(String(functionsLock.packages?.['']?.version ?? ''), 'functions lockfile package')
  const alreadyCurrent =
    currentVersion === target &&
    functionsPackage.version === target &&
    packageLockVersionMatches(rootLock, target) &&
    packageLockVersionMatches(functionsLock, target)

  if (!alreadyCurrent) {
    rootPackage.version = target
    functionsPackage.version = target
    setPackageLockVersion(rootLock, target)
    setPackageLockVersion(functionsLock, target)

    await writeJson('package.json', rootPackage)
    await writeJson('package-lock.json', rootLock)
    await writeJson('functions/package.json', functionsPackage)
    await writeJson('functions/package-lock.json', functionsLock)
  }
}

writeOutput('version', target)
console.log(`${currentVersion} -> ${target}`)
