import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string }
const appVersion = packageJson.version ?? '0.0.0'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) return 'react-vendor'
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) return 'firebase-vendor'
          if (id.includes('node_modules/fflate') || id.includes('node_modules/papaparse')) return 'import-vendor'
          if (id.includes('/src/services/libraryImporters')) return 'library-importers'
          if (id.includes('/src/services/externalSearch') || id.includes('/src/services/externalSearchCache')) return 'external-search'
          if (id.includes('node_modules/lucide-react')) return 'ui-vendor'
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [react()],
})
