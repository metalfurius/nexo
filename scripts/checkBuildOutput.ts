import { access, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const distDir = 'dist'
const failures: string[] = []

function check(condition: unknown, message: string) {
  if (!condition) failures.push(message)
}

async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function readText(path: string) {
  return readFile(path, 'utf8')
}

function toDistPath(publicPath: string) {
  const cleanPath = publicPath.split('#')[0].split('?')[0].replace(/^\/+/, '')
  return join(distDir, cleanPath || 'index.html')
}

async function checkReferencedFiles(indexHtml: string) {
  const references = new Set<string>()
  for (const match of indexHtml.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const reference = match[1]
    if (!reference.startsWith('/') || reference.startsWith('//')) continue
    references.add(reference)
  }

  for (const reference of references) {
    check(await exists(toDistPath(reference)), `Build output references missing file: ${reference}`)
  }
}

async function main() {
  check(await exists(distDir), 'dist directory must exist. Run npm run build first.')

  const indexPath = join(distDir, 'index.html')
  check(await exists(indexPath), 'dist/index.html must exist.')
  const indexHtml = (await exists(indexPath)) ? await readText(indexPath) : ''

  check(indexHtml.includes('/assets/'), 'dist/index.html should reference /assets/ build files.')
  check(!indexHtml.includes('/nexo/assets/'), 'dist/index.html must not reference /nexo/assets/ on the clean subdomain.')
  check(!indexHtml.includes('http://127.0.0.1'), 'dist/index.html must not contain local dev server URLs.')
  check(!indexHtml.includes('localhost'), 'dist/index.html must not contain localhost URLs.')
  await checkReferencedFiles(indexHtml)

  const assetsDir = join(distDir, 'assets')
  check(await exists(assetsDir), 'dist/assets must exist.')
  const assets = (await exists(assetsDir)) ? await readdir(assetsDir) : []
  check(assets.some((asset) => asset.endsWith('.js')), 'dist/assets must contain at least one JavaScript bundle.')
  check(assets.some((asset) => asset.endsWith('.css')), 'dist/assets must contain at least one CSS bundle.')

  const cname = (await exists(join(distDir, 'CNAME'))) ? (await readText(join(distDir, 'CNAME'))).trim() : ''
  check(cname === 'nexo.codeoverdose.es', 'dist/CNAME must point to nexo.codeoverdose.es.')

  check(await exists(join(distDir, 'manifest.webmanifest')), 'dist/manifest.webmanifest must exist.')
  check(await exists(join(distDir, 'sw.js')), 'dist/sw.js must exist.')
  check(await exists(join(distDir, 'icons', 'nexo.svg')), 'dist/icons/nexo.svg must exist.')

  if (failures.length) {
    console.error(`Build output check failed with ${failures.length} issue(s):`)
    for (const failure of failures) {
      console.error(`- ${failure}`)
    }
    process.exitCode = 1
  } else {
    console.log('Build output looks deployable for nexo.codeoverdose.es.')
  }
}

void main()
