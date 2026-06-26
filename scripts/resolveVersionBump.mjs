import { readFileSync, appendFileSync } from 'node:fs'

const allowedBumps = ['patch', 'minor', 'major']

function normalizeBump(value) {
  const bump = String(value ?? '').trim().toLowerCase()
  return allowedBumps.includes(bump) ? bump : ''
}

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

const eventName = process.env.GITHUB_EVENT_NAME ?? ''
const required = process.env.VERSION_LABEL_REQUIRED === 'true'
let bump = ''

if (eventName === 'workflow_dispatch') {
  bump = normalizeBump(process.env.VERSION_BUMP_INPUT)
  if (!bump) fail('Choose one version bump: patch, minor or major.')
} else {
  const event = readEvent()
  const pullRequest = event.pull_request
  const labelNames = Array.isArray(pullRequest?.labels)
    ? pullRequest.labels.map((label) => String(label?.name ?? '').trim().toLowerCase())
    : []
  const matchingLabels = allowedBumps.filter((candidate) => labelNames.includes(candidate))

  if (matchingLabels.length > 1) {
    fail(`Use only one version label. Found: ${matchingLabels.join(', ')}.`)
  }

  bump = matchingLabels[0] ?? ''
  if (required && !bump) fail('Add exactly one version label before merging: patch, minor or major.')

  if (eventName === 'pull_request' && event.action === 'closed' && pullRequest?.merged !== true) {
    bump = ''
  }
}

writeOutput('bump', bump)
writeOutput('should_bump', bump ? 'true' : 'false')

if (bump) {
  console.log(`Resolved version bump: ${bump}`)
} else {
  console.log('No version bump requested.')
}
