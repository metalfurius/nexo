import { access, readFile } from 'node:fs/promises'
import { parseDocument } from 'yaml'
import { parsePublicCatalogSeed, createPublicCatalogSeedTemplate } from '../src/lib/publicCatalogSeed'

type StructuredValue = null | boolean | number | string | StructuredValue[] | { [key: string]: StructuredValue }
type StructuredObject = { [key: string]: StructuredValue }

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
  'VITE_CATALOG_API_URL',
  'VITE_CATALOG_PROXY_URL',
  'VITE_PUBLIC_CATALOG_URL',
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
  'infra/gcp-wif/main.tf',
  'infra/gcp-wif/variables.tf',
  'infra/gcp-wif/versions.tf',
  'infra/gcp-wif/terraform.tfvars.example',
  'infra/gcp-wif/README.md',
  'public/CNAME',
  'public/manifest.webmanifest',
  'public/screenshots/nexo-narrow.png',
  'public/screenshots/nexo-wide.png',
  'src/sw.ts',
  'vite.config.ts',
  'seed/public-catalog.seed.json',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-production.yml',
  '.github/workflows/version-bump.yml',
  '.github/dependabot.yml',
  'scripts/bumpVersion.mjs',
  'scripts/checkArchitecture.ts',
  'scripts/releaseTools.test.mjs',
  'scripts/resolveVersionBump.mjs',
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

async function readYaml(path: string) {
  const document = parseDocument(await readText(path), { prettyErrors: true, strict: true })
  check(document.errors.length === 0, `${path} must contain structurally valid YAML: ${document.errors[0]?.message ?? ''}`)
  return (document.errors.length ? {} : document.toJS()) as StructuredObject
}

function asObject(value: StructuredValue | undefined): StructuredObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function asArray(value: StructuredValue | undefined) {
  return Array.isArray(value) ? value : []
}

function workflowJob(workflow: StructuredObject, name: string) {
  return asObject(asObject(workflow.jobs)[name])
}

function workflowSteps(job: StructuredObject) {
  return asArray(job.steps).map(asObject)
}

function stepRuns(job: StructuredObject) {
  return workflowSteps(job).map((step) => step.run).filter((run): run is string => typeof run === 'string')
}

function stepUses(job: StructuredObject) {
  return workflowSteps(job).map((step) => step.uses).filter((uses): uses is string => typeof uses === 'string')
}

function includesRun(job: StructuredObject, expected: string) {
  return stepRuns(job).some((run) => run.includes(expected))
}

function normalizedNeeds(job: StructuredObject) {
  if (typeof job.needs === 'string') return [job.needs]
  return asArray(job.needs).filter((need): need is string => typeof need === 'string')
}

function checkPinnedActions(workflow: StructuredObject, workflowPath: string) {
  for (const [jobName, rawJob] of Object.entries(asObject(workflow.jobs))) {
    for (const action of stepUses(asObject(rawJob))) {
      if (action.startsWith('./')) continue
      check(/^[^@]+@[0-9a-f]{40}$/.test(action), `${workflowPath} job ${jobName} must pin ${action} to a full commit SHA.`)
    }
  }
}

for (const file of requiredFiles) {
  try {
    await access(file)
    check((await readText(file)).trim().length > 0, `${file} must not be empty.`)
  } catch {
    failures.push(`${file} is required for release readiness.`)
  }
}

const semverPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/
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
check(rootPackage.scripts?.['check:architecture'], 'package.json must expose check:architecture.')
check(rootPackage.scripts?.check?.includes('check:architecture'), 'npm run check must include check:architecture.')
check(rootPackage.scripts?.check?.includes('check:build-output'), 'npm run check must include check:build-output.')
check(rootPackage.scripts?.['check:release-files'], 'package.json must expose check:release-files.')
check(rootPackage.scripts?.['check:release-tools'], 'package.json must expose check:release-tools.')
check(rootPackage.scripts?.check?.includes('check:release-tools'), 'npm run check must include check:release-tools.')
check(rootPackage.scripts?.['check:functions']?.includes('functions run typecheck'), 'check:functions must typecheck Functions tests.')
check(rootPackage.scripts?.['check:functions']?.includes('functions run test'), 'check:functions must run Functions unit tests.')
check(rootPackage.scripts?.['catalog:write:prod'], 'package.json must expose catalog:write:prod.')
check(rootPackage.scripts?.['test:e2e:firebase'], 'package.json must expose test:e2e:firebase.')
check(rootPackage.scripts?.['test:e2e:pwa'], 'package.json must expose test:e2e:pwa.')
check(rootPackage.scripts?.['test:e2e:prod'], 'package.json must expose test:e2e:prod.')
check(rootPackage.scripts?.['version:bump'], 'package.json must expose version:bump.')
check(rootPackage.scripts?.['release:check']?.includes('test:e2e:firebase'), 'release:check must include Firebase E2E.')
check(rootPackage.scripts?.['release:check']?.includes('test:e2e:pwa'), 'release:check must include PWA E2E.')
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

const wifConfig = await readText('infra/gcp-wif/main.tf')
check(wifConfig.includes('github_repository_id = "1255487355"'), 'WIF must restrict the GitHub repository id.')
check(wifConfig.includes('github_owner_id      = "75508084"'), 'WIF must restrict the GitHub owner id.')
check(wifConfig.includes('github_main_ref      = "refs/heads/main"'), 'WIF must restrict deployments to main.')
check(wifConfig.includes('attribute_condition'), 'WIF must enforce the GitHub OIDC attribute condition.')
check(wifConfig.includes('roles/iam.workloadIdentityUser'), 'WIF must grant workloadIdentityUser without a JSON key.')

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

async function readPngDimensions(path: string) {
  const data = await readFile(path)
  if (data.length < 24 || data.toString('ascii', 1, 4) !== 'PNG') return undefined
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
}

const wideScreenshot = await readPngDimensions('public/screenshots/nexo-wide.png')
const narrowScreenshot = await readPngDimensions('public/screenshots/nexo-narrow.png')
check(wideScreenshot?.width === 1280 && wideScreenshot.height === 720, 'Wide PWA screenshot must be 1280x720.')
check(narrowScreenshot?.width === 390 && narrowScreenshot.height === 844, 'Narrow PWA screenshot must be 390x844.')
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
  manifest.shortcuts?.some((shortcut) => shortcut.url === '/?tab=home') &&
    manifest.shortcuts?.some((shortcut) => shortcut.url === '/?tab=dice') &&
    manifest.shortcuts?.some((shortcut) => shortcut.url === '/?tab=discover&mode=search'),
  'Manifest must include home, dice and discover shortcuts.',
)

const serviceWorker = await readText('src/sw.ts')
const viteConfig = await readText('vite.config.ts')
check(viteConfig.includes("strategies: 'injectManifest'"), 'Vite PWA must use Workbox injectManifest.')
check(viteConfig.includes("filename: 'sw.ts'"), 'Vite PWA must compile src/sw.ts.')
check(viteConfig.includes("injectRegister: null"), 'Vite PWA registration must remain controlled by the application.')
check(serviceWorker.includes('precacheAndRoute(self.__WB_MANIFEST)'), 'Service worker must precache the injected hashed build manifest.')
check(serviceWorker.includes("prefix: 'nexo'"), 'Service worker caches must use the Nexo prefix.')
check(serviceWorker.includes('new NetworkFirst'), 'Service worker should use NetworkFirst for navigation requests.')
check(serviceWorker.includes('networkTimeoutSeconds: 3'), 'Service worker navigation timeout must be three seconds.')
check(serviceWorker.includes("url.origin === self.location.origin"), 'Service worker navigation caching must stay same-origin.')
check(serviceWorker.includes('NEXO_SKIP_WAITING'), 'Service worker should support user-triggered updates.')
check(!serviceWorker.includes('skipWaiting()\n'), 'Service worker updates must not skip waiting automatically.')

const changelog = await readText('CHANGELOG.md')
check(changelog.includes('## 1.0.0'), 'CHANGELOG.md must include 1.0.0 release notes.')
const currentVersionHeading = new RegExp(`^## ${String(rootPackage.version).replaceAll('.', '\\.')}(?:\\s+-|\\s*$)`, 'm')
check(currentVersionHeading.test(changelog), `CHANGELOG.md must include release notes for ${rootPackage.version}.`)

const releaseChecklist = await readText('docs/release-checklist.md')
check(releaseChecklist.includes('npm run release:check'), 'Release checklist must mention npm run release:check.')
check(releaseChecklist.includes('release:x.y.z'), 'Release checklist must document the dynamic release:x.y.z label.')
check(releaseChecklist.includes('v<version>'), 'Release checklist must document the dynamic v<version> release tag.')

const ciWorkflow = await readYaml('.github/workflows/ci.yml')
const ciTriggers = asObject(ciWorkflow.on)
const ciJob = workflowJob(ciWorkflow, 'verify')
check(Boolean(ciTriggers.pull_request), 'CI workflow must run on pull requests.')
check(Boolean(ciTriggers.push), 'CI workflow must gate pushes to main.')
check(ciTriggers.workflow_dispatch !== undefined, 'CI workflow must support manual dispatch.')
check(asObject(ciWorkflow.concurrency)['cancel-in-progress'] === true, 'CI workflow must cancel superseded runs for the same PR/ref.')
check(includesRun(ciJob, 'scripts/resolveVersionBump.mjs'), 'CI workflow must enforce the dynamic version label.')
check(includesRun(ciJob, 'npm run check'), 'CI workflow must run npm run check.')
check(includesRun(ciJob, 'npm run test:e2e'), 'CI workflow must run local E2E tests.')
check(includesRun(ciJob, 'npm run test:e2e:pwa'), 'CI workflow must run the offline PWA smoke.')
check(includesRun(ciJob, 'npm run test:e2e:firebase'), 'CI workflow must run Firebase E2E tests.')
check(includesRun(ciJob, 'npm run worker:check'), 'CI workflow must dry-run the Worker bundle.')
check(includesRun(ciJob, 'npm run check:release-files'), 'CI workflow must run check:release-files.')
check(includesRun(ciJob, 'npm audit --audit-level=high'), 'CI workflow must run the root high severity audit.')
check(includesRun(ciJob, 'npm run audit:functions'), 'CI workflow must run the Functions high severity audit.')
check(
  workflowSteps(ciJob).some((step) => step.if === 'failure()' && String(step.uses ?? '').startsWith('actions/upload-artifact@')),
  'CI workflow must upload Playwright diagnostics on failure.',
)
checkPinnedActions(ciWorkflow, '.github/workflows/ci.yml')

const deployWorkflow = await readYaml('.github/workflows/deploy-production.yml')
const deployTriggers = asObject(deployWorkflow.on)
const workflowRunTrigger = asObject(deployTriggers.workflow_run)
const dispatchInputs = asObject(asObject(deployTriggers.workflow_dispatch).inputs)
check(asArray(workflowRunTrigger.workflows).includes('CI'), 'Production deploy must depend on the CI workflow.')
check(Boolean(dispatchInputs.ref), 'Production deploy dispatch must accept an explicit ref.')
check(asObject(dispatchInputs.ref).required === true, 'Production redeploys must require an explicit release tag.')
check(Boolean(dispatchInputs.skip_seed), 'Production deploy dispatch must accept skip_seed.')

const prepareJob = workflowJob(deployWorkflow, 'prepare')
const firebaseJob = workflowJob(deployWorkflow, 'deploy-firebase')
const workerJob = workflowJob(deployWorkflow, 'deploy-worker')
const buildPagesJob = workflowJob(deployWorkflow, 'build-pages')
const deployPagesJob = workflowJob(deployWorkflow, 'deploy-pages')
const smokeJob = workflowJob(deployWorkflow, 'production-smoke')
const releaseJob = workflowJob(deployWorkflow, 'publish-release')

check(normalizedNeeds(firebaseJob).includes('prepare'), 'Firebase must deploy from the prepared immutable revision.')
check(
  normalizedNeeds(workerJob).includes('deploy-firebase'),
  'Worker deploy must wait for Functions, Firestore rules and indexes.',
)
check(normalizedNeeds(buildPagesJob).includes('deploy-worker'), 'Pages build must wait for the Worker deploy.')
check(normalizedNeeds(deployPagesJob).includes('build-pages'), 'Pages deploy must use the verified Pages artifact.')
check(normalizedNeeds(smokeJob).includes('deploy-pages'), 'Production smoke must wait for Pages deployment.')
check(normalizedNeeds(releaseJob).includes('production-smoke'), 'Release publication must wait for the production smoke.')
check(includesRun(prepareJob, 'git rev-parse HEAD'), 'Production deploy must resolve an immutable SHA.')
check(
  includesRun(prepareJob, 'refs/tags/$REDEPLOY_REF') && includesRun(prepareJob, 'git merge-base --is-ancestor HEAD origin/main'),
  'Manual production redeploys must validate an existing SemVer tag reachable from main.',
)
check(
  stepUses(firebaseJob).some((uses) => uses.startsWith('google-github-actions/auth@')),
  'Firebase deploy must authenticate through Google Workload Identity Federation.',
)
const firebaseRuns = workflowSteps(firebaseJob).map((step) => String(step.run ?? ''))
const normalizationStepIndex = firebaseRuns.findIndex((run) => run.includes('npm run normalize:firestore-data -- --write'))
const auditStepIndex = firebaseRuns.findIndex((run) => run.includes('npm run audit:firestore-data'))
const firebaseDeployStepIndex = firebaseRuns.findIndex((run) => run.includes('firebase-tools deploy --only functions,firestore'))
check(
  normalizationStepIndex >= 0 && auditStepIndex > normalizationStepIndex && firebaseDeployStepIndex > auditStepIndex,
  'Firebase deploy must normalize known legacy fields, audit compatibility and only then deploy restrictive rules.',
)
check(
  workflowSteps(firebaseJob).some((step) => step.if === 'failure()' && String(step.uses ?? '').startsWith('actions/upload-artifact@')),
  'Firebase deploy must upload the data audit report when compatibility validation fails.',
)
check(includesRun(workerJob, 'npm run worker:check'), 'Worker job must validate its bundle before deploy.')
check(includesRun(workerJob, 'wrangler deploy'), 'Worker job must deploy with Wrangler.')
check(includesRun(workerJob, 'NEXO_VERSION'), 'Worker deploy must stamp the package version dynamically.')
check(includesRun(firebaseJob, 'NEXO_VERSION'), 'Functions deploy must stamp the package version dynamically.')
check(includesRun(firebaseJob, 'NEXO_ALLOWED_ORIGINS'), 'Functions deploy must restrict production CORS explicitly.')
check(includesRun(firebaseJob, 'NEXO_ENFORCE_APP_CHECK=false'), 'Functions App Check enforcement must remain explicit during observation.')
check(includesRun(buildPagesJob, 'npm run check:build-output'), 'Pages build must validate the production artifact.')
check(includesRun(buildPagesJob, 'npm run check:release-files'), 'Pages build must validate release files.')
check(stepUses(deployPagesJob).some((uses) => uses.startsWith('actions/deploy-pages@')), 'Production workflow must deploy GitHub Pages.')
check(includesRun(smokeJob, 'E2E_BACKEND_HEALTH_URL'), 'Production smoke must wait for the Functions revision.')
check(includesRun(smokeJob, 'E2E_CATALOG_API_URL'), 'Production smoke must wait for the Worker revision.')
check(includesRun(smokeJob, 'version.json'), 'Production smoke must wait for the Pages revision.')
check(
  includesRun(smokeJob, 'curl --connect-timeout 3 --max-time 8'),
  'Production revision probes must have bounded connection and transfer timeouts.',
)
check(includesRun(smokeJob, 'npm run test:e2e:prod'), 'Production workflow must run the production smoke suite.')
check(includesRun(releaseJob, 'gh release create'), 'A successful production smoke must publish the version tag and release.')
check(
  stepRuns(firebaseJob).some((run) => run.includes('GCP_WORKLOAD_IDENTITY_PROVIDER is required')) &&
    stepRuns(workerJob).some((run) => run.includes('CLOUDFLARE_API_TOKEN is required')),
  'Backend deploy jobs must fail explicitly when credentials are missing.',
)
checkPinnedActions(deployWorkflow, '.github/workflows/deploy-production.yml')

const versionWorkflow = await readYaml('.github/workflows/version-bump.yml')
const versionJob = workflowJob(versionWorkflow, 'sync-pr-version')
const versionRuns = stepRuns(versionJob).join('\n')
check(Boolean(asObject(versionWorkflow.on).pull_request), 'Version workflow must run inside pull requests.')
check(versionRuns.includes('scripts/resolveVersionBump.mjs'), 'Version workflow must resolve the dynamic release target.')
check(versionRuns.includes('steps.resolve.outputs.target'), 'Version workflow must pass the exact resolved target.')
check(versionRuns.includes('VERSION_BUMP_TOKEN'), 'Version workflow must require VERSION_BUMP_TOKEN for PR commits.')
check(versionRuns.includes('--base-version'), 'Version workflow must calculate PR bumps from the main package version.')
check(!versionRuns.includes('public/sw.js'), 'Version workflow must not edit a manually versioned service worker.')
check(!versionRuns.includes('gh pr create') && !versionRuns.includes('gh pr merge'), 'Version workflow must not create or merge a second PR.')
checkPinnedActions(versionWorkflow, '.github/workflows/version-bump.yml')

const dependabot = await readYaml('.github/dependabot.yml')
const dependabotUpdates = asArray(dependabot.updates).map(asObject)
check(
  dependabotUpdates.some((update) => update['package-ecosystem'] === 'npm' && update.directory === '/'),
  'Dependabot must cover root npm dependencies.',
)
check(
  dependabotUpdates.some((update) => update['package-ecosystem'] === 'npm' && update.directory === '/functions'),
  'Dependabot must cover Functions npm dependencies.',
)
check(
  dependabotUpdates.some((update) => update['package-ecosystem'] === 'github-actions'),
  'Dependabot must cover pinned GitHub Actions.',
)

const versionResolver = await readText('scripts/resolveVersionBump.mjs')
check(versionResolver.includes('releaseLabelPattern'), 'Version resolver must parse one dynamic release:x.y.z label.')
check(versionResolver.includes("const legacyLabels = ['patch', 'minor', 'major']"), 'Version resolver must reject legacy bump labels.')
check(!versionResolver.includes('const releaseTarget ='), 'Version resolver must not hardcode a release target.')

const versionBumpScript = await readText('scripts/bumpVersion.mjs')
check(versionBumpScript.includes('Refusing to downgrade'), 'Version bump script must reject downgrades.')
check(!versionBumpScript.includes('const releaseTarget ='), 'Version bump script must not hardcode a release target.')

const seed = await readJson<unknown>('seed/public-catalog.seed.json')
const seedResult = parsePublicCatalogSeed(seed, 'release-check')
check(seedResult.errors.length === 0, `Public catalog seed must validate: ${seedResult.errors[0] ?? ''}`)
check(seedResult.items.length > 0, 'Public catalog seed must contain at least one valid item.')
check(
  seedResult.items.some((item) => item.title === 'Dune' && item.type === 'book') &&
    seedResult.items.some((item) => item.title === 'Dune' && item.type === 'movie'),
  'Public catalog seed must include Dune as book and movie.',
)

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
