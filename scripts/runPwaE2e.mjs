import { spawn } from 'node:child_process'
import { preview, build } from 'vite'

const firebase = process.argv.includes('--firebase')
const projectId = 'recomendaciones-78eb7'
const port = firebase ? 4175 : 4174
const baseUrl = `http://127.0.0.1:${port}`

Object.assign(
  process.env,
  firebase
    ? {
        VITE_FIREBASE_API_KEY: 'demo-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
        VITE_FIREBASE_PROJECT_ID: projectId,
        VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.firebasestorage.app`,
        VITE_FIREBASE_MESSAGING_SENDER_ID: '947336888836',
        VITE_FIREBASE_APP_ID: '1:947336888836:web:e2e-pwa',
        VITE_CATALOG_PROXY_URL: `${baseUrl}/catalog-proxy`,
        VITE_PUBLIC_CATALOG_URL: `http://127.0.0.1:5001/${projectId}/us-central1/publicCatalog`,
        VITE_DEMO_MODE: 'false',
        VITE_USE_FIREBASE_EMULATORS: 'true',
      }
    : {
        VITE_CATALOG_PROXY_URL: `${baseUrl}/catalog-proxy`,
        VITE_DEMO_MODE: 'true',
      },
)

await build()
const server = await preview({ preview: { host: '127.0.0.1', port, strictPort: true } })

try {
  const config = firebase ? 'playwright.firebase-pwa.config.ts' : 'playwright.pwa.config.ts'
  const exitCode = await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['node_modules/@playwright/test/cli.js', 'test', '--config', config],
      { env: process.env, stdio: 'inherit' },
    )
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
  process.exitCode = exitCode
} finally {
  server.httpServer.closeAllConnections?.()
  await new Promise((resolve) => server.httpServer.close(resolve))
}
