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
  const byKey = new Map<string, ListItem>()
  const notes = files.flatMap((file) => file.notes)

  for (const file of files) {
    for (const item of file.items) {
      const key = `${item.type}:${normalizeKey(item.title)}`
      const existing = byKey.get(key)
      if (!existing) {
        byKey.set(key, item)
        continue
      }

      const status =
        STATUS_PRIORITY[item.status] > STATUS_PRIORITY[existing.status]
          ? item.status
          : existing.status

      byKey.set(key, {
        ...existing,
        status,
        rating: item.rating ?? existing.rating,
        durationMinHours: existing.durationMinHours ?? item.durationMinHours,
        durationMaxHours: existing.durationMaxHours ?? item.durationMaxHours,
        progress: existing.progress ?? item.progress,
        genres: uniqueValues([...existing.genres, ...item.genres]),
        tags: uniqueValues([...existing.tags, ...item.tags]),
        moodTags: uniqueValues([...existing.moodTags, ...item.moodTags]),
        notes: uniqueValues([existing.notes, item.notes]).join(' | ') || undefined,
        rawText: uniqueValues([existing.rawText, item.rawText]).join('\n'),
        importNotes: uniqueValues([
          ...(existing.importNotes ?? []),
          ...(item.importNotes ?? []),
          `Duplicado fusionado desde ${file.fileName}`,
        ]),
        updatedAt: nowIso(),
      })
    }
  }

  return {
    items: [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title, 'es')),
    notes,
  }
}

function parseCurrentLine(line: string, section: SectionContext) {
  const ignored = ['en progreso', '-']
  if (ignored.includes(normalizeKey(line))) return undefined
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
  if (first === 'd6' || first === 'd20' || first === 'd100' || normalizeKey(titleCell) === 'categoria') {
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
  const note = extractNote(rawText)
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

  const tags = uniqueValues([
    section.title,
    typeToSpanish(type),
    ...extractTags(rawText, section.title),
  ]).filter((tag) => normalizeKey(tag) !== normalizeKey(title))

  return {
    id: `${slugify(type)}-${slugify(title || rawText)}`.slice(0, 120),
    title: title || rawText,
    type,
    status,
    rating,
    durationMinHours: duration?.min,
    durationMaxHours: duration?.max,
    progress: status === 'in_progress' ? 'En progreso' : undefined,
    genres: inferGenres(rawText, section.title),
    tags,
    moodTags: inferMoodTags(rawText, section.title),
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
    .replace(/(?:⭐|★)?\s*\d+(?:[,.]\d+)?\s*\/\s*10/gu, '')
    .replace(/Droppeado\s*/iu, '')
    .replace(/\([^)]*(Pel[ií]cula|Serie|Anime|Libro|Juego|Manga|Manhwa)[^)]*\)/giu, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+(?:[,.]\d+)?\s*[-–]\s*\d+(?:[,.]\d+)?\s*(?:horas|h)\.?/giu, '')
    .replace(/<\s*\d+(?:[,.]\d+)?\s*(?:horas|h)\.?/giu, '')
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
  if (normalized.includes('pelicula')) return 'movie'
  if (normalized.includes('serie')) return 'series'
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

function extractTags(value: string, sectionTitle: string) {
  return uniqueValues([...inferGenres(value, sectionTitle), ...inferMoodTags(value, sectionTitle)])
}

function typeToSpanish(type: ItemType) {
  const labels: Record<ItemType, string> = {
    game: 'juego',
    book: 'libro',
    movie: 'pelicula',
    series: 'serie',
    anime: 'anime',
    manga: 'manga',
    manhwa: 'manhwa',
    comic: 'comic',
    other: 'otro',
  }
  return labels[type]
}
