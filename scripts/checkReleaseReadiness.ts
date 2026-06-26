import { access, readFile } from 'node:fs/promises'
import { parsePublicCatalogSeed, createPublicCatalogSeedTemplate } from '../src/lib/publicCatalogSeed'

const requiredEnvVars = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_FIREBASE_MEASUREMENT_ID',
  'VITE_DEMO_MODE',
  'VITE_USE_FIREBASE_EMULATORS',
]

const requiredFiles = [
  'README.md',
  'CHANGELOG.md',
  'docs/release-checklist.md',
  'docs/public-catalog-import.md',
  '.env.example',
  'firebase.json',
  'firestore.rules',
  'firestore.indexes.json',
  'public/CNAME',
  'public/manifest.webmanifest',
  'public/sw.js',
  'seed/public-catalog.seed.json',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-pages.yml',
  '.github/workflows/version-bump.yml',
]

const failures: string[] = []

function check(condition: unknown, message: string) {
  if (!condition) failures.push(message)
}

async function readText(path: string) {
  return readFile(path, 'utf8')
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readText(path)) as T
}

for (const file of requiredFiles) {
  try {
    await access(file)
    check((await readText(file)).trim().length > 0, `${file} must not be empty.`)
  } catch {
    failures.push(`${file} is required for release readiness.`)
  }
}

const semverPattern = /^\d+\.\d+\.\d+$/
const rootPackage = await readJson<{ scripts?: Record<string, string>; version?: string }>('package.json')
const rootLock = await readJson<{ packages?: Record<string, { version?: string }>; version?: string }>('package-lock.json')
const functionsPackage = await readJson<{ version?: string }>('functions/package.json')
const functionsLock = await readJson<{ packages?: Record<string, { version?: string }>; version?: string }>('functions/package-lock.json')
check(semverPattern.test(rootPackage.version ?? ''), 'Root package version must be plain semver x.y.z.')
check(rootLock.version === rootPackage.version, 'Root package-lock version must match root package version.')
check(rootLock.packages?.['']?.version === rootPackage.version, 'Root package-lock root package version must match root package version.')
check(functionsPackage.version === rootPackage.version, 'Functions package version must match root package version.')
check(functionsLock.version === rootPackage.version, 'Functions package-lock version must match root package version.')
check(functionsLock.packages?.['']?.version === rootPackage.version, 'Functions package-lock root package version must match root package version.')
check(rootPackage.scripts?.['check:build-output'], 'package.json must expose check:build-output.')
check(rootPackage.scripts?.check?.includes('check:build-output'), 'npm run check must include check:build-output.')
check(rootPackage.scripts?.['check:release-files'], 'package.json must expose check:release-files.')
check(rootPackage.scripts?.['version:bump'], 'package.json must expose version:bump.')
check(rootPackage.scripts?.['release:check']?.includes('check:release-files'), 'release:check must include check:release-files.')

const cname = (await readText('public/CNAME')).trim()
check(cname === 'nexo.codeoverdose.es', 'public/CNAME must point to nexo.codeoverdose.es.')

const envExample = await readText('.env.example')
for (const variable of requiredEnvVars) {
  check(envExample.includes(`${variable}=`), `.env.example must include ${variable}.`)
}

const firebaseConfig = await readJson<{
  firestore?: { indexes?: string; rules?: string }
  hosting?: { public?: string; rewrites?: Array<{ destination?: string; source?: string }> }
}>('firebase.json')
check(firebaseConfig.hosting?.public === 'dist', 'firebase.json hosting.public must be dist.')
check(
  firebaseConfig.hosting?.rewrites?.some((rewrite) => rewrite.source === '**' && rewrite.destination === '/index.html'),
  'firebase.json must rewrite hosting routes to /index.html.',
)
check(firebaseConfig.firestore?.rules === 'firestore.rules', 'firebase.json must use firestore.rules.')
check(firebaseConfig.firestore?.indexes === 'firestore.indexes.json', 'firebase.json must use firestore.indexes.json.')

const manifest = await readJson<{
  display?: string
  icons?: Array<{ purpose?: string; src?: string }>
  id?: string
  name?: string
  scope?: string
  screenshots?: Array<{ form_factor?: string; src?: string }>
  shortcuts?: Array<{ name?: string; url?: string }>
  start_url?: string
}>('public/manifest.webmanifest')
check(manifest.name === 'Nexo', 'Manifest name must be Nexo.')
check(manifest.id === '/', 'Manifest id must be /.')
check(manifest.start_url === '/', 'Manifest start_url must be /.')
check(manifest.scope === '/', 'Manifest scope must be /.')
check(manifest.display === 'standalone', 'Manifest display must be standalone.')
check(
  manifest.icons?.some((icon) => icon.src === '/icons/nexo.svg' && icon.purpose?.includes('maskable')),
  'Manifest must include the maskable Nexo SVG icon.',
)
check(
  manifest.icons?.some((icon) => icon.src === '/icons/nexo-192.png') &&
    manifest.icons?.some((icon) => icon.src === '/icons/nexo-512.png') &&
    manifest.icons?.some((icon) => icon.src === '/icons/nexo-maskable-512.png' && icon.purpose?.includes('maskable')),
  'Manifest must include raster and maskable PNG icons.',
)
check(
  manifest.screenshots?.some((screenshot) => screenshot.src === '/screenshots/nexo-wide.png' && screenshot.form_factor === 'wide') &&
    manifest.screenshots?.some((screenshot) => screenshot.src === '/screenshots/nexo-narrow.png' && screenshot.form_factor === 'narrow'),
  'Manifest must include wide and narrow screenshots.',
)
check(
  manifest.shortcuts?.some((shortcut) => shortcut.url === '/?tab=dice') &&
    manifest.shortcuts?.some((shortcut) => shortcut.url === '/?tab=explorer') &&
    manifest.shortcuts?.some((shortcut) => shortcut.url === '/?tab=import'),
  'Manifest must include dice, explorer and import shortcuts.',
)

const serviceWorker = await readText('public/sw.js')
check(serviceWorker.includes("'/manifest.webmanifest'"), 'Service worker should cache the manifest.')
check(serviceWorker.includes("'/icons/nexo-192.png'"), 'Service worker should cache raster icons.')
check(serviceWorker.includes("'/screenshots/nexo-wide.png'"), 'Service worker should cache screenshots.')
check(serviceWorker.includes('request.mode === \'navigate\''), 'Service worker should handle navigation requests.')
check(serviceWorker.includes('/assets/'), 'Service worker should cache built assets.')
check(serviceWorker.includes('NEXO_SKIP_WAITING'), 'Service worker should support user-triggered updates.')

const changelog = await readText('CHANGELOG.md')
check(changelog.includes('## 1.0.0'), 'CHANGELOG.md must include 1.0.0 release notes.')

const releaseChecklist = await readText('docs/release-checklist.md')
check(releaseChecklist.includes('npm run release:check'), 'Release checklist must mention npm run release:check.')
check(releaseChecklist.includes('patch') && releaseChecklist.includes('minor') && releaseChecklist.includes('major'), 'Release checklist must mention version labels.')

const ciWorkflow = await readText('.github/workflows/ci.yml')
check(ciWorkflow.includes('pull_request:'), 'CI workflow must run on pull requests.')
check(ciWorkflow.includes('Version bump label'), 'CI workflow must enforce version bump labels.')
check(ciWorkflow.includes('npm run check'), 'CI workflow must run npm run check.')
check(ciWorkflow.includes('npm run test:e2e'), 'CI workflow must run E2E tests.')
check(ciWorkflow.includes('npm run check:release-files'), 'CI workflow must run check:release-files.')
check(ciWorkflow.includes('npm audit --audit-level=high'), 'CI workflow must run high severity audit.')

const deployWorkflow = await readText('.github/workflows/deploy-pages.yml')
check(deployWorkflow.includes('branches: [main]'), 'Deploy workflow must run on main pushes.')
check(deployWorkflow.includes('npm run check:build-output'), 'Deploy workflow must validate build output.')
check(deployWorkflow.includes('npm run check:release-files'), 'Deploy workflow must run check:release-files.')
check(deployWorkflow.includes('actions/deploy-pages'), 'Deploy workflow must deploy GitHub Pages.')

const versionWorkflow = await readText('.github/workflows/version-bump.yml')
check(versionWorkflow.includes('pull_request:'), 'Version workflow must run after merged pull requests.')
check(versionWorkflow.includes('workflow_dispatch:'), 'Version workflow must support manual dispatch.')
check(versionWorkflow.includes('scripts/bumpVersion.mjs'), 'Version workflow must bump package versions.')
check(versionWorkflow.includes('gh workflow run deploy-pages.yml'), 'Version workflow must trigger deploy after bumping versions.')

const seed = await readJson<unknown>('seed/public-catalog.seed.json')
const seedResult = parsePublicCatalogSeed(seed, 'release-check')
check(seedResult.errors.length === 0, `Public catalog seed must validate: ${seedResult.errors[0] ?? ''}`)
check(seedResult.items.length > 0, 'Public catalog seed must contain at least one valid item.')

const templateResult = parsePublicCatalogSeed(createPublicCatalogSeedTemplate(), 'release-check')
check(templateResult.errors.length === 0, `Public catalog seed template must validate: ${templateResult.errors[0] ?? ''}`)

if (failures.length) {
  console.error(`Release readiness failed with ${failures.length} issue(s):`)
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exitCode = 1
} else {
  console.log('Release readiness files look good.')
}
