import { readFileSync } from 'node:fs'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const packageJson = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version?: string }
const appVersion = packageJson.version ?? '0.0.0'
const buildRevision = (process.env.VITE_BUILD_SHA ?? process.env.GITHUB_SHA ?? 'local').trim() || 'local'

function versionMetadataPlugin(): Plugin {
  return {
    name: 'nexo-version-metadata',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify({ revision: buildRevision, version: appVersion })}\n`,
      })
    },
  }
}

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
          if (id.includes('node_modules/lucide-react')) return 'ui-vendor'
        },
      },
    },
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    versionMetadataPlugin(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      injectRegister: null,
      manifest: false,
      injectManifest: {
        globPatterns: ['**/*.{css,html,ico,js,png,svg,webmanifest}'],
        rollupFormat: 'iife',
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
})
