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

const rootPackage = await readJson<{ scripts?: Record<string, string>; version?: string }>('package.json')
const functionsPackage = await readJson<{ version?: string }>('functions/package.json')
check(rootPackage.version === '1.0.0', 'Root package version must be 1.0.0.')
check(functionsPackage.version === rootPackage.version, 'Functions package version must match root package version.')
check(rootPackage.scripts?.['check:release-files'], 'package.json must expose check:release-files.')
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
  manifest.shortcuts?.some((shortcut) => shortcut.url === '/?tab=dice') &&
    manifest.shortcuts?.some((shortcut) => shortcut.url === '/?tab=explorer'),
  'Manifest must include dice and explorer shortcuts.',
)

const serviceWorker = await readText('public/sw.js')
check(serviceWorker.includes("'/manifest.webmanifest'"), 'Service worker should cache the manifest.')
check(serviceWorker.includes('request.mode === \'navigate\''), 'Service worker should handle navigation requests.')
check(serviceWorker.includes('/assets/'), 'Service worker should cache built assets.')

const changelog = await readText('CHANGELOG.md')
check(changelog.includes('## 1.0.0'), 'CHANGELOG.md must include 1.0.0 release notes.')

const releaseChecklist = await readText('docs/release-checklist.md')
check(releaseChecklist.includes('npm run release:check'), 'Release checklist must mention npm run release:check.')
check(releaseChecklist.includes('v1.0.0'), 'Release checklist must mention tag v1.0.0.')

const ciWorkflow = await readText('.github/workflows/ci.yml')
check(ciWorkflow.includes('pull_request:'), 'CI workflow must run on pull requests.')
check(ciWorkflow.includes('npm run check'), 'CI workflow must run npm run check.')
check(ciWorkflow.includes('npm run test:e2e'), 'CI workflow must run E2E tests.')
check(ciWorkflow.includes('npm run check:release-files'), 'CI workflow must run check:release-files.')
check(ciWorkflow.includes('npm audit --audit-level=high'), 'CI workflow must run high severity audit.')

const deployWorkflow = await readText('.github/workflows/deploy-pages.yml')
check(deployWorkflow.includes('branches: [main]'), 'Deploy workflow must run on main pushes.')
check(deployWorkflow.includes('npm run check:release-files'), 'Deploy workflow must run check:release-files.')
check(deployWorkflow.includes('actions/deploy-pages'), 'Deploy workflow must deploy GitHub Pages.')

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
