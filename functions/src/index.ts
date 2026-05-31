import { initializeApp } from 'firebase-admin/app'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { defineSecret } from 'firebase-functions/params'

initializeApp()

const tmdbToken = defineSecret('TMDB_TOKEN')
const rawgApiKey = defineSecret('RAWG_API_KEY')

type SearchType = 'watch' | 'game' | 'book' | 'anime' | 'manga' | 'manhwa' | 'any'

interface ExternalCandidate {
  id: string
  title: string
  type: string
  source: 'tmdb' | 'rawg' | 'openLibrary' | 'anilist'
  sourceId: string
  overview?: string
  posterUrl?: string
  releaseYear?: number
  genres: string[]
  externalRefs: Record<string, string>
  createdAt: string
}

export const searchExternal = onCall(
  {
    cors: true,
    secrets: [tmdbToken, rawgApiKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('permission-denied', 'Usuario no autorizado.')
    }

    const query = String(request.data?.query ?? '').trim()
    const type = String(request.data?.type ?? 'any') as SearchType
    if (query.length < 2) {
      throw new HttpsError('invalid-argument', 'La busqueda necesita al menos 2 caracteres.')
    }

    const candidates = await searchByType(query, type)
    return { candidates: candidates.slice(0, 8) }
  },
)

async function searchByType(query: string, type: SearchType): Promise<ExternalCandidate[]> {
  if (type === 'game') return searchRawg(query)
  if (type === 'book') return searchOpenLibrary(query)
  if (type === 'anime' || type === 'manga' || type === 'manhwa') return searchAniList(query, type)
  if (type === 'watch') return searchTmdb(query)

  const groups = await Promise.allSettled([
    searchTmdb(query),
    searchRawg(query),
    searchOpenLibrary(query),
    searchAniList(query, 'anime'),
  ])
  return groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))
}

async function searchTmdb(query: string): Promise<ExternalCandidate[]> {
  const token = tmdbToken.value()
  if (!token) return []
  const url = new URL('https://api.themoviedb.org/3/search/multi')
  url.searchParams.set('query', query)
  url.searchParams.set('language', 'es-ES')
  url.searchParams.set('include_adult', 'false')

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      accept: 'application/json',
    },
  })
  if (!response.ok) throw new HttpsError('unavailable', 'TMDB no respondio correctamente.')
  const payload = (await response.json()) as { results?: Array<Record<string, unknown>> }
  return (payload.results ?? [])
    .filter((entry) => entry.media_type === 'movie' || entry.media_type === 'tv')
    .map((entry) => {
      const mediaType = entry.media_type === 'tv' ? 'series' : 'movie'
      const title = String(entry.title ?? entry.name ?? 'Sin titulo')
      const date = String(entry.release_date ?? entry.first_air_date ?? '')
      return {
        id: `tmdb-${entry.id}`,
        title,
        type: mediaType,
        source: 'tmdb',
        sourceId: String(entry.id),
        overview: typeof entry.overview === 'string' ? entry.overview : undefined,
        posterUrl: entry.poster_path ? `https://image.tmdb.org/t/p/w342${entry.poster_path}` : undefined,
        releaseYear: date ? Number(date.slice(0, 4)) : undefined,
        genres: [],
        externalRefs: {
          tmdbId: String(entry.id),
          sourceUrl: `https://www.themoviedb.org/${entry.media_type}/${entry.id}`,
        },
        createdAt: new Date().toISOString(),
      } satisfies ExternalCandidate
    })
}

async function searchRawg(query: string): Promise<ExternalCandidate[]> {
  const apiKey = rawgApiKey.value()
  if (!apiKey) return []
  const url = new URL('https://api.rawg.io/api/games')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('search', query)
  url.searchParams.set('page_size', '8')

  const response = await fetch(url)
  if (!response.ok) throw new HttpsError('unavailable', 'RAWG no respondio correctamente.')
  const payload = (await response.json()) as { results?: Array<Record<string, unknown>> }

  return (payload.results ?? []).map((entry) => ({
    id: `rawg-${entry.id}`,
    title: String(entry.name ?? 'Sin titulo'),
    type: 'game',
    source: 'rawg',
    sourceId: String(entry.id),
    posterUrl: typeof entry.background_image === 'string' ? entry.background_image : undefined,
    releaseYear: typeof entry.released === 'string' ? Number(entry.released.slice(0, 4)) : undefined,
    genres: Array.isArray(entry.genres)
      ? entry.genres.map((genre) => String((genre as Record<string, unknown>).name)).filter(Boolean)
      : [],
    externalRefs: {
      rawgId: String(entry.id),
      sourceUrl: `https://rawg.io/games/${entry.slug}`,
    },
    createdAt: new Date().toISOString(),
  }))
}

async function searchOpenLibrary(query: string): Promise<ExternalCandidate[]> {
  const url = new URL('https://openlibrary.org/search.json')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,subject')

  const response = await fetch(url)
  if (!response.ok) throw new HttpsError('unavailable', 'Open Library no respondio correctamente.')
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
      createdAt: new Date().toISOString(),
    } satisfies ExternalCandidate
  })
}

async function searchAniList(query: string, requestedType: 'anime' | 'manga' | 'manhwa') {
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
  if (!response.ok) throw new HttpsError('unavailable', 'AniList no respondio correctamente.')
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
      overview: typeof entry.description === 'string' ? entry.description : undefined,
      posterUrl: coverImage?.medium,
      releaseYear: startDate?.year,
      genres: Array.isArray(entry.genres) ? entry.genres.map(String) : [],
      externalRefs: {
        anilistId: String(entry.id),
        sourceUrl: `https://anilist.co/${inferredType === 'anime' ? 'anime' : 'manga'}/${entry.id}`,
      },
      createdAt: new Date().toISOString(),
    } satisfies ExternalCandidate
  })
}
