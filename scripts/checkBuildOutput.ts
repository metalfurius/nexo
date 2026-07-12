import { access, readFile, readdir, stat } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { brotliCompressSync, gzipSync } from 'node:zlib'

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

function readHtmlAttribute(tag: string, name: string) {
  const match = new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, 'i').exec(tag)
  return match?.[1] ?? match?.[2]
}

function isFirstPartyJavaScript(reference: string) {
  return reference.startsWith('/') && !reference.startsWith('//') && /\.js(?:[?#].*)?$/i.test(reference)
}

function isApplicationChunk(reference: string) {
  return !/-vendor-[^/]+\.js(?:[?#].*)?$/i.test(reference)
}

export function collectInitialApplicationJsReferences(indexHtml: string) {
  const references = new Set<string>()

  for (const match of indexHtml.matchAll(/<script\b[^>]*>/gi)) {
    const reference = readHtmlAttribute(match[0], 'src')
    if (reference && isFirstPartyJavaScript(reference) && isApplicationChunk(reference)) references.add(reference)
  }

  for (const match of indexHtml.matchAll(/<link\b[^>]*>/gi)) {
    const rel = readHtmlAttribute(match[0], 'rel')?.toLowerCase().split(/\s+/) ?? []
    const reference = readHtmlAttribute(match[0], 'href')
    if (rel.includes('modulepreload') && reference && isFirstPartyJavaScript(reference) && isApplicationChunk(reference)) {
      references.add(reference)
    }
  }

  return [...references]
}

export function measureCompressedJavaScript(contents: Uint8Array[]) {
  return contents.reduce(
    (total, content) => ({
      brotliBytes: total.brotliBytes + brotliCompressSync(content).byteLength,
      gzipBytes: total.gzipBytes + gzipSync(content).byteLength,
      rawBytes: total.rawBytes + content.byteLength,
    }),
    { brotliBytes: 0, gzipBytes: 0, rawBytes: 0 },
  )
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
  const initialApplicationReferences = collectInitialApplicationJsReferences(indexHtml)
  const initialApplicationContents = (await Promise.all(initialApplicationReferences.map(async (reference) => {
    const path = toDistPath(reference)
    return (await exists(path)) ? readFile(path) : undefined
  }))).filter((content): content is Buffer => Boolean(content))
  const initialApplicationSizes = measureCompressedJavaScript(initialApplicationContents)

  check(
    initialApplicationSizes.rawBytes < 200 * 1024,
    `Initial first-party application JavaScript (scripts + modulepreloads) must stay below 200 KiB (received ${(initialApplicationSizes.rawBytes / 1024).toFixed(2)} KiB from ${initialApplicationReferences.join(', ') || 'no files'}).`,
  )
  check(
    !/(?:HomeTab|LibraryTab|ImportTab|external-search|library-importers)-[^"']+\.js/.test(indexHtml),
    'The public entry must not preload Home, Library, external-search or importer JavaScript chunks.',
  )
  console.log(
    `Initial application JavaScript: ${(initialApplicationSizes.rawBytes / 1024).toFixed(2)} KiB raw, ` +
      `${(initialApplicationSizes.gzipBytes / 1024).toFixed(2)} KiB gzip, ` +
      `${(initialApplicationSizes.brotliBytes / 1024).toFixed(2)} KiB Brotli.`,
  )
}

async function checkVersionMetadata() {
  const versionPath = join(distDir, 'version.json')
  check(await exists(versionPath), 'dist/version.json must exist.')
  if (!(await exists(versionPath))) return

  try {
    const metadata = JSON.parse(await readText(versionPath)) as { revision?: unknown; version?: unknown }
    const packageJson = JSON.parse(await readText('package.json')) as { version?: unknown }
    check(metadata.version === packageJson.version, 'dist/version.json version must match package.json.')
    check(typeof metadata.revision === 'string' && metadata.revision.trim().length > 0, 'dist/version.json revision must be a non-empty string.')
  } catch {
    check(false, 'dist/version.json must contain valid JSON metadata.')
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
  await checkInitialCssBudget(indexHtml)
  await checkInitialJsBudget(indexHtml)
  await checkVersionMetadata()

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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main()
}
