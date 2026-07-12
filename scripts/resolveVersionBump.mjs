import { appendFileSync, readFileSync } from 'node:fs'

const legacyLabels = ['patch', 'minor', 'major']
const plainSemverPattern = '(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)'
const releaseLabelPattern = new RegExp(`^release:(${plainSemverPattern})$`)

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

function parseReleaseLabel(label) {
  return releaseLabelPattern.exec(label)?.[1] ?? ''
}

function resolvePullRequestTarget(pullRequest, required) {
  const labelNames = Array.isArray(pullRequest?.labels)
    ? pullRequest.labels.map((label) => String(label?.name ?? '').trim().toLowerCase())
    : []
  const releaseLabels = labelNames.filter((label) => label.startsWith('release:'))
  const selectedLegacyLabels = legacyLabels.filter((label) => labelNames.includes(label))
  const selectedVersionLabels = [...releaseLabels, ...selectedLegacyLabels]

  if (selectedVersionLabels.length > 1) {
    fail(`Use exactly one release:x.y.z label. Found conflicting version labels: ${selectedVersionLabels.join(', ')}.`)
  }

  if (selectedLegacyLabels.length) {
    fail(`The ${selectedLegacyLabels[0]} label is not valid. Use one release:x.y.z label.`)
  }

  const target = releaseLabels.length ? parseReleaseLabel(releaseLabels[0]) : ''
  if (releaseLabels.length && !target) {
    fail(`Unsupported release label ${releaseLabels[0]}. Use release:x.y.z with plain semantic version numbers.`)
  }

  if (required && !target) fail('Add exactly one version label before merging: release:x.y.z.')
  return target
}

const eventName = process.env.GITHUB_EVENT_NAME ?? ''
const required = process.env.VERSION_LABEL_REQUIRED === 'true'
let target = ''

if (eventName === 'workflow_dispatch') {
  target = String(process.env.VERSION_TARGET_INPUT ?? '').trim()
  if (!new RegExp(`^${plainSemverPattern}$`).test(target)) fail('Choose a plain semantic version target x.y.z.')
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
