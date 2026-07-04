import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e/production',
  timeout: 45_000,
  expect: {
    timeout: 12_000,
  },
  use: {
    baseURL: process.env.E2E_PROD_BASE_URL || 'https://nexo.codeoverdose.es',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
