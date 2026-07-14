import { defineConfig, devices } from '@playwright/test'

const projectId = 'recomendaciones-78eb7'
const baseURL = 'http://127.0.0.1:5175'
const publicCatalogUrl = `http://127.0.0.1:5001/${projectId}/us-central1/publicCatalog`

export default defineConfig({
  testDir: './e2e/firebase',
  testIgnore: /offline-pwa\.spec\.ts/,
  timeout: 35_000,
  expect: {
    timeout: 8_000,
  },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 5175',
    env: {
      VITE_FIREBASE_API_KEY: 'demo-api-key',
      VITE_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
      VITE_FIREBASE_PROJECT_ID: projectId,
      VITE_FIREBASE_STORAGE_BUCKET: `${projectId}.firebasestorage.app`,
      VITE_FIREBASE_MESSAGING_SENDER_ID: '947336888836',
      VITE_FIREBASE_APP_ID: '1:947336888836:web:e2e',
      VITE_CATALOG_API_URL: 'http://127.0.0.1:5175/catalog-proxy',
      VITE_CATALOG_PROXY_URL: 'http://127.0.0.1:5175/catalog-proxy',
      VITE_PUBLIC_CATALOG_URL: publicCatalogUrl,
      VITE_DEMO_MODE: 'false',
      VITE_USE_FIREBASE_EMULATORS: 'true',
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
