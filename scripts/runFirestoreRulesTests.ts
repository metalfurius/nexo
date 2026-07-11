import { spawn } from 'node:child_process'

const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080'
const rulesTestFile = 'src/firebase/firestoreRules.emulator.test.ts'
const vitestCli = 'node_modules/vitest/vitest.mjs'
const firebaseCli = 'node_modules/firebase-tools/lib/bin/firebase.js'

async function main() {
  if (await isFirestoreEmulatorReady(firestoreHost)) {
    console.log(`Using running Firestore emulator at ${firestoreHost}`)
    await run(process.execPath, [vitestCli, 'run', rulesTestFile], {
      ...process.env,
      FIRESTORE_EMULATOR_HOST: firestoreHost,
    })
    return
  }

  console.log('Starting Firestore emulator for rules tests')
  const listenerPort = readPort(firestoreHost)
  const listenersBefore = await getWindowsListenerPids(listenerPort)
  try {
    await run(process.execPath, [firebaseCli, 'emulators:exec', '--only', 'firestore', `${quote(process.execPath)} ${quote(vitestCli)} run ${quote(rulesTestFile)}`], process.env)
  } finally {
    await stopNewWindowsListeners(listenerPort, listenersBefore)
  }
}

async function isFirestoreEmulatorReady(host: string) {
  const url = `http://${host}`

  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) })
    const text = await response.text()
    return response.ok && text.trim() === 'Ok'
  } catch {
    return false
  }
}

function run(executable: string, args: string[], env: NodeJS.ProcessEnv) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(executable, args, {
      env: cleanEnv(env),
      shell: false,
      stdio: 'inherit',
    })

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${executable} ${args.join(' ')} exited with ${code ?? 'unknown status'}`))
      }
    })
  })
}

function cleanEnv(env: NodeJS.ProcessEnv) {
  return Object.fromEntries(Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
}

function quote(value: string) {
  return `"${value.replaceAll('"', '\\"')}"`
}

function readPort(host: string) {
  const port = Number(host.slice(host.lastIndexOf(':') + 1))
  return Number.isInteger(port) && port > 0 ? port : 8080
}

async function getWindowsListenerPids(port: number) {
  if (process.platform !== 'win32') return new Set<number>()
  const output = await capture('netstat.exe', ['-ano', '-p', 'tcp']).catch(() => '')
  const pids = new Set<number>()

  for (const line of output.split(/\r?\n/)) {
    const fields = line.trim().split(/\s+/)
    if (fields[0]?.toUpperCase() !== 'TCP' || fields.length < 5) continue
    if (readEndpointPort(fields[1]) !== port || readEndpointPort(fields[2]) !== 0) continue
    const pid = Number(fields.at(-1))
    if (Number.isInteger(pid) && pid > 0) pids.add(pid)
  }

  return pids
}

async function stopNewWindowsListeners(port: number, listenersBefore: ReadonlySet<number>) {
  if (process.platform !== 'win32') return
  const listenersAfter = await getWindowsListenerPids(port)
  const createdPids = [...listenersAfter].filter((pid) => !listenersBefore.has(pid))

  for (const pid of createdPids) {
    try {
      process.kill(pid, 'SIGTERM')
      console.log(`Stopped orphaned Firestore emulator process ${pid} on port ${port}`)
    } catch (reason) {
      const code = (reason as NodeJS.ErrnoException).code
      if (code !== 'ESRCH') throw reason
    }
  }
}

function readEndpointPort(endpoint: string | undefined) {
  const value = endpoint?.slice(endpoint.lastIndexOf(':') + 1)
  const port = Number(value)
  return Number.isInteger(port) ? port : undefined
}

function capture(executable: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => { stdout += chunk })
    child.stderr.on('data', (chunk: string) => { stderr += chunk })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`${executable} ${args.join(' ')} exited with ${code ?? 'unknown status'}: ${stderr}`))
    })
  })
}

await main()
