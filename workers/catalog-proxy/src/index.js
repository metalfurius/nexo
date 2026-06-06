const TMDB_GENRES = {
  12: 'Aventura',
  14: 'Fantasia',
  16: 'Animacion',
  18: 'Drama',
  27: 'Terror',
  28: 'Accion',
  35: 'Comedia',
  36: 'Historia',
  37: 'Western',
  53: 'Thriller',
  80: 'Crimen',
  99: 'Documental',
  878: 'Ciencia ficcion',
  9648: 'Misterio',
  10402: 'Musica',
  10749: 'Romance',
  10751: 'Familia',
  10752: 'Guerra',
  10759: 'Accion y aventura',
  10762: 'Infantil',
  10763: 'Noticias',
  10764: 'Reality',
  10765: 'Sci-Fi y fantasia',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'Politica',
  10770: 'TV movie',
}

const DEFAULT_ALLOWED_ORIGINS = [
  'https://nexo.codeoverdose.es',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
]
const CACHE_LANGUAGE = 'es-ES'
const PROVIDER_VERSION = '2026-06-06-v2'
const POSITIVE_TTL_SECONDS = 86_400
const EMPTY_TTL_SECONDS = 900

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders(request, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const url = new URL(request.url)
    if (url.pathname === '/health') {
      return json({ ok: true }, corsHeaders)
    }

    if (request.method !== 'GET' || url.pathname !== '/search') {
      return json({ error: 'not_found' }, corsHeaders, 404)
    }

    const query = url.searchParams.get('q')?.trim() ?? ''
    const type = normalizeSearchType(url.searchParams.get('type')?.trim() ?? 'any')
    if (query.length < 2) {
      return json({ results: [] }, corsHeaders, 200, { 'x-nexo-cache': 'bypass' })
    }

    const cache = caches.default
    const cacheRequest = createCacheRequest(request, query, type)
    const cachedResponse = await cache.match(cacheRequest)
    if (cachedResponse) {
      const cachedPayload = await cachedResponse.json()
      return json(cachedPayload, corsHeaders, 200, {
        'cache-control': cachedResponse.headers.get('cache-control') ?? `public, max-age=${POSITIVE_TTL_SECONDS}`,
        'x-nexo-cache': 'hit',
      })
    }

    const results = uniqueCandidates(await searchProviders(query, type, env)).slice(0, 24)
    const payload = { results }
    const ttl = results.length ? POSITIVE_TTL_SECONDS : EMPTY_TTL_SECONDS
    await cache.put(
      cacheRequest,
      new Response(JSON.stringify(payload), {
        headers: {
          'cache-control': `public, max-age=${ttl}`,
          'content-type': 'application/json; charset=utf-8',
        },
      }),
    )
    return json(payload, corsHeaders, 200, {
      'cache-control': `public, max-age=${ttl}`,
      'x-nexo-cache': 'miss',
    })
  },
}

async function searchProviders(query, type, env) {
  const tasks = []
  if (type === 'watch' || type === 'movie' || type === 'series' || type === 'any') {
    tasks.push(searchTmdb(query, env, type))
  }
  if (type === 'watch' || type === 'anime' || type === 'any') {
    tasks.push(searchAniList(query, 'anime'))
  }
  if (type === 'watch' || type === 'manga' || type === 'manhwa' || type === 'any') {
    tasks.push(searchAniList(query, type === 'anime' ? 'anime' : 'manga', type))
  }
  if (type === 'book' || type === 'any') {
    tasks.push(searchOpenLibrary(query))
  }
  if (type === 'game' || type === 'any') {
    tasks.push(searchRawg(query, env))
    tasks.push(searchWikidataGames(query))
  }

  const groups = await Promise.allSettled(tasks)
  return groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))
}

async function searchTmdb(query, env, requestedType = 'watch') {
  const token = env.TMDB_READ_TOKEN || env.TMDB_TOKEN
  if (!token) return []

  const url = new URL('https://api.themoviedb.org/3/search/multi')
  url.searchParams.set('query', query)
  url.searchParams.set('language', 'es-ES')
  url.searchParams.set('include_adult', 'false')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  })
  if (!response.ok) return []

  const payload = await response.json()
  return (payload.results ?? [])
    .filter((entry) => {
      if (requestedType === 'movie') return entry.media_type === 'movie'
      if (requestedType === 'series') return entry.media_type === 'tv'
      return entry.media_type === 'movie' || entry.media_type === 'tv'
    })
    .map((entry) => {
      const mediaType = entry.media_type === 'tv' ? 'series' : 'movie'
      const date = entry.release_date || entry.first_air_date || ''
      const id = String(entry.id)
      const genres = Array.isArray(entry.genre_ids)
        ? entry.genre_ids.flatMap((genreId) => TMDB_GENRES[Number(genreId)] ?? [])
        : []

      return {
        id: `tmdb-${entry.media_type}-${id}`,
        title: String(entry.title || entry.name || 'Sin titulo'),
        type: mediaType,
        source: 'tmdb',
        sourceId: id,
        overview: optionalString(entry.overview),
        posterUrl: entry.poster_path ? `https://image.tmdb.org/t/p/w342${entry.poster_path}` : undefined,
        releaseYear: parseYear(date),
        genres,
        externalRefs: {
          tmdbId: id,
          sourceUrl: `https://www.themoviedb.org/${entry.media_type}/${id}`,
        },
        createdAt: new Date().toISOString(),
      }
    })
}

async function searchRawg(query, env) {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) return []

  const url = new URL('https://api.rawg.io/api/games')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('search', query)
  url.searchParams.set('page_size', '8')

  const response = await fetch(url)
  if (!response.ok) return []

  const payload = await response.json()
  return (payload.results ?? []).map((entry) => ({
    id: `rawg-${entry.id}`,
    title: String(entry.name || 'Sin titulo'),
    type: 'game',
    source: 'rawg',
    sourceId: String(entry.id),
    posterUrl: optionalString(entry.background_image),
    releaseYear: parseYear(entry.released),
    genres: Array.isArray(entry.genres)
      ? entry.genres.map((genre) => String(genre.name || '')).filter(Boolean).slice(0, 5)
      : [],
    externalRefs: {
      rawgId: String(entry.id),
      sourceUrl: entry.slug ? `https://rawg.io/games/${entry.slug}` : 'https://rawg.io/',
    },
    createdAt: new Date().toISOString(),
  }))
}

async function searchOpenLibrary(query) {
  const url = new URL('https://openlibrary.org/search.json')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,subject')

  const response = await fetch(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Nexo/1.0 (https://nexo.codeoverdose.es)',
    },
  })
  if (!response.ok) return []

  const payload = await response.json()
  return (payload.docs ?? []).map((entry) => {
    const authors = Array.isArray(entry.author_name) ? entry.author_name.map(String).slice(0, 2) : []
    const title = [String(entry.title || 'Sin titulo'), authors.join(', ')].filter(Boolean).join(' - ')
    const key = String(entry.key || '')
    return {
      id: `open-library-${key.replace(/\//g, '-')}`,
      title,
      type: 'book',
      source: 'openLibrary',
      sourceId: key,
      posterUrl: entry.cover_i ? `https://covers.openlibrary.org/b/id/${entry.cover_i}-M.jpg` : undefined,
      releaseYear: typeof entry.first_publish_year === 'number' ? entry.first_publish_year : undefined,
      genres: Array.isArray(entry.subject) ? entry.subject.map(String).slice(0, 5) : [],
      externalRefs: {
        openLibraryKey: key,
        sourceUrl: `https://openlibrary.org${key}`,
      },
      createdAt: new Date().toISOString(),
    }
  })
}

async function searchAniList(query, requestedType, requestedFilter = requestedType) {
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
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(graphql),
  })
  if (!response.ok) return []

  const payload = await response.json()
  return (payload.data?.Page?.media ?? [])
    .map((entry) => {
      const format = String(entry.format || '').toLowerCase()
      const inferredType = requestedType === 'anime' ? 'anime' : format.includes('manhwa') ? 'manhwa' : 'manga'
      return { entry, inferredType }
    })
    .filter(({ inferredType }) => requestedFilter !== 'manhwa' || inferredType === 'manhwa')
    .map(({ entry, inferredType }) => {
      const title = entry.title || {}
      return {
        id: `anilist-${entry.id}`,
        title: title.english || title.romaji || title.native || 'Sin titulo',
        type: inferredType,
        source: 'anilist',
        sourceId: String(entry.id),
        overview: optionalString(entry.description),
        posterUrl: optionalString(entry.coverImage?.medium),
        releaseYear: typeof entry.startDate?.year === 'number' ? entry.startDate.year : undefined,
        genres: Array.isArray(entry.genres) ? entry.genres.map(String) : [],
        externalRefs: {
          anilistId: String(entry.id),
          sourceUrl: `https://anilist.co/${inferredType === 'anime' ? 'anime' : 'manga'}/${entry.id}`,
        },
        createdAt: new Date().toISOString(),
      }
    })
}

async function searchWikidataGames(query) {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbsearchentities')
  url.searchParams.set('search', query)
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('limit', '8')

  const response = await fetch(url)
  if (!response.ok) return []

  const payload = await response.json()
  return (payload.search ?? [])
    .filter((entry) => /video game|videogame/i.test(String(entry.description || '')))
    .map((entry) => {
      const id = String(entry.id)
      const description = optionalString(entry.description)
      return {
        id: `wikidata-${id}`,
        title: String(entry.label || 'Sin titulo'),
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
        createdAt: new Date().toISOString(),
      }
    })
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigins = (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const allowedOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0]

  return {
    'access-control-allow-headers': 'content-type, accept',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-origin': allowedOrigin,
    vary: 'Origin',
  }
}

function createCacheRequest(request, query, type) {
  const normalizedQuery = normalizeCacheKeyPart(query)
  return new Request(
    `https://nexo-catalog-cache.local/search?v=${PROVIDER_VERSION}&language=${CACHE_LANGUAGE}&type=${type}&q=${encodeURIComponent(normalizedQuery)}`,
    request,
  )
}

function normalizeCacheKeyPart(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSearchType(value) {
  const allowed = ['any', 'watch', 'game', 'book', 'movie', 'series', 'anime', 'manga', 'manhwa']
  return allowed.includes(value) ? value : 'any'
}

function json(payload, corsHeaders, status = 200, headers = {}) {
  return new Response(JSON.stringify(stripUndefined(payload)), {
    status,
    headers: {
      ...corsHeaders,
      ...headers,
      'content-type': 'application/json; charset=utf-8',
    },
  })
}

function uniqueCandidates(candidates) {
  const byId = new Map()
  for (const candidate of candidates) {
    byId.set(`${candidate.source}:${candidate.sourceId}`, candidate)
  }
  return [...byId.values()]
}

function optionalString(value) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function parseYear(value) {
  const match = String(value || '').match(/^(19|20)\d{2}/)
  return match ? Number(match[0]) : undefined
}

function parseFirstYear(value) {
  const match = String(value || '').match(/\b(19|20)\d{2}\b/)
  return match ? Number(match[0]) : undefined
}

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => (entry === undefined ? [] : [[key, stripUndefined(entry)]])),
    )
  }
  return value
}
