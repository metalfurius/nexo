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
const PROVIDER_VERSION = '2026-06-13-v3'
const POSITIVE_TTL_SECONDS = 86_400
const EMPTY_TTL_SECONDS = 900
const DISCOVER_TTL_SECONDS = 900
const DISCOVER_SEED_BUCKETS = 32

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

    if (request.method === 'GET' && url.pathname === '/discover') {
      return handleDiscover(request, env, corsHeaders, url)
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

    const results = rankSearchCandidates(uniqueCandidates(await searchProviders(query, type, env)), query, type).slice(0, 24)
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

async function handleDiscover(request, env, corsHeaders, url) {
  const type = normalizeDiscoverType(url.searchParams.get('type')?.trim() ?? 'any')
  const duration = normalizeDiscoverDuration(url.searchParams.get('duration')?.trim() ?? 'any')
  const seed = normalizeCacheKeyPart(url.searchParams.get('seed')?.trim() || new Date().toISOString().slice(0, 13))
  const seedBucket = getSeedBucket(seed)
  const cacheSeed = `${type}:${duration}:${seedBucket}`
  const cache = caches.default
  const cacheRequest = createDiscoverCacheRequest(request, type, duration, seedBucket)
  const cachedResponse = await cache.match(cacheRequest)
  if (cachedResponse) {
    const cachedPayload = await cachedResponse.json()
    return json(cachedPayload, corsHeaders, 200, {
      'cache-control': cachedResponse.headers.get('cache-control') ?? `public, max-age=${DISCOVER_TTL_SECONDS}`,
      'x-nexo-cache': 'hit',
    })
  }

  const result = await discoverCandidate(type, duration, cacheSeed, env)
  const payload = { result: result ?? null }
  const ttl = result ? DISCOVER_TTL_SECONDS : EMPTY_TTL_SECONDS
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
}

async function discoverCandidate(type, duration, seed, env) {
  const queries = getDiscoverQueries(type, duration, seed).slice(0, 3)
  const groups = await Promise.allSettled(queries.map((query) => searchProviders(query, discoverTypeToSearchType(type), env)))
  const candidates = uniqueCandidates(groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))).filter((candidate) =>
    Boolean(candidate.posterUrl),
  )
  if (!candidates.length) return undefined
  return candidates[hashSeed(seed) % candidates.length]
}

async function searchProviders(query, type, env) {
  const tasks = []
  if (type === 'watch' || type === 'movie' || type === 'series' || type === 'any') {
    tasks.push(searchTmdb(query, env, type))
  }
  if (type === 'watch' || type === 'anime' || type === 'animeManga' || type === 'any') {
    tasks.push(searchAniList(query, 'anime'))
    tasks.push(searchJikan(query, 'anime'))
  }
  if (type === 'watch' || type === 'manga' || type === 'manhwa' || type === 'animeManga' || type === 'any') {
    const mangaFilter = type === 'manga' || type === 'manhwa' ? type : 'allManga'
    tasks.push(searchAniList(query, 'manga', mangaFilter))
    tasks.push(searchJikan(query, mangaFilter))
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

function getDiscoverQueries(type, duration, seed) {
  const typedSeeds = DISCOVER_QUERY_SEEDS[type] ?? DISCOVER_QUERY_SEEDS.any
  const durationSeeds = DISCOVER_DURATION_SEEDS[duration] ?? DISCOVER_DURATION_SEEDS.any
  const combined = [...typedSeeds, ...durationSeeds, ...DISCOVER_QUERY_SEEDS.any]
  const start = hashSeed(seed) % combined.length
  return [...combined.slice(start), ...combined.slice(0, start)]
}

const DISCOVER_QUERY_SEEDS = {
  animeManga: ['frieren', 'chainsaw man', 'vinland saga', 'dungeon meshi', 'pluto', 'monster'],
  any: ['frieren', 'hollow knight', 'dune', 'parasite', 'arrival', 'outer wilds', 'station eleven'],
  book: ['dune', 'earthsea', 'the left hand of darkness', 'babel', 'project hail mary', 'annihilation'],
  game: ['hollow knight', 'celeste', 'outer wilds', 'disco elysium', 'hades', 'gris'],
  movie: ['parasite', 'arrival', 'spirited away', 'blade runner', 'perfect days', 'portrait of a lady on fire'],
  series: ['station eleven', 'severance', 'andor', 'the bear', 'arcane', 'dark'],
}

const DISCOVER_DURATION_SEEDS = {
  any: [],
  long: ['epic', 'saga', 'open world', 'long running', 'trilogy'],
  medium: ['season', 'adventure', 'story rich', 'novel'],
  short: ['short', 'movie', 'one shot', 'indie', 'novella'],
}

function discoverTypeToSearchType(type) {
  return type
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
            countryOfOrigin
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
      const inferredType = inferAniListType(requestedType, entry)
      return { entry, inferredType }
    })
    .filter(({ inferredType }) => matchesAnimeMangaFilter(inferredType, requestedFilter))
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

async function searchJikan(query, requestedFilter) {
  const endpoint = requestedFilter === 'anime' ? 'anime' : 'manga'
  const url = new URL(`https://api.jikan.moe/v4/${endpoint}`)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('sfw', 'true')

  const response = await fetch(url, { headers: { accept: 'application/json' } })
  if (!response.ok) return []

  const payload = await response.json()
  return (payload.data ?? [])
    .map((entry) => {
      const inferredType = inferJikanType(endpoint, entry)
      return { entry, inferredType }
    })
    .filter(({ inferredType }) => matchesAnimeMangaFilter(inferredType, requestedFilter))
    .map(({ entry, inferredType }) => {
      const id = String(entry.mal_id || '')
      return {
        id: `jikan-${id}`,
        title: optionalString(entry.title_english) || optionalString(entry.title) || 'Sin titulo',
        type: inferredType,
        source: 'jikan',
        sourceId: id,
        overview: optionalString(entry.synopsis),
        posterUrl: optionalString(entry.images?.jpg?.image_url),
        releaseYear: readJikanReleaseYear(entry),
        genres: Array.isArray(entry.genres)
          ? entry.genres.map((genre) => String(genre.name || '')).filter(Boolean).slice(0, 8)
          : [],
        externalRefs: {
          malId: id,
          sourceUrl: optionalString(entry.url) || `https://myanimelist.net/${inferredType === 'anime' ? 'anime' : 'manga'}/${id}`,
        },
        createdAt: new Date().toISOString(),
      }
    })
    .filter((candidate) => Boolean(candidate.sourceId))
}

function inferAniListType(requestedType, entry) {
  if (requestedType === 'anime') return 'anime'
  const format = String(entry.format || '').toLowerCase()
  const countryOfOrigin = String(entry.countryOfOrigin || '').toUpperCase()
  if (countryOfOrigin === 'KR' || format.includes('manhwa')) return 'manhwa'
  return 'manga'
}

function inferJikanType(endpoint, entry) {
  if (endpoint === 'anime') return 'anime'
  const type = String(entry.type || '').toLowerCase()
  return type.includes('manhwa') ? 'manhwa' : 'manga'
}

function matchesAnimeMangaFilter(type, requestedFilter) {
  if (requestedFilter === 'allManga') return type === 'manga' || type === 'manhwa'
  return type === requestedFilter
}

function readJikanReleaseYear(entry) {
  if (typeof entry.year === 'number') return entry.year
  return entry.published?.prop?.from?.year || entry.aired?.prop?.from?.year
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

function createDiscoverCacheRequest(request, type, duration, seedBucket) {
  return new Request(
    `https://nexo-catalog-cache.local/discover?v=${PROVIDER_VERSION}&language=${CACHE_LANGUAGE}&type=${type}&duration=${duration}&seedBucket=${seedBucket}`,
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
  const allowed = ['any', 'watch', 'game', 'book', 'movie', 'series', 'anime', 'manga', 'manhwa', 'animeManga']
  return allowed.includes(value) ? value : 'any'
}

function normalizeDiscoverType(value) {
  const allowed = ['any', 'movie', 'series', 'animeManga', 'game', 'book']
  return allowed.includes(value) ? value : 'any'
}

function normalizeDiscoverDuration(value) {
  const allowed = ['any', 'short', 'medium', 'long']
  return allowed.includes(value) ? value : 'any'
}

function getSeedBucket(seed) {
  return String(hashSeed(seed) % DISCOVER_SEED_BUCKETS)
}

function hashSeed(seed) {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash)
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

const LOW_SIGNAL_TOKENS = new Set([
  'a',
  'an',
  'and',
  'de',
  'del',
  'el',
  'en',
  'for',
  'girl',
  'la',
  'las',
  'los',
  'no',
  'of',
  'on',
  'princess',
  'star',
  'the',
  'to',
  'upon',
  'wa',
  'wish',
  'with',
])

const SOURCE_PRIORITY = {
  anilist: 1,
  jikan: 2,
  tmdb: 3,
  openLibrary: 4,
  rawg: 5,
  wikidata: 6,
}

function rankSearchCandidates(candidates, query, requestedType) {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreSearchCandidate(query, candidate, requestedType),
    }))
    .sort((left, right) => {
      const scoreDelta = right.score - left.score
      if (scoreDelta !== 0) return scoreDelta

      const leftSource = SOURCE_PRIORITY[left.candidate.source] ?? 99
      const rightSource = SOURCE_PRIORITY[right.candidate.source] ?? 99
      if (leftSource !== rightSource) return leftSource - rightSource

      return left.candidate.title.localeCompare(right.candidate.title, 'es') || left.index - right.index
    })
    .map((entry) => entry.candidate)
}

function scoreSearchCandidate(query, candidate, requestedType) {
  const queryText = normalizeSearchText(query)
  if (!queryText) return matchesRankType(candidate.type, requestedType) ? 1 : 0

  const queryCompact = compactSearchText(queryText)
  const queryTokens = tokenizeSearchText(queryText)
  const titleFields = [candidate.title].filter(Boolean)
  const allFields = [
    candidate.title,
    candidate.overview,
    candidate.type,
    candidate.source,
    candidate.sourceId,
    candidate.releaseYear ? String(candidate.releaseYear) : undefined,
    ...(candidate.genres ?? []),
    ...Object.values(candidate.externalRefs ?? {}),
  ].filter(Boolean)
  const normalizedTitleFields = titleFields.map(normalizeSearchText).filter(Boolean)
  const compactTitleFields = titleFields.map(compactSearchText).filter(Boolean)
  const normalizedAllFields = allFields.map(normalizeSearchText).filter(Boolean)
  const compactAllFields = allFields.map(compactSearchText).filter(Boolean)
  const normalizedTokenFields = new Set(normalizedAllFields.flatMap(tokenizeSearchText))

  let score = 0
  let phraseScore = 0

  for (let index = 0; index < normalizedTitleFields.length; index += 1) {
    const titleText = normalizedTitleFields[index]
    const compactTitle = compactTitleFields[index] ?? ''
    if (titleText === queryText) phraseScore = Math.max(phraseScore, 1120)
    if (compactTitle === queryCompact) phraseScore = Math.max(phraseScore, 1060)
    if (titleText.includes(queryText)) phraseScore = Math.max(phraseScore, 840)
    if (compactTitle.includes(queryCompact)) phraseScore = Math.max(phraseScore, 800)
    if (queryText.includes(titleText) && titleText.length >= 4) phraseScore = Math.max(phraseScore, 620)
  }

  for (let index = 0; index < normalizedAllFields.length; index += 1) {
    if (normalizedAllFields[index].includes(queryText)) phraseScore = Math.max(phraseScore, 720)
    if ((compactAllFields[index] ?? '').includes(queryCompact)) phraseScore = Math.max(phraseScore, 700)
  }

  score += phraseScore

  let highSignalHits = 0
  let lowSignalHits = 0
  for (const token of queryTokens) {
    const hasToken = normalizedTokenFields.has(token) || normalizedAllFields.some((field) => field.includes(token))
    if (!hasToken) continue
    if (LOW_SIGNAL_TOKENS.has(token)) {
      lowSignalHits += 1
    } else {
      highSignalHits += 1
    }
  }

  score += highSignalHits * 74
  score += lowSignalHits * 10
  if (queryTokens.length) {
    score += Math.round(((highSignalHits + lowSignalHits) / queryTokens.length) * (highSignalHits ? 160 : 44))
  }
  if (!phraseScore && lowSignalHits > 0 && highSignalHits === 0) score -= 90
  if (candidate.releaseYear && queryTokens.includes(String(candidate.releaseYear))) score += 40
  if (score <= 0) return 0

  if (matchesRankType(candidate.type, requestedType)) {
    if (requestedType !== 'any') score += requestedType === 'watch' ? 28 : 90
  } else if (requestedType !== 'any') {
    score -= 220
  }

  return Math.max(0, score)
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['`\u2019]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compactSearchText(value) {
  return normalizeSearchText(value).replace(/\s+/g, '')
}

function tokenizeSearchText(value) {
  return normalizeSearchText(value)
    .split(/\s+/)
    .filter((token) => token.length >= 2)
}

function matchesRankType(itemType, requestedType) {
  if (!requestedType || requestedType === 'any') return true
  if (requestedType === 'watch') return ['movie', 'series', 'anime', 'manga', 'manhwa', 'comic'].includes(itemType)
  if (requestedType === 'animeManga') return ['anime', 'manga', 'manhwa'].includes(itemType)
  return itemType === requestedType
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
