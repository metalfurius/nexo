import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, normalize, relative, resolve, sep } from 'node:path'

const root = resolve('.')
const monolithCeilings: Record<string, number> = {
  'src/App.tsx': 2274,
  'src/app/shared.tsx': 4683,
  'src/hooks/useLibrary.ts': 1035,
  'src/services/libraryRepository.ts': 920,
}

const layerRules = [
  { source: 'src/lib', forbidden: ['src/app', 'src/hooks', 'src/services', 'src/tabs'] },
  { source: 'src/services', forbidden: ['src/app', 'src/hooks', 'src/tabs'] },
  { source: 'src/hooks', forbidden: ['src/app', 'src/tabs'] },
] as const

const failures: string[] = []

for (const [path, ceiling] of Object.entries(monolithCeilings)) {
  const content = await readFile(resolve(path), 'utf8')
  const lineCount = content.endsWith('\n') ? content.split(/\r?\n/).length - 1 : content.split(/\r?\n/).length
  if (lineCount > ceiling) failures.push(`${path} grew to ${lineCount} lines (ratchet ceiling: ${ceiling}). Split code before adding more.`)
}

for (const rule of layerRules) {
  const sourceRoot = resolve(rule.source)
  for (const file of await sourceFiles(sourceRoot)) {
    const content = await readFile(file, 'utf8')
    for (const specifier of importSpecifiers(content)) {
      if (!specifier.startsWith('.')) continue
      const target = normalize(resolve(dirname(file), specifier))
      const targetPath = toRepoPath(target)
      const forbidden = rule.forbidden.find((prefix) => targetPath === prefix || targetPath.startsWith(`${prefix}/`))
      if (forbidden) failures.push(`${toRepoPath(file)} imports ${targetPath}, crossing ${rule.source} -> ${forbidden}.`)
    }
  }
}

if (failures.length) {
  console.error(`Architecture ratchet failed with ${failures.length} issue(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('Architecture ratchet passed.')
}

async function sourceFiles(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(path, entry.name)
    if (entry.isDirectory()) return sourceFiles(entryPath)
    if (!entry.isFile() || !/\.[cm]?[jt]sx?$/.test(entry.name) || /\.test\.[jt]sx?$/.test(entry.name)) return []
    return [entryPath]
  }))
  return files.flat()
}

function importSpecifiers(content: string) {
  return [...content.matchAll(/(?:from\s+|import\s*\()\s*['"]([^'"]+)['"]/g)].map((match) => match[1])
}

function toRepoPath(path: string) {
  return relative(root, path).split(sep).join('/')
}
