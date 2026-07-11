import { access, readFile, readdir, stat } from 'node:fs/promises'
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

async function checkInitialCssBudget(indexHtml: string) {
  const initialCssReferences = [...indexHtml.matchAll(/\bhref="([^"]+\.css(?:\?[^"]*)?)"/g)]
    .map((match) => match[1])
    .filter((reference) => reference.startsWith('/') && !reference.startsWith('//'))
  const initialCssBytes = (await Promise.all(initialCssReferences.map(async (reference) => {
    const path = toDistPath(reference)
    return (await exists(path)) ? (await stat(path)).size : 0
  }))).reduce((total, size) => total + size, 0)

  check(
    initialCssBytes < 200 * 1024,
    `Initial first-party CSS must stay below 200 KiB (received ${(initialCssBytes / 1024).toFixed(2)} KiB).`,
  )
}

async function checkInitialJsBudget(indexHtml: string) {
  const entryScriptReferences = [...indexHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js(?:\?[^"]*)?)"[^>]*>/g)]
    .map((match) => match[1])
    .filter((reference) => reference.startsWith('/') && !reference.startsWith('//') && !reference.includes('-vendor-'))
  const entryScriptBytes = (await Promise.all(entryScriptReferences.map(async (reference) => {
    const path = toDistPath(reference)
    return (await exists(path)) ? (await stat(path)).size : 0
  }))).reduce((total, size) => total + size, 0)

  check(
    entryScriptBytes < 200 * 1024,
    `Initial first-party JavaScript entry must stay below 200 KiB (received ${(entryScriptBytes / 1024).toFixed(2)} KiB).`,
  )
  check(
    !/(?:HomeTab|LibraryTab|ImportTab|library-importers)-[^"']+\.js/.test(indexHtml),
    'The public entry must not preload Home, Library or importer JavaScript chunks.',
  )
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
  await checkInitialCssBudget(indexHtml)
  await checkInitialJsBudget(indexHtml)

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
