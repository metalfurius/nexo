import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/scripts/releaseTools.test.mjs'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: 'coverage',
      include: [
        'functions/src/catalogValidation.ts',
        'src/hooks/**/*.ts',
        'src/lib/**/*.ts',
        'src/services/**/*.ts',
      ],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/services/firebaseAnalytics.ts',
        'src/services/firebaseApp.ts',
        'src/services/firebaseAppCheck.ts',
        'src/services/firebaseConfig.ts',
        'src/services/firebaseFunctions.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        'src/lib/{roadmap,libraryBackup,catalog}.ts': {
          lines: 85,
          functions: 85,
          branches: 80,
        },
      },
    },
  },
})
