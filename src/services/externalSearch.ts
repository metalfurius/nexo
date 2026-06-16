import type { ExternalCandidate, ItemType, ProgressUnit, RelatedItemKind, RelatedItemRef } from '../domain/types'
import { nowIso } from '../domain/types'
import { compactCatalogSearchText, normalizeCatalogSearchText, rankCatalogSearchCandidates } from '../lib/catalogSearch'
import { readExternalSearchCache, writeExternalSearchCache } from './externalSearchCache'

export interface ExternalSourceCredit {
  detail: string
  id: ExternalCandidate['source']
  label: string
  requiresKey: boolean
  url: string
}

export type ExternalDiscoverType = 'any' | 'movie' | 'series' | 'animeManga' | 'game' | 'book'
export type ExternalDiscoverDuration = 'any' | 'short' | 'medium' | 'long'

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
    detail: 'Libros, autores y portadas a traves del proxy privado de catalogo.',
    id: 'googleBooks',
    label: 'Google Books',
    requiresKey: true,
    url: 'https://books.google.com/',
  },
  {
    detail: 'Anime, manga y manhwa con generos y portadas sin clave de API.',
    id: 'anilist',
    label: 'AniList',
    requiresKey: false,
    url: 'https://anilist.co/',
  },
  {
    detail: 'Manga y manhwa con aliases localizados, tags y portadas sin clave de API.',
    id: 'mangaDex',
    label: 'MangaDex',
    requiresKey: false,
    url: 'https://mangadex.org/',
  },
  {
    detail: 'Manga y manhwa con titulos localizados y portadas sin clave de API.',
    id: 'kitsu',
    label: 'Kitsu',
    requiresKey: false,
    url: 'https://kitsu.io/',
  },
  {
    detail: 'Respaldo abierto de MyAnimeList para anime, manga y manhwa sin clave de API.',
    id: 'jikan',
    label: 'Jikan',
    requiresKey: false,
    url: 'https://jikan.moe/',
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

  const cached = await readExternalSearchCache(query, type).catch(() => undefined)
  if (cached?.state === 'fresh') return cached.entry.results

  const proxyCandidates = await searchCatalogProxy(query, type).catch(() => undefined)
  if (proxyCandidates?.length) {
    const results = rankCatalogSearchCandidates(uniqueExternalCandidates(proxyCandidates), query, type).slice(0, 24)
    void writeExternalSearchCache(query, type, results).catch(() => undefined)
    return results
  }

  const groups = await Promise.allSettled(getSearchTasks(query, type))
  const results = rankCatalogSearchCandidates(
    uniqueExternalCandidates(groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))),
    query,
    type,
  ).slice(0, 24)
  if (results.length) {
    void writeExternalSearchCache(query, type, results).catch(() => undefined)
    return results
  }

  return cached?.state === 'stale' && isLikelyOffline() ? cached.entry.results : results
}

export async function discoverExternalCandidate(
  type: ExternalDiscoverType,
  duration: ExternalDiscoverDuration,
): Promise<ExternalCandidate | undefined> {
  const seed = createDiscoverySeed()
  const proxyCandidate = await discoverFromCatalogProxy(type, duration, seed)
  if (proxyCandidate) return proxyCandidate

  const queries = getDiscoverQueries(type, duration, seed).slice(0, 3)
  const searchType = discoverTypeToSearchType(type)
  const groups = await Promise.allSettled(queries.map((query) => searchExternalSources(query, searchType)))
  const candidates = uniqueExternalCandidates(groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))).filter(
    hasPoster,
  )
  return pickSeeded(candidates, seed)
}

function getSearchTasks(query: string, type: string): Array<Promise<ExternalCandidate[]>> {
  if (type === 'book') return [searchOpenLibrary(query)]
  if (type === 'game') return [searchWikidataGames(query)]
  if (type === 'anime') return [searchAniList(query, 'anime'), searchJikan(query, 'anime')]
  if (type === 'manga') return [searchAniList(query, 'manga', 'manga'), searchMangaDex(query, 'manga'), searchKitsuManga(query, 'manga'), searchJikan(query, 'manga')]
  if (type === 'manhwa') {
    return [searchAniList(query, 'manga', 'manhwa'), searchMangaDex(query, 'manhwa'), searchKitsuManga(query, 'manhwa'), searchJikan(query, 'manhwa')]
  }
  if (type === 'animeManga') {
    return [
      searchAniList(query, 'anime'),
      searchAniList(query, 'manga', 'allManga'),
      searchMangaDex(query, 'allManga'),
      searchKitsuManga(query, 'allManga'),
      searchJikan(query, 'anime'),
      searchJikan(query, 'allManga'),
    ]
  }
  if (type === 'watch') {
    return [
      searchAniList(query, 'anime'),
      searchAniList(query, 'manga', 'allManga'),
      searchMangaDex(query, 'allManga'),
      searchKitsuManga(query, 'allManga'),
      searchJikan(query, 'anime'),
      searchJikan(query, 'allManga'),
    ]
  }
  if (type === 'any') {
    return [
      searchOpenLibrary(query),
      searchAniList(query, 'anime'),
      searchAniList(query, 'manga', 'allManga'),
      searchMangaDex(query, 'allManga'),
      searchKitsuManga(query, 'allManga'),
      searchJikan(query, 'anime'),
      searchJikan(query, 'allManga'),
      searchWikidataGames(query),
    ]
  }
  return []
}

async function discoverFromCatalogProxy(
  type: ExternalDiscoverType,
  duration: ExternalDiscoverDuration,
  seed: string,
): Promise<ExternalCandidate | undefined> {
  const proxyUrl = String(import.meta.env.VITE_CATALOG_PROXY_URL ?? '').trim()
  if (!proxyUrl) return undefined

  const baseUrl = proxyUrl.endsWith('/') ? proxyUrl : `${proxyUrl}/`
  const url = new URL('discover', baseUrl)
  url.searchParams.set('type', type)
  url.searchParams.set('duration', duration)
  url.searchParams.set('seed', seed)

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return undefined

  const payload = (await response.json()) as { result?: unknown }
  return normalizeProxyCandidate(payload.result).find(hasPoster)
}

async function searchCatalogProxy(query: string, type: string): Promise<ExternalCandidate[] | undefined> {
  const proxyUrl = String(import.meta.env.VITE_CATALOG_PROXY_URL ?? '').trim()
  if (!proxyUrl) return undefined

  const baseUrl = proxyUrl.endsWith('/') ? proxyUrl : `${proxyUrl}/`
  const url = new URL('search', baseUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('type', type)

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return []

  const payload = (await response.json()) as { results?: unknown }
  if (!Array.isArray(payload.results)) return []
  return enrichProxyCandidates(payload.results.flatMap(normalizeProxyCandidate))
}

async function enrichProxyCandidates(candidates: ExternalCandidate[]): Promise<ExternalCandidate[]> {
  return Promise.all(candidates.map((candidate, index) => (index < 8 ? enrichProxyCandidate(candidate) : candidate)))
}

async function enrichProxyCandidate(candidate: ExternalCandidate): Promise<ExternalCandidate> {
  if (candidate.source !== 'tmdb' || candidate.type !== 'series' || !isLikelyAnimatedExternalCandidate(candidate)) return candidate

  const aniListCandidates = await searchAniList(candidate.title, 'anime').catch(() => [])
  const matchedCandidate = pickMatchingExternalCandidate(aniListCandidates, candidate.title)
  if (!matchedCandidate?.relatedItems?.length) return candidate

  const relatedItems = uniqueRelatedItems([...(candidate.relatedItems ?? []), ...matchedCandidate.relatedItems]).slice(0, 12)
  return {
    ...candidate,
    relatedItems,
  }
}

function isLikelyAnimatedExternalCandidate(candidate: ExternalCandidate) {
  return candidate.genres.some((genre) => {
    const normalized = normalizeCatalogSearchText(genre)
    return normalized.includes('animacion') || normalized.includes('animation') || normalized.includes('anime')
  })
}

function pickMatchingExternalCandidate(candidates: ExternalCandidate[], title: string) {
  const titleText = normalizeCatalogSearchText(title)
  const titleCompact = compactCatalogSearchText(title)
  return candidates.find((candidate) => {
    const aliases = [candidate.title, ...(candidate.searchAliases ?? [])]
    return aliases.some((alias) => normalizeCatalogSearchText(alias) === titleText || compactCatalogSearchText(alias) === titleCompact)
  })
}

function getDiscoverQueries(type: ExternalDiscoverType, duration: ExternalDiscoverDuration, seed: string) {
  const typedSeeds = DISCOVER_QUERY_SEEDS[type] ?? DISCOVER_QUERY_SEEDS.any
  const durationSeeds = DISCOVER_DURATION_SEEDS[duration] ?? DISCOVER_DURATION_SEEDS.any
  const combined = [...typedSeeds, ...durationSeeds, ...DISCOVER_QUERY_SEEDS.any]
  const start = hashSeed(seed) % combined.length
  return [...combined.slice(start), ...combined.slice(0, start)]
}

const DISCOVER_QUERY_SEEDS: Record<ExternalDiscoverType, string[]> = {
  animeManga: ['frieren', 'chainsaw man', 'vinland saga', 'dungeon meshi', 'pluto', 'monster'],
  any: ['frieren', 'hollow knight', 'dune', 'parasite', 'arrival', 'outer wilds', 'station eleven'],
  book: ['dune', 'earthsea', 'the left hand of darkness', 'babel', 'project hail mary', 'annihilation'],
  game: ['hollow knight', 'celeste', 'outer wilds', 'disco elysium', 'hades', 'gris'],
  movie: ['parasite', 'arrival', 'spirited away', 'blade runner', 'perfect days', 'portrait of a lady on fire'],
  series: ['station eleven', 'severance', 'andor', 'the bear', 'arcane', 'dark'],
}

const DISCOVER_DURATION_SEEDS: Record<ExternalDiscoverDuration, string[]> = {
  any: [],
  long: ['epic', 'saga', 'open world', 'long running', 'trilogy'],
  medium: ['season', 'adventure', 'story rich', 'novel'],
  short: ['short', 'movie', 'one shot', 'indie', 'novella'],
}

function discoverTypeToSearchType(type: ExternalDiscoverType) {
  if (type === 'animeManga') return 'animeManga'
  return type
}

function createDiscoverySeed() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `${Date.now()}`
}

function hasPoster(candidate: ExternalCandidate) {
  return Boolean(candidate.posterUrl?.trim())
}

function isLikelyOffline() {
  return typeof navigator !== 'undefined' && 'onLine' in navigator && !navigator.onLine
}

function pickSeeded<T>(values: T[], seed: string) {
  if (!values.length) return undefined
  return values[hashSeed(seed) % values.length]
}

function hashSeed(seed: string) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
}

async function searchOpenLibrary(query: string): Promise<ExternalCandidate[]> {
  const url = new URL('https://openlibrary.org/search.json')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median')

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
      progressTotal: typeof entry.number_of_pages_median === 'number' ? entry.number_of_pages_median : undefined,
      progressUnit: typeof entry.number_of_pages_median === 'number' ? 'pages' : undefined,
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
  requestedType: 'anime' | 'manga',
  requestedFilter: 'anime' | 'manga' | 'manhwa' | 'allManga' = requestedType,
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
            countryOfOrigin
            episodes
            chapters
            volumes
            genres
            startDate { year }
            coverImage { medium }
            siteUrl
            relations {
              edges {
                relationType
                node {
                  id
                  type
                  format
                  countryOfOrigin
                  title { romaji english native }
                  startDate { year }
                  coverImage { medium }
                  siteUrl
                }
              }
            }
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

  return (payload.data?.Page?.media ?? [])
    .map((entry) => {
      const inferredType = inferAniListType(requestedType, entry)
      return { entry, inferredType }
    })
    .filter(({ inferredType }) => matchesAnimeMangaFilter(inferredType, requestedFilter))
    .map(({ entry, inferredType }) => {
      const title = entry.title as Record<string, string | undefined>
      const startDate = entry.startDate as { year?: number } | undefined
      const coverImage = entry.coverImage as { medium?: string } | undefined
      const aliases = uniqueStrings([title.english, title.romaji, title.native])
      const progressMeta = readAniListProgressMeta(inferredType, entry)
      return {
        id: `anilist-${entry.id}`,
        title: title.english ?? title.romaji ?? title.native ?? 'Sin titulo',
        type: inferredType,
        source: 'anilist',
        sourceId: String(entry.id),
        overview: optionalString(entry.description),
        posterUrl: coverImage?.medium,
        releaseYear: startDate?.year,
        progressTotal: progressMeta?.total,
        progressUnit: progressMeta?.unit,
        genres: Array.isArray(entry.genres) ? entry.genres.map(String) : [],
        searchAliases: aliases,
        externalRefs: {
          anilistId: String(entry.id),
          sourceUrl: optionalString(entry.siteUrl) ?? `https://anilist.co/${inferredType === 'anime' ? 'anime' : 'manga'}/${entry.id}`,
        },
        relatedItems: readAniListRelations(entry, inferredType),
        createdAt: nowIso(),
      } satisfies ExternalCandidate
    })
}

async function searchJikan(
  query: string,
  requestedFilter: 'anime' | 'manga' | 'manhwa' | 'allManga',
): Promise<ExternalCandidate[]> {
  const endpoint = requestedFilter === 'anime' ? 'anime' : 'manga'
  const url = new URL(`https://api.jikan.moe/v4/${endpoint}`)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('sfw', 'true')

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return []
  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> }

  const entries = (payload.data ?? [])
    .map((entry) => {
      const inferredType = inferJikanType(endpoint, entry)
      return { entry, inferredType }
    })
    .filter(({ inferredType }) => matchesAnimeMangaFilter(inferredType, requestedFilter))
    .filter(({ entry }) => Boolean(entry.mal_id))
    .slice(0, 8)

  return Promise.all(entries.map(async ({ entry, inferredType }, index) => {
      const id = String(entry.mal_id ?? '')
      const images = entry.images as { jpg?: { image_url?: string } } | undefined
      const aliases = readJikanTitleAliases(entry)
      const progressMeta = readJikanProgressMeta(inferredType, entry)
      return {
        id: `jikan-${id}`,
        title: optionalString(entry.title_english) ?? optionalString(entry.title) ?? 'Sin titulo',
        type: inferredType,
        source: 'jikan',
        sourceId: id,
        overview: optionalString(entry.synopsis),
        posterUrl: optionalString(images?.jpg?.image_url),
        releaseYear: readJikanReleaseYear(entry),
        progressTotal: progressMeta?.total,
        progressUnit: progressMeta?.unit,
        genres: Array.isArray(entry.genres)
          ? entry.genres
              .flatMap((genre) => {
                if (!genre || typeof genre !== 'object' || !('name' in genre)) return []
                const name = optionalString((genre as { name?: unknown }).name)
                return name ? [name] : []
              })
              .slice(0, 8)
          : [],
        searchAliases: aliases,
        externalRefs: {
          malId: id,
          sourceUrl: optionalString(entry.url) ?? `https://myanimelist.net/${inferredType === 'anime' ? 'anime' : 'manga'}/${id}`,
        },
        relatedItems: index < 4 ? await readJikanRelations(id, endpoint).catch(() => []) : undefined,
        createdAt: nowIso(),
      } satisfies ExternalCandidate
    }))
}

async function searchMangaDex(
  query: string,
  requestedFilter: 'manga' | 'manhwa' | 'allManga',
): Promise<ExternalCandidate[]> {
  const url = new URL('https://api.mangadex.org/manga')
  url.searchParams.set('title', query)
  url.searchParams.set('limit', '8')
  url.searchParams.append('includes[]', 'cover_art')
  for (const rating of ['safe', 'suggestive', 'erotica', 'pornographic']) {
    url.searchParams.append('contentRating[]', rating)
  }

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return []
  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> }

  return (payload.data ?? [])
    .map((entry) => {
      const inferredType = inferMangaDexType(entry)
      return { entry, inferredType }
    })
    .filter(({ inferredType }) => matchesAnimeMangaFilter(inferredType, requestedFilter))
    .map(({ entry, inferredType }) => {
      const id = String(entry.id ?? '')
      const attributes = readRecord(entry.attributes)
      const aliases = collectMangaDexTitleAliases(attributes)
      const title = pickMangaDexTitle(attributes, query, aliases)
      const cover = Array.isArray(entry.relationships)
        ? entry.relationships.find((relationship) => readRecord(relationship).type === 'cover_art')
        : undefined
      const coverAttributes = readRecord(readRecord(cover).attributes)
      const fileName = optionalString(coverAttributes.fileName)
      return {
        id: `mangadex-${id}`,
        title,
        type: inferredType,
        source: 'mangaDex',
        sourceId: id,
        overview: readLocalizedText(attributes.description),
        posterUrl: fileName ? `https://uploads.mangadex.org/covers/${id}/${fileName}.256.jpg` : undefined,
        releaseYear: typeof attributes.year === 'number' ? attributes.year : undefined,
        genres: readMangaDexTags(attributes.tags),
        searchAliases: aliases,
        externalRefs: {
          mangaDexId: id,
          sourceUrl: `https://mangadex.org/title/${id}`,
        },
        createdAt: nowIso(),
      } satisfies ExternalCandidate
    })
    .filter((candidate) => Boolean(candidate.sourceId))
}

async function searchKitsuManga(
  query: string,
  requestedFilter: 'manga' | 'manhwa' | 'allManga',
): Promise<ExternalCandidate[]> {
  const url = new URL('https://kitsu.io/api/edge/manga')
  url.searchParams.set('filter[text]', query)
  url.searchParams.set('page[limit]', '8')

  const response = await fetch(url, { headers: { accept: 'application/vnd.api+json' } })
  if (!response.ok) return []
  const payload = (await response.json()) as { data?: Array<Record<string, unknown>> }

  return (payload.data ?? [])
    .map((entry) => {
      const inferredType = inferKitsuType(entry)
      return { entry, inferredType }
    })
    .filter(
      (result): result is { entry: Record<string, unknown>; inferredType: ExternalCandidate['type'] } => {
        if (!result.inferredType) return false
        return matchesAnimeMangaFilter(result.inferredType, requestedFilter)
      },
    )
    .map(({ entry, inferredType }) => {
      const id = String(entry.id ?? '')
      const attributes = readRecord(entry.attributes)
      const aliases = collectKitsuTitleAliases(attributes)
      const title = pickKitsuTitle(attributes, query, aliases)
      const posterImage = readRecord(attributes.posterImage)
      const slug = optionalString(attributes.slug)
      return {
        id: `kitsu-${id}`,
        title,
        type: inferredType,
        source: 'kitsu',
        sourceId: id,
        overview: optionalString(attributes.synopsis),
        posterUrl: optionalString(posterImage.small) ?? optionalString(posterImage.medium),
        releaseYear: parseFirstYear(optionalString(attributes.startDate)),
        genres: [],
        searchAliases: aliases,
        externalRefs: {
          kitsuId: id,
          sourceUrl: slug ? `https://kitsu.io/manga/${slug}` : `https://kitsu.io/manga/${id}`,
        },
        createdAt: nowIso(),
      } satisfies ExternalCandidate
    })
    .filter((candidate) => Boolean(candidate.sourceId))
}

function inferAniListType(requestedType: 'anime' | 'manga', entry: Record<string, unknown>): ExternalCandidate['type'] {
  return inferAniListMediaType(requestedType === 'anime' ? 'ANIME' : 'MANGA', entry)
}

function inferAniListMediaType(mediaType: unknown, entry: Record<string, unknown>): ItemType {
  if (mediaType === 'ANIME') return 'anime'
  const format = String(entry.format ?? '').toLowerCase()
  const countryOfOrigin = String(entry.countryOfOrigin ?? '').toUpperCase()
  if (countryOfOrigin === 'KR' || format.includes('manhwa')) return 'manhwa'
  return 'manga'
}

function inferJikanType(endpoint: 'anime' | 'manga', entry: Record<string, unknown>): ExternalCandidate['type'] {
  if (endpoint === 'anime') return 'anime'
  const type = String(entry.type ?? '').toLowerCase()
  return type.includes('manhwa') ? 'manhwa' : 'manga'
}

function inferMangaDexType(entry: Record<string, unknown>): ExternalCandidate['type'] {
  const attributes = readRecord(entry.attributes)
  return String(attributes.originalLanguage ?? '').toLowerCase() === 'ko' ? 'manhwa' : 'manga'
}

function inferKitsuType(entry: Record<string, unknown>): ExternalCandidate['type'] | undefined {
  const attributes = readRecord(entry.attributes)
  const subtype = String(attributes.subtype ?? '').toLowerCase()
  if (subtype === 'manhwa') return 'manhwa'
  if (subtype === 'novel') return undefined
  return 'manga'
}

function matchesAnimeMangaFilter(type: ExternalCandidate['type'], requestedFilter: 'anime' | 'manga' | 'manhwa' | 'allManga') {
  if (requestedFilter === 'allManga') return type === 'manga' || type === 'manhwa'
  return type === requestedFilter
}

function readJikanReleaseYear(entry: Record<string, unknown>) {
  if (typeof entry.year === 'number') return entry.year
  const published = entry.published as { prop?: { from?: { year?: number } } } | undefined
  const aired = entry.aired as { prop?: { from?: { year?: number } } } | undefined
  return published?.prop?.from?.year ?? aired?.prop?.from?.year
}

async function readJikanRelations(id: string, endpoint: 'anime' | 'manga'): Promise<RelatedItemRef[]> {
  const url = new URL(`https://api.jikan.moe/v4/${endpoint}/${id}/relations`)
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return []

  const payload = (await response.json()) as { data?: unknown[] }
  const sortedRelationEntries = (Array.isArray(payload.data) ? payload.data : [])
    .flatMap((groupValue) => {
      const group = readRecord(groupValue)
      const relation = mapJikanRelationKind(group.relation)
      return (Array.isArray(group.entry) ? group.entry : []).flatMap((entryValue) => {
        const entry = readRecord(entryValue)
        const itemType = normalizeJikanRelatedType(entry.type)
        const sourceId = readSourceId(entry.mal_id)
        const title = optionalString(entry.name)
        if (!itemType || !sourceId || !title) return []

        return [{
          title,
          type: itemType,
          relation: relation === 'adaptation' ? mapCrossTypeAdaptationRelation(endpointToJikanItemType(endpoint), itemType) : relation,
          source: 'jikan',
          sourceId,
          externalRefs: {
            malId: sourceId,
            sourceUrl: optionalString(entry.url) ?? `https://myanimelist.net/${itemType === 'anime' ? 'anime' : 'manga'}/${sourceId}`,
          },
        } satisfies RelatedItemRef]
      })
    })
    .filter((entry) => entry.sourceId !== id)
    .sort(compareJikanRelationPriority)
  const importantRelationEntries = sortedRelationEntries.filter((entry) => jikanRelationPriority(entry.relation) === 0)
  const relationEntries = (importantRelationEntries.length ? importantRelationEntries : sortedRelationEntries).slice(0, 6)

  return uniqueRelatedItems(await hydrateJikanRelatedDetails(relationEntries)).slice(0, 12)
}

async function hydrateJikanRelatedDetails(entries: RelatedItemRef[]) {
  const results: RelatedItemRef[] = []
  for (const entry of entries) {
    results.push(await fetchJikanRelatedDetail(entry).catch(() => entry))
  }
  return results
}

function compareJikanRelationPriority(left: RelatedItemRef, right: RelatedItemRef) {
  return jikanRelationPriority(left.relation) - jikanRelationPriority(right.relation)
}

function jikanRelationPriority(relation: RelatedItemKind) {
  if (relation === 'sequel' || relation === 'prequel' || relation === 'source' || relation === 'adaptation') return 0
  if (relation === 'spin_off' || relation === 'side_story') return 1
  if (relation === 'summary') return 2
  return 3
}

async function fetchJikanRelatedDetail(entry: RelatedItemRef): Promise<RelatedItemRef> {
  const endpoint = entry.type === 'anime' ? 'anime' : 'manga'
  const url = new URL(`https://api.jikan.moe/v4/${endpoint}/${entry.sourceId}`)
  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return fetchJikanRelatedSearchDetail(entry).catch(() => entry)

  const payload = (await response.json()) as { data?: unknown }
  const detail = readRecord(payload.data)
  const hydrated = hydrateJikanRelatedEntry(entry, detail)
  if (hydrated.posterUrl) return hydrated
  return fetchJikanRelatedSearchDetail(hydrated).catch(() => hydrated)
}

async function fetchJikanRelatedSearchDetail(entry: RelatedItemRef): Promise<RelatedItemRef> {
  const endpoint = entry.type === 'anime' ? 'anime' : 'manga'
  const url = new URL(`https://api.jikan.moe/v4/${endpoint}`)
  url.searchParams.set('q', entry.title)
  url.searchParams.set('limit', '3')
  url.searchParams.set('sfw', 'true')

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return entry

  const payload = (await response.json()) as { data?: unknown[] }
  const candidates = Array.isArray(payload.data) ? payload.data.map(readRecord) : []
  const detail = candidates.find((candidate) => String(candidate.mal_id ?? '') === String(entry.sourceId)) ?? candidates[0]
  return detail ? hydrateJikanRelatedEntry(entry, detail) : entry
}

function hydrateJikanRelatedEntry(entry: RelatedItemRef, detail: Record<string, unknown>): RelatedItemRef {
  const images = readRecord(readRecord(detail.images).jpg)
  return {
    ...entry,
    posterUrl: optionalString(images.image_url) ?? entry.posterUrl,
    releaseYear: readJikanReleaseYear(detail) ?? entry.releaseYear,
  }
}

function mapJikanRelationKind(value: unknown): RelatedItemKind {
  const relation = normalizeCatalogSearchText(value)
  if (relation.includes('sequel')) return 'sequel'
  if (relation.includes('prequel')) return 'prequel'
  if (relation.includes('adaptation')) return 'adaptation'
  if (relation.includes('side')) return 'side_story'
  if (relation.includes('spin')) return 'spin_off'
  if (relation.includes('alternative')) return 'alternative'
  if (relation.includes('summary')) return 'summary'
  if (relation.includes('character')) return 'character'
  if (relation.includes('parent')) return 'source'
  return 'other'
}

function normalizeJikanRelatedType(value: unknown): ItemType | undefined {
  const type = normalizeCatalogSearchText(value)
  if (type === 'anime') return 'anime'
  if (type === 'manga') return 'manga'
  return undefined
}

function endpointToJikanItemType(endpoint: 'anime' | 'manga'): ItemType {
  return endpoint === 'anime' ? 'anime' : 'manga'
}

function mapCrossTypeAdaptationRelation(currentType: ItemType, relatedType: ItemType): RelatedItemKind {
  if (isSourceMedium(relatedType) && !isSourceMedium(currentType)) return 'source'
  return 'adaptation'
}

function isSourceMedium(type: ItemType) {
  return type === 'book' || type === 'manga' || type === 'manhwa' || type === 'comic'
}

function readAniListProgressMeta(type: ItemType, entry: Record<string, unknown>): { total: number; unit: ProgressUnit } | undefined {
  if (type === 'anime') return readProgressMeta(entry.episodes, 'episodes')
  return readProgressMeta(entry.chapters, 'chapters') ?? readProgressMeta(entry.volumes, 'volumes')
}

function readJikanProgressMeta(type: ItemType, entry: Record<string, unknown>): { total: number; unit: ProgressUnit } | undefined {
  if (type === 'anime') return readProgressMeta(entry.episodes, 'episodes')
  return readProgressMeta(entry.chapters, 'chapters') ?? readProgressMeta(entry.volumes, 'volumes')
}

function readProgressMeta(value: unknown, unit: ProgressUnit) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? { total: value, unit } : undefined
}

function readAniListRelations(entry: Record<string, unknown>, currentType: ItemType): RelatedItemRef[] | undefined {
  const edges = Array.isArray(entry.relations && readRecord(entry.relations).edges)
    ? (readRecord(entry.relations).edges as unknown[])
    : []
  const relatedItems = edges.flatMap((edge) => {
    const edgeRecord = readRecord(edge)
    const node = readRecord(edgeRecord.node)
    const titleRecord = readRecord(node.title)
    const title = optionalString(titleRecord.english) ?? optionalString(titleRecord.romaji) ?? optionalString(titleRecord.native)
    const id = readSourceId(node.id)
    if (!title || !id) return []

    const type = inferAniListMediaType(node.type, node)
    const startDate = readRecord(node.startDate)
    const coverImage = readRecord(node.coverImage)
    const relation = mapAniListRelationKind(edgeRecord.relationType)
    return [{
      title,
      type,
      relation: relation === 'adaptation' ? mapCrossTypeAdaptationRelation(currentType, type) : relation,
      source: 'anilist',
      sourceId: id,
      posterUrl: optionalString(coverImage.medium),
      releaseYear: typeof startDate.year === 'number' ? startDate.year : undefined,
      externalRefs: {
        anilistId: id,
        sourceUrl: optionalString(node.siteUrl) ?? `https://anilist.co/${type === 'anime' ? 'anime' : 'manga'}/${id}`,
      },
    } satisfies RelatedItemRef]
  })

  return uniqueRelatedItems(relatedItems).slice(0, 12)
}

function mapAniListRelationKind(value: unknown): RelatedItemKind {
  switch (String(value ?? '').toUpperCase()) {
    case 'ADAPTATION':
      return 'adaptation'
    case 'ALTERNATIVE':
      return 'alternative'
    case 'CHARACTER':
      return 'character'
    case 'PREQUEL':
      return 'prequel'
    case 'SEQUEL':
      return 'sequel'
    case 'SIDE_STORY':
      return 'side_story'
    case 'SOURCE':
    case 'PARENT':
      return 'source'
    case 'SPIN_OFF':
      return 'spin_off'
    case 'SUMMARY':
      return 'summary'
    default:
      return 'other'
  }
}

function uniqueRelatedItems(items: RelatedItemRef[]) {
  const seen = new Set<string>()
  const results: RelatedItemRef[] = []
  for (const item of items) {
    const key = `${item.source ?? ''}:${item.sourceId ?? ''}:${normalizeCatalogSearchText(item.title)}:${item.relation}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push(item)
  }
  return results
}

function readSourceId(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return optionalString(value)
}

function readJikanTitleAliases(entry: Record<string, unknown>) {
  const titles = Array.isArray(entry.titles) ? entry.titles : []
  const typedTitles = titles.map((titleEntry) => optionalString(readRecord(titleEntry).title)).filter((title): title is string => Boolean(title))
  return uniqueStrings([entry.title, entry.title_english, entry.title_japanese, ...typedTitles])
}

function collectMangaDexTitleAliases(attributes: Record<string, unknown>) {
  const titles = readRecord(attributes.title)
  const altTitles = Array.isArray(attributes.altTitles) ? attributes.altTitles : []
  return uniqueStrings([
    ...Object.values(titles),
    ...altTitles.flatMap((entry) => Object.values(readRecord(entry))),
  ])
}

function pickMangaDexTitle(attributes: Record<string, unknown>, query: string, aliases: string[]) {
  const queryText = normalizeCatalogSearchText(query)
  const queryCompact = compactCatalogSearchText(query)
  const exactAliases = aliases.filter((alias) => {
    const aliasText = normalizeCatalogSearchText(alias)
    return aliasText === queryText || compactCatalogSearchText(aliasText) === queryCompact
  })
  const exactAlias = exactAliases.find(isReadableLatinAlias)
  if (exactAlias) return exactAlias
  const readableMatch = pickReadableMatchingAlias(aliases, queryText, queryCompact)
  if (readableMatch) return readableMatch
  if (exactAliases[0]) return exactAliases[0]

  const titles = readRecord(attributes.title)
  return (
    optionalString(titles.es) ??
    optionalString(titles.en) ??
    optionalString(titles['ja-ro']) ??
    optionalString(titles.ko) ??
    optionalString(Object.values(titles)[0]) ??
    'Sin titulo'
  )
}

function pickReadableMatchingAlias(aliases: string[], queryText: string, queryCompact: string) {
  return aliases
    .map((alias) => {
      const aliasText = normalizeCatalogSearchText(alias)
      const aliasCompact = compactCatalogSearchText(aliasText)
      return { alias, aliasCompact, aliasText, score: scoreMatchingAlias(aliasText, aliasCompact, queryText, queryCompact) }
    })
    .filter((entry) => entry.score > 0 && isReadableLatinAlias(entry.alias))
    .sort((left, right) => right.score - left.score)[0]?.alias
}

function scoreMatchingAlias(aliasText: string, aliasCompact: string, queryText: string, queryCompact: string) {
  if (!queryText || !queryCompact) return 0
  if (aliasText === queryText || aliasCompact === queryCompact) return 5
  if (aliasText.startsWith(queryText)) return 4
  if (aliasCompact.startsWith(queryCompact)) return 3
  if (aliasText.includes(queryText)) return 2
  if (aliasCompact.includes(queryCompact)) return 1
  return 0
}

function isReadableLatinAlias(value: string) {
  const letterCount = value.match(/\p{Letter}/gu)?.length ?? 0
  if (!letterCount) return true
  const latinLetters = value.match(/[A-Za-z]/g)?.length ?? 0
  return latinLetters / letterCount >= 0.5
}

function readLocalizedText(value: unknown) {
  const record = readRecord(value)
  return (
    optionalString(record.es) ??
    optionalString(record.en) ??
    optionalString(record['ja-ro']) ??
    optionalString(record.ko) ??
    optionalString(Object.values(record)[0])
  )
}

function readMangaDexTags(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((tag) => readLocalizedText(readRecord(readRecord(tag).attributes).name))
    .filter((tag): tag is string => Boolean(tag))
    .slice(0, 8)
}

function collectKitsuTitleAliases(attributes: Record<string, unknown>) {
  const titles = readRecord(attributes.titles)
  const abbreviatedTitles = Array.isArray(attributes.abbreviatedTitles) ? attributes.abbreviatedTitles : []
  return uniqueStrings([attributes.canonicalTitle, ...Object.values(titles), ...abbreviatedTitles])
}

function pickKitsuTitle(attributes: Record<string, unknown>, query: string, aliases: string[]) {
  const queryText = normalizeCatalogSearchText(query)
  const queryCompact = compactCatalogSearchText(query)
  const exactAlias = aliases.find((alias) => {
    const aliasText = normalizeCatalogSearchText(alias)
    return aliasText === queryText || compactCatalogSearchText(aliasText) === queryCompact
  })
  if (exactAlias) return exactAlias

  const titles = readRecord(attributes.titles)
  return (
    optionalString(titles.es_es) ??
    optionalString(titles.en_us) ??
    optionalString(titles.en_jp) ??
    optionalString(attributes.canonicalTitle) ??
    optionalString(Object.values(titles)[0]) ??
    'Sin titulo'
  )
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
  const source = normalizeProxySource(candidate.source)
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
      progressTotal: typeof candidate.progressTotal === 'number' ? candidate.progressTotal : undefined,
      progressUnit: normalizeProgressUnit(candidate.progressUnit),
      genres: Array.isArray(candidate.genres) ? candidate.genres.map(String).filter(Boolean).slice(0, 8) : [],
      searchAliases: Array.isArray(candidate.searchAliases) ? candidate.searchAliases.map(String).filter(Boolean).slice(0, 24) : undefined,
      externalRefs:
        candidate.externalRefs && typeof candidate.externalRefs === 'object' && !Array.isArray(candidate.externalRefs)
          ? candidate.externalRefs
          : {},
      relatedItems: Array.isArray(candidate.relatedItems) ? normalizeRelatedItems(candidate.relatedItems) : undefined,
      createdAt: optionalString(candidate.createdAt) ?? nowIso(),
    },
  ]
}

function normalizeRelatedItems(values: unknown[]): RelatedItemRef[] {
  return values.flatMap((value) => {
    const item = readRecord(value)
    const title = optionalString(item.title)
    if (!title) return []

    const source = normalizeProxySource(item.source)
    const externalRefs = readRecord(item.externalRefs)
    return [{
      title,
      type: normalizeProxyType(item.type),
      relation: normalizeRelatedItemKind(item.relation),
      source: source ?? (item.source === 'nexo' ? 'nexo' : undefined),
      sourceId: optionalString(item.sourceId),
      posterUrl: optionalString(item.posterUrl),
      releaseYear: typeof item.releaseYear === 'number' ? item.releaseYear : undefined,
      externalRefs: Object.keys(externalRefs).length ? (externalRefs as RelatedItemRef['externalRefs']) : undefined,
    } satisfies RelatedItemRef]
  })
}

function normalizeProxyType(type: unknown): ExternalCandidate['type'] {
  if (
    type === 'game' ||
    type === 'book' ||
    type === 'movie' ||
    type === 'series' ||
    type === 'anime' ||
    type === 'manga' ||
    type === 'manhwa' ||
    type === 'comic' ||
    type === 'other'
  ) {
    return type
  }
  return 'other'
}

function normalizeProxySource(source: unknown): ExternalCandidate['source'] | undefined {
  if (
    source === 'tmdb' ||
    source === 'rawg' ||
    source === 'openLibrary' ||
    source === 'googleBooks' ||
    source === 'anilist' ||
    source === 'mangaDex' ||
    source === 'kitsu' ||
    source === 'jikan' ||
    source === 'wikidata'
  ) {
    return source
  }
  return undefined
}

function normalizeProgressUnit(unit: unknown): ProgressUnit | undefined {
  return unit === 'episodes' ||
    unit === 'chapters' ||
    unit === 'pages' ||
    unit === 'hours' ||
    unit === 'volumes' ||
    unit === 'percent' ||
    unit === 'items'
    ? unit
    : undefined
}

function normalizeRelatedItemKind(kind: unknown): RelatedItemKind {
  return kind === 'sequel' ||
    kind === 'prequel' ||
    kind === 'source' ||
    kind === 'adaptation' ||
    kind === 'side_story' ||
    kind === 'spin_off' ||
    kind === 'alternative' ||
    kind === 'summary' ||
    kind === 'character' ||
    kind === 'other'
    ? kind
    : 'other'
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function optionalString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function uniqueStrings(values: unknown[]) {
  const seen = new Set<string>()
  const results: string[] = []
  for (const value of values) {
    const text = optionalString(value)
    if (!text) continue
    const key = normalizeCatalogSearchText(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    results.push(text)
  }
  return results
}

function parseFirstYear(value?: string) {
  const match = value?.match(/\b(19|20)\d{2}\b/)
  return match ? Number(match[0]) : undefined
}
