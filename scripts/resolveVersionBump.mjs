import { appendFileSync, readFileSync } from 'node:fs'

const releaseTarget = '1.1.50'
const releaseLabel = `release:${releaseTarget}`
const legacyLabels = ['patch', 'minor', 'major']

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  if (!eventPath) return {}
  return JSON.parse(readFileSync(eventPath, 'utf8'))
}

function writeOutput(name, value) {
  const outputPath = process.env.GITHUB_OUTPUT
  if (outputPath) appendFileSync(outputPath, `${name}=${value}\n`)
}

function fail(message) {
  console.error(message)
  process.exit(1)
}

function resolvePullRequestTarget(pullRequest, required) {
  const labelNames = Array.isArray(pullRequest?.labels)
    ? pullRequest.labels.map((label) => String(label?.name ?? '').trim().toLowerCase())
    : []
  const releaseLabels = labelNames.filter((label) => label.startsWith('release:'))
  const selectedLegacyLabels = legacyLabels.filter((label) => labelNames.includes(label))
  const selectedVersionLabels = [...releaseLabels, ...selectedLegacyLabels]

  if (selectedVersionLabels.length > 1) {
    fail(`Use only ${releaseLabel}. Found conflicting version labels: ${selectedVersionLabels.join(', ')}.`)
  }

  if (selectedLegacyLabels.length) {
    fail(`The ${selectedLegacyLabels[0]} label is not valid for this release. Use only ${releaseLabel}.`)
  }

  if (releaseLabels.length && releaseLabels[0] !== releaseLabel) {
    fail(`Unsupported release target ${releaseLabels[0]}. Use only ${releaseLabel}.`)
  }

  const target = releaseLabels[0] === releaseLabel ? releaseTarget : ''
  if (required && !target) fail(`Add exactly one version label before merging: ${releaseLabel}.`)
  return target
}

const eventName = process.env.GITHUB_EVENT_NAME ?? ''
const required = process.env.VERSION_LABEL_REQUIRED === 'true'
let target = ''

if (eventName === 'workflow_dispatch') {
  target = String(process.env.VERSION_TARGET_INPUT ?? '').trim()
  if (target !== releaseTarget) fail(`Choose the exact release target ${releaseTarget}.`)
} else {
  const event = readEvent()
  const pullRequest = event.pull_request
  const headRef = String(pullRequest?.head?.ref ?? '')
  if (headRef.startsWith('automation/version-bump-')) {
    writeOutput('target', '')
    writeOutput('should_bump', 'false')
    console.log('Skipping release target requirement for automated version bump PR.')
    process.exit(0)
  }

  target = resolvePullRequestTarget(pullRequest, required)

  if (eventName === 'pull_request' && event.action === 'closed' && pullRequest?.merged !== true) {
    target = ''
  }
}

writeOutput('target', target)
writeOutput('should_bump', target ? 'true' : 'false')

if (target) {
  console.log(`Resolved release target: ${target}`)
} else {
  console.log('No release target requested.')
}
