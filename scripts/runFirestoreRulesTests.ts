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
  await run(process.execPath, [firebaseCli, 'emulators:exec', '--only', 'firestore', `${quote(process.execPath)} ${quote(vitestCli)} run ${quote(rulesTestFile)}`], process.env)
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

await main()
