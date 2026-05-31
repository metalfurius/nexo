import {
  DEFAULT_WEIGHTS,
  type ItemStatus,
  type ItemType,
  type ListItem,
  nowIso,
} from '../domain/types'
import { normalizeKey, slugify, uniqueValues } from './strings'

export interface ParsedMarkdownFile {
  fileName: string
  items: ListItem[]
  notes: string[]
}

interface SectionContext {
  title: string
  normalized: string
  status: ItemStatus
  type?: ItemType
}

const STATUS_PRIORITY: Record<ItemStatus, number> = {
  wishlist: 1,
  paused: 2,
  in_progress: 3,
  completed: 4,
  dropped: 5,
}

export function parseMarkdownFile(fileName: string, content: string): ParsedMarkdownFile {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const notes: string[] = []
  const items: ListItem[] = []
  let section: SectionContext = {
    title: 'Sin seccion',
    normalized: 'sin seccion',
    status: inferStatusFromSection(''),
    type: inferTypeFromFile(fileName),
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue

    const heading = line.match(/^#{2,}\s+(.+)$/)
    if (heading) {
      section = {
        title: cleanInlineText(heading[1]),
        normalized: normalizeKey(cleanInlineText(heading[1])),
        status: inferStatusFromSection(heading[1]),
        type: inferTypeFromSection(heading[1]) ?? inferTypeFromFile(fileName),
      }
      continue
    }

    if (isIgnoredContentLine(line) || isIgnoredSection(section)) continue

    if (section.normalized.includes('estado actual')) {
      const inProgress = parseCurrentLine(line, section)
      if (inProgress) items.push(inProgress)
      continue
    }

    const tableItem = parseTableLine(line, section)
    if (tableItem) {
      items.push(tableItem)
      continue
    }

    const listItem = parseListLine(line, section)
    if (listItem) {
      items.push(listItem)
      continue
    }

    if (line.startsWith('>') || line.startsWith('|') || line.startsWith('---')) continue
    notes.push(`No importado en ${fileName}: ${line}`)
  }

  return {
    fileName,
    items,
    notes,
  }
}

export function mergeParsedItems(files: ParsedMarkdownFile[]) {
  const byPrimaryKey = new Map<string, ListItem>()
  const aliasToPrimaryKey = new Map<string, string>()
  const notes = files.flatMap((file) => file.notes)

  for (const file of files) {
    for (const item of file.items) {
      const lookupKeys = canonicalLookupKeys(item)
      const primaryKey = lookupKeys
        .map((key) => aliasToPrimaryKey.get(key))
        .find((key): key is string => Boolean(key))

      if (!primaryKey) {
        const newPrimaryKey = lookupKeys[0]
        byPrimaryKey.set(newPrimaryKey, item)
        for (const alias of canonicalAliasKeys(item)) {
          aliasToPrimaryKey.set(alias, newPrimaryKey)
        }
        continue
      }

      const existing = byPrimaryKey.get(primaryKey)
      if (!existing) continue

      const merged = mergeItems(existing, item, file.fileName)
      byPrimaryKey.set(primaryKey, merged)
      for (const alias of canonicalAliasKeys(merged)) {
        aliasToPrimaryKey.set(alias, primaryKey)
      }
      for (const alias of canonicalAliasKeys(item)) {
        aliasToPrimaryKey.set(alias, primaryKey)
      }
    }
  }

  return {
    items: [...byPrimaryKey.values()].sort((a, b) => a.title.localeCompare(b.title, 'es')),
    notes,
  }
}

function mergeItems(existing: ListItem, item: ListItem, fileName: string): ListItem {
  const type = chooseType(existing, item)
  const status =
    STATUS_PRIORITY[item.status] > STATUS_PRIORITY[existing.status]
      ? item.status
      : existing.status
  const genres = uniqueValues([...existing.genres, ...item.genres])
  const moodTags = uniqueValues([...existing.moodTags, ...item.moodTags])
  const title = chooseTitle(existing, item)

  return {
    ...existing,
    id: `${slugify(type)}-${slugify(title)}`.slice(0, 120),
    title,
    type,
    status,
    rating: item.rating ?? existing.rating,
    durationMinHours: existing.durationMinHours ?? item.durationMinHours,
    durationMaxHours: existing.durationMaxHours ?? item.durationMaxHours,
    progress: status === 'in_progress' ? 'En progreso' : existing.progress ?? item.progress,
    genres,
    tags: cleanTags([...existing.tags, ...item.tags, ...genres, ...moodTags], title),
    moodTags,
    notes: uniqueValues([existing.notes, item.notes]).join(' | ') || undefined,
    rawText: uniqueValues([existing.rawText, item.rawText]).join('\n'),
    importNotes: uniqueValues([
      ...(existing.importNotes ?? []),
      ...(item.importNotes ?? []),
      `Duplicado fusionado desde ${fileName}`,
    ]),
    updatedAt: nowIso(),
  }
}

function chooseType(existing: ListItem, item: ListItem) {
  if (existing.type === 'other' && item.type !== 'other') return item.type
  return existing.type
}

function chooseTitle(existing: ListItem, item: ListItem) {
  const existingScore = titleQualityScore(existing)
  const itemScore = titleQualityScore(item)
  return itemScore > existingScore ? item.title : existing.title
}

function titleQualityScore(item: ListItem) {
  const normalized = normalizeKey(item.title)
  let score = item.title.length
  if (item.type !== 'other') score += 50
  if (!normalized.includes('retomar cuando')) score += 10
  if (item.title.includes(' - ') || item.title.includes(' – ')) score += item.type === 'book' ? 20 : 4
  return score
}

function canonicalLookupKeys(item: ListItem) {
  if (item.type === 'other') {
    return canonicalTitleAliases(item.title).map((title) => `any:${title}`)
  }

  return canonicalTitleAliases(item.title).map((title) => `${item.type}:${title}`)
}

function canonicalAliasKeys(item: ListItem) {
  const titleAliases = canonicalTitleAliases(item.title)
  if (item.type === 'other') {
    return titleAliases.map((title) => `any:${title}`)
  }

  return uniqueValues([
    ...titleAliases.map((title) => `${item.type}:${title}`),
    ...titleAliases.map((title) => `any:${title}`),
  ])
}

function canonicalTitleAliases(title: string) {
  return uniqueValues([
    normalizeKey(title),
    normalizeBookBaseTitle(title),
    normalizeEditionBaseTitle(title),
  ])
}

function normalizeBookBaseTitle(title: string) {
  return normalizeKey(title.replace(/\s+[-–]\s+.+$/u, ''))
}

function normalizeEditionBaseTitle(title: string) {
  return normalizeKey(
    title
      .replace(/\s+[-–]\s+the final cut$/iu, '')
      .replace(/\s+director'?s cut$/iu, '')
      .replace(/\s+special edition$/iu, '')
      .replace(/\s+remake intergrade$/iu, ' remake')
      .replace(/\s*\((?:director'?s cut|dmc1)\)\s*$/iu, ''),
  )
}

function isIgnoredContentLine(line: string) {
  const normalized = normalizeKey(line)
  return normalized === '' || normalized === '-' || /^-+$/.test(line)
}

function isIgnoredSection(section: SectionContext) {
  return (
    section.normalized.includes('que categoria') ||
    section.normalized.includes('no te convence') ||
    section.normalized.includes('tiradas especiales') ||
    section.normalized.includes('retomar algo pausado')
  )
}

function isTableHeaderCell(value: string) {
  return ['accion', 'categoria', 'juego', 'libro', 'resultado', 'titulo'].includes(normalizeKey(value))
}

function cleanTags(tags: string[], title: string) {
  const titleKey = normalizeKey(title)
  const blocked = new Set([
    'anime',
    'comic',
    'juego',
    'libro',
    'manga',
    'manhwa',
    'otro',
    'pelicula',
    'serie',
  ])

  return uniqueValues(tags).filter((tag) => {
    const key = normalizeKey(tag)
    if (!key || key === titleKey || blocked.has(key)) return false
    return ![
      'categoria',
      'droppeado',
      'duracion media',
      'estado actual',
      'maestra',
      'no recomendar',
      'proximo',
      'retomar',
      'tabla',
      'tira',
      'ya jugado',
      'ya leido',
      'ya visto',
    ].some((noise) => key.includes(noise))
  })
}

function parseCurrentLine(line: string, section: SectionContext) {
  const normalized = normalizeKey(line)
  if (normalized === '-' || normalized.startsWith('en progreso')) return undefined
  const text = line.replace(/^[-*]\s+/, '').trim()
  if (!text || text.startsWith('>')) return undefined
  return createItem(text, { ...section, status: 'in_progress' })
}

function parseListLine(line: string, section: SectionContext) {
  const match = line.match(/^\d+[.)]\s+(.+)$/)
  if (!match) return undefined
  return createItem(match[1], section)
}

function parseTableLine(line: string, section: SectionContext) {
  if (!line.startsWith('|') || /^(\|\s*-+\s*)+\|?$/.test(line)) return undefined
  const cells = line
    .split('|')
    .map((cell) => cleanInlineText(cell))
    .filter(Boolean)

  if (cells.length < 2) return undefined
  const first = normalizeKey(cells[0])
  const titleCell = cells[1]
  if (first === 'd6' || first === 'd20' || first === 'd100' || isTableHeaderCell(titleCell)) {
    return undefined
  }
  if (normalizeKey(titleCell).includes('critico')) return undefined

  const type = inferTypeFromCell(cells[2]) ?? section.type
  return createItem(titleCell, { ...section, type })
}

function createItem(rawValue: string, section: SectionContext): ListItem | undefined {
  const rawText = cleanInlineText(rawValue)
  const rating = extractRating(rawText)
  const duration = extractDuration(rawText)
  const note = extractNote(rawValue)
  const type = inferTypeFromLine(rawText) ?? section.type ?? 'other'
  const status = inferStatusFromLine(rawText) ?? section.status
  const title = extractTitle(rawText, type)
  const importNotes: string[] = []

  if (!title || normalizeKey(title).length < 2) {
    importNotes.push('No se pudo extraer titulo con confianza')
  }

  if (type === 'other') {
    importNotes.push('Tipo inferido como other')
  }

  const genres = inferGenres(rawText, section.title)
  const moodTags = inferMoodTags(rawText, section.title)
  const tags = cleanTags([...genres, ...moodTags], title)

  return {
    id: `${slugify(type)}-${slugify(title || rawText)}`.slice(0, 120),
    title: title || rawText,
    type,
    status,
    rating,
    durationMinHours: duration?.min,
    durationMaxHours: duration?.max,
    progress: status === 'in_progress' ? 'En progreso' : undefined,
    genres,
    tags,
    moodTags,
    weights: DEFAULT_WEIGHTS,
    notes: note,
    source: 'markdown',
    rawText,
    importNotes: importNotes.length ? importNotes : undefined,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

function cleanInlineText(value: string) {
  return value
    .replace(/\[\[|\]\]/g, '')
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function extractTitle(value: string, type: ItemType) {
  let title = value
    .replace(/\s*\d+(?:[,.]\d+)?\s*\/\s*10/gu, '')
    .replace(/[⭐★]/gu, '')
    .replace(/Droppeado\s*/iu, '')
    .replace(/\([^)]*(Pel[ií]cula|Serie|Anime|Libro|Juego|Manga|Manhwa)[^)]*\)/giu, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+(?:[,.]\d+)?\s*[-–]\s*\d+(?:[,.]\d+)?\s*(?:horas|h)\.?/giu, '')
    .replace(/<\s*\d+(?:[,.]\d+)?\s*(?:horas|h)\.?/giu, '')
    .replace(/\s*:?\s*Retomar cuando.*$/iu, '')
    .replace(/\s+-\s*$/, '')
    .trim()

  const durationColon = title.match(/^(.+?):\s*(?:<|\d)/)
  if (durationColon) title = durationColon[1].trim()

  if (type === 'book' && title.includes(' - ')) {
    const parts = title.split(' - ')
    title = `${parts[0].trim()} - ${parts.slice(1).join(' - ').trim()}`
  }

  return title.replace(/[.:]\s*$/, '').trim()
}

function extractRating(value: string) {
  const match = value.match(/(?:⭐|★)?\s*(\d+(?:[,.]\d+)?)\s*\/\s*10/u)
  return match ? Number(match[1].replace(',', '.')) : undefined
}

function extractDuration(value: string) {
  const range = value.match(/(\d+(?:[,.]\d+)?)\s*[-–]\s*(\d+(?:[,.]\d+)?)\s*(?:horas|h)/iu)
  if (range) {
    return {
      min: Number(range[1].replace(',', '.')),
      max: Number(range[2].replace(',', '.')),
    }
  }
  const under = value.match(/<\s*(\d+(?:[,.]\d+)?)\s*(?:horas|h)/iu)
  if (under) {
    return {
      min: 0,
      max: Number(under[1].replace(',', '.')),
    }
  }
  return undefined
}

function extractNote(value: string) {
  const backtick = value.match(/`([^`]+)`/)
  const parenthetical = value.match(/\(([^)]{8,})\)/)
  const note = parenthetical?.[1] ?? backtick?.[1]
  if (!note || /\d+(?:[,.]\d+)?\s*\/\s*10/.test(note)) return undefined
  return cleanInlineText(note)
}

function inferStatusFromSection(value: string): ItemStatus {
  const normalized = normalizeKey(value)
  if (normalized.includes('droppead') || normalized.includes('no recomendar')) return 'dropped'
  if (normalized.includes('pausado') || normalized.includes('retomar')) return 'paused'
  if (normalized.includes('ya visto') || normalized.includes('ya leido') || normalized.includes('ya jugado')) {
    return 'completed'
  }
  if (normalized.includes('estado actual') || normalized.includes('en progreso')) return 'in_progress'
  return 'wishlist'
}

function inferStatusFromLine(value: string): ItemStatus | undefined {
  const normalized = normalizeKey(value)
  if (normalized.includes('droppeado')) return 'dropped'
  if (normalized.includes('retomar cuando')) return 'paused'
  return undefined
}

function inferTypeFromFile(fileName: string): ItemType | undefined {
  const normalized = normalizeKey(fileName)
  if (normalized.includes('juegos')) return 'game'
  if (normalized.includes('libros')) return 'book'
  if (normalized.includes('ver')) return 'movie'
  return undefined
}

function inferTypeFromSection(value: string): ItemType | undefined {
  const normalized = normalizeKey(value)
  if (normalized.includes('juego')) return 'game'
  if (normalized.includes('libro')) return 'book'
  if (normalized.includes('serie')) return 'series'
  if (normalized.includes('anime')) return 'anime'
  if (normalized.includes('pelicula')) return 'movie'
  return undefined
}

function inferTypeFromCell(value?: string): ItemType | undefined {
  if (!value) return undefined
  return inferTypeFromLine(value) ?? inferTypeFromSection(value)
}

function inferTypeFromLine(value: string): ItemType | undefined {
  const normalized = normalizeKey(value)
  if (normalized.includes('anime pelicula')) return 'anime'
  if (
    [
      'banished court magician',
      'chainsaw man',
      'gachiakuta',
      'isekai',
      'jujutsu kaisen',
      'nageki no bourei',
      'one punch man',
    ].some((hint) => normalized.includes(hint))
  ) {
    return 'anime'
  }
  if (normalized.includes('pelicula')) return 'movie'
  if (normalized.includes('serie')) return 'series'
  if (normalized.includes('temporada') || /\bs\d+\b/u.test(normalized)) return 'series'
  if (normalized.includes('anime')) return 'anime'
  if (normalized.includes('manga')) return 'manga'
  if (normalized.includes('manhwa')) return 'manhwa'
  if (normalized.includes('comic')) return 'comic'
  return undefined
}

function inferGenres(value: string, sectionTitle: string) {
  const normalized = normalizeKey(`${value} ${sectionTitle}`)
  const genres: string[] = []
  const checks: Array<[string, string]> = [
    ['sci fi', 'sci-fi'],
    ['ciencia ficcion', 'sci-fi'],
    ['fantasia', 'fantasia'],
    ['filosofia', 'filosofia'],
    ['tecnico', 'tecnico'],
    ['distopia', 'distopia'],
    ['puzzle', 'puzzles'],
    ['rpg', 'rpg'],
    ['jrpg', 'jrpg'],
    ['accion', 'accion'],
    ['misterio', 'misterio'],
    ['thriller', 'thriller'],
    ['epica', 'epica'],
  ]
  for (const [needle, genre] of checks) {
    if (normalized.includes(needle)) genres.push(genre)
  }
  return uniqueValues(genres)
}

function inferMoodTags(value: string, sectionTitle: string) {
  const normalized = normalizeKey(`${value} ${sectionTitle}`)
  const tags: string[] = []
  if (normalized.includes('rapido') || normalized.includes('cortas') || normalized.includes('< 15')) tags.push('rapido')
  if (normalized.includes('facil') || normalized.includes('accesible') || normalized.includes('ligera')) tags.push('ligero')
  if (normalized.includes('denso') || normalized.includes('reto')) tags.push('denso')
  if (normalized.includes('maratonear')) tags.push('maraton')
  if (normalized.includes('caotica') || normalized.includes('frenetica')) tags.push('intenso')
  if (normalized.includes('emocion')) tags.push('emocional')
  if (normalized.includes('unica') || normalized.includes('raro')) tags.push('raro')
  return uniqueValues(tags)
}
