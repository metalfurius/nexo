import type { ExternalCandidate } from '../domain/types'
import { nowIso } from '../domain/types'

export interface ExternalSourceCredit {
  detail: string
  id: ExternalCandidate['source']
  label: string
  requiresKey: boolean
  url: string
}

export const externalSourceCredits: ExternalSourceCredit[] = [
  {
    detail: 'Peliculas, series, posters y fechas a traves del proxy privado de catalogo.',
    id: 'tmdb',
    label: 'TMDB',
    requiresKey: true,
    url: 'https://www.themoviedb.org/',
  },
  {
    detail: 'Juegos, portadas, generos y fechas a traves del proxy privado de catalogo.',
    id: 'rawg',
    label: 'RAWG',
    requiresKey: true,
    url: 'https://rawg.io/',
  },
  {
    detail: 'Libros, autores y portadas publicas sin clave de API.',
    id: 'openLibrary',
    label: 'Open Library',
    requiresKey: false,
    url: 'https://openlibrary.org/',
  },
  {
    detail: 'Anime, manga y manhwa con generos y portadas sin clave de API.',
    id: 'anilist',
    label: 'AniList',
    requiresKey: false,
    url: 'https://anilist.co/',
  },
  {
    detail: 'Fallback abierto para juegos y obras dificiles de encontrar.',
    id: 'wikidata',
    label: 'Wikidata',
    requiresKey: false,
    url: 'https://www.wikidata.org/',
  },
]

export async function searchExternalSources(searchQuery: string, type: string): Promise<ExternalCandidate[]> {
  const query = searchQuery.trim()
  if (query.length < 2) return []

  const groups = await Promise.allSettled(getSearchTasks(query, type))
  return uniqueExternalCandidates(groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))).slice(0, 24)
}

function getSearchTasks(query: string, type: string): Array<Promise<ExternalCandidate[]>> {
  if (type === 'book') return [searchOpenLibrary(query)]
  if (type === 'game') return [searchCatalogProxy(query, type), searchWikidataGames(query)]
  if (type === 'anime' || type === 'manga' || type === 'manhwa') return [searchAniList(query, type)]
  if (type === 'watch') return [searchCatalogProxy(query, type)]
  if (type === 'any') {
    return [
      searchCatalogProxy(query, type),
      searchOpenLibrary(query),
      searchAniList(query, 'anime'),
      searchAniList(query, 'manga'),
      searchWikidataGames(query),
    ]
  }
  return []
}

async function searchCatalogProxy(query: string, type: string): Promise<ExternalCandidate[]> {
  const proxyUrl = String(import.meta.env.VITE_CATALOG_PROXY_URL ?? '').trim()
  if (!proxyUrl) return []

  const baseUrl = proxyUrl.endsWith('/') ? proxyUrl : `${proxyUrl}/`
  const url = new URL('search', baseUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('type', type)

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return []

  const payload = (await response.json()) as { results?: unknown }
  if (!Array.isArray(payload.results)) return []
  return payload.results.flatMap(normalizeProxyCandidate)
}

async function searchOpenLibrary(query: string): Promise<ExternalCandidate[]> {
  const url = new URL('https://openlibrary.org/search.json')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,subject')

  const response = await fetch(url)
  if (!response.ok) return []
  const payload = (await response.json()) as { docs?: Array<Record<string, unknown>> }

  return (payload.docs ?? []).map((entry) => {
    const authors = Array.isArray(entry.author_name) ? entry.author_name.map(String).slice(0, 2) : []
    const title = [String(entry.title ?? 'Sin titulo'), authors.join(', ')].filter(Boolean).join(' - ')
    return {
      id: `open-library-${String(entry.key).replace(/\//g, '-')}`,
      title,
      type: 'book',
      source: 'openLibrary',
      sourceId: String(entry.key),
      posterUrl: entry.cover_i ? `https://covers.openlibrary.org/b/id/${entry.cover_i}-M.jpg` : undefined,
      releaseYear: typeof entry.first_publish_year === 'number' ? entry.first_publish_year : undefined,
      genres: Array.isArray(entry.subject) ? entry.subject.map(String).slice(0, 5) : [],
      externalRefs: {
        openLibraryKey: String(entry.key),
        sourceUrl: `https://openlibrary.org${entry.key}`,
      },
      createdAt: nowIso(),
    } satisfies ExternalCandidate
  })
}

async function searchWikidataGames(query: string): Promise<ExternalCandidate[]> {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbsearchentities')
  url.searchParams.set('search', query)
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('limit', '8')

  const response = await fetch(url)
  if (!response.ok) return []
  const payload = (await response.json()) as { search?: Array<Record<string, unknown>> }

  return (payload.search ?? [])
    .filter((entry) => /video game|videogame/i.test(String(entry.description ?? '')))
    .map((entry) => {
      const id = String(entry.id)
      const description = optionalString(entry.description)
      return {
        id: `wikidata-${id}`,
        title: String(entry.label ?? 'Sin titulo'),
        type: 'game',
        source: 'wikidata',
        sourceId: id,
        overview: description,
        releaseYear: parseFirstYear(description),
        genres: ['video game'],
        externalRefs: {
          wikidataId: id,
          sourceUrl: `https://www.wikidata.org/wiki/${id}`,
        },
        createdAt: nowIso(),
      } satisfies ExternalCandidate
    })
}

async function searchAniList(
  query: string,
  requestedType: 'anime' | 'manga' | 'manhwa',
): Promise<ExternalCandidate[]> {
  const graphql = {
    query: `
      query SearchMedia($search: String, $type: MediaType) {
        Page(page: 1, perPage: 8) {
          media(search: $search, type: $type) {
            id
            title { romaji english native }
            description(asHtml: false)
            format
            genres
            startDate { year }
            coverImage { medium }
          }
        }
      }
    `,
    variables: {
      search: query,
      type: requestedType === 'anime' ? 'ANIME' : 'MANGA',
    },
  }

  const response = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(graphql),
  })
  if (!response.ok) return []
  const payload = (await response.json()) as { data?: { Page?: { media?: Array<Record<string, unknown>> } } }

  return (payload.data?.Page?.media ?? []).map((entry) => {
    const title = entry.title as Record<string, string | undefined>
    const format = String(entry.format ?? '').toLowerCase()
    const inferredType = requestedType === 'anime' ? 'anime' : format.includes('manhwa') ? 'manhwa' : 'manga'
    const startDate = entry.startDate as { year?: number } | undefined
    const coverImage = entry.coverImage as { medium?: string } | undefined
    return {
      id: `anilist-${entry.id}`,
      title: title.english ?? title.romaji ?? title.native ?? 'Sin titulo',
      type: inferredType,
      source: 'anilist',
      sourceId: String(entry.id),
      overview: optionalString(entry.description),
      posterUrl: coverImage?.medium,
      releaseYear: startDate?.year,
      genres: Array.isArray(entry.genres) ? entry.genres.map(String) : [],
      externalRefs: {
        anilistId: String(entry.id),
        sourceUrl: `https://anilist.co/${inferredType === 'anime' ? 'anime' : 'manga'}/${entry.id}`,
      },
      createdAt: nowIso(),
    } satisfies ExternalCandidate
  })
}

function uniqueExternalCandidates(candidates: ExternalCandidate[]) {
  const byId = new Map<string, ExternalCandidate>()
  for (const candidate of candidates) {
    byId.set(`${candidate.source}:${candidate.sourceId}`, candidate)
  }
  return [...byId.values()]
}

function normalizeProxyCandidate(value: unknown): ExternalCandidate[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  const candidate = value as Partial<ExternalCandidate>
  const source = candidate.source === 'tmdb' || candidate.source === 'rawg' ? candidate.source : undefined
  const title = optionalString(candidate.title)
  const sourceId = optionalString(candidate.sourceId)
  if (!source || !title || !sourceId) return []

  return [
    {
      id: optionalString(candidate.id) ?? `${source}-${sourceId}`,
      title,
      type: normalizeProxyType(candidate.type),
      source,
      sourceId,
      overview: optionalString(candidate.overview),
      posterUrl: optionalString(candidate.posterUrl),
      releaseYear: typeof candidate.releaseYear === 'number' ? candidate.releaseYear : undefined,
      genres: Array.isArray(candidate.genres) ? candidate.genres.map(String).filter(Boolean).slice(0, 8) : [],
      externalRefs:
        candidate.externalRefs && typeof candidate.externalRefs === 'object' && !Array.isArray(candidate.externalRefs)
          ? candidate.externalRefs
          : {},
      createdAt: optionalString(candidate.createdAt) ?? nowIso(),
    },
  ]
}

function normalizeProxyType(type: unknown): ExternalCandidate['type'] {
  if (type === 'game' || type === 'movie' || type === 'series') return type
  return 'other'
}

function optionalString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function parseFirstYear(value?: string) {
  const match = value?.match(/\b(19|20)\d{2}\b/)
  return match ? Number(match[0]) : undefined
}
