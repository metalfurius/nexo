import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4175'

export default defineConfig({
  testDir: './e2e/firebase',
  testMatch: /offline-pwa\.spec\.ts/,
  timeout: 75_000,
  expect: {
    timeout: 12_000,
  },
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-firebase-pwa',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
