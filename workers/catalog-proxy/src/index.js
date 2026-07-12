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
]
const CACHE_LANGUAGE = 'es-ES'
const PROVIDER_VERSION = '2026-06-26-v21'
const POSITIVE_TTL_SECONDS = 86_400
const EMPTY_TTL_SECONDS = 900
const DISCOVER_TTL_SECONDS = 900
const DISCOVER_SEED_BUCKETS = 32
const MAX_QUERY_LENGTH = 120
const MAX_SUBREQUESTS = 36
const MAX_CONCURRENCY = 4
const PROVIDER_TIMEOUT_MS = 3_000
const TOTAL_TIMEOUT_MS = 8_000
const MAX_PROVIDER_BODY_BYTES = 1_048_576
const MAX_RESULT_LIMIT = 48
const SEARCH_TYPES = new Set(['any', 'watch', 'game', 'book', 'movie', 'series', 'anime', 'manga', 'manhwa', 'animeManga'])
const DISCOVER_TYPES = new Set(['any', 'movie', 'series', 'animeManga', 'game', 'book'])
const DISCOVER_DURATIONS = new Set(['any', 'short', 'medium', 'long'])

export default {
  async fetch(request, env, ctx) {
    const startedAt = Date.now()
    const cors = getCorsHeaders(request, env)
    const corsHeaders = cors.headers
    const url = new URL(request.url)

    if (!cors.allowed) {
      return json({ error: 'origin_not_allowed' }, corsHeaders, 403)
    }

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }

    if (url.pathname === '/health') {
      if (request.method !== 'GET') {
        return json({ error: 'method_not_allowed' }, corsHeaders, 405, { allow: 'GET' })
      }
      return json({
        ok: true,
        version: env.NEXO_VERSION || 'unknown',
        revision: env.BUILD_SHA || env.CF_VERSION_METADATA?.id || 'unknown',
        providerVersion: PROVIDER_VERSION,
      }, corsHeaders, 200, { 'cache-control': 'no-store' })
    }

    try {
      const isDiscoverRoute = url.pathname === '/discover' || url.pathname === '/v1/catalog/discover'
      const isSearchRoute = url.pathname === '/search' || url.pathname === '/v1/catalog/search'

      if (request.method === 'GET' && isDiscoverRoute) {
        if (!(await isRateLimitAllowed(env.DISCOVER_RATE_LIMITER, request, 'discover'))) {
          return json({ error: 'rate_limited' }, corsHeaders, 429, { 'retry-after': '60' })
        }
        const runtime = createRequestRuntime('discover')
        return await handleDiscover(request, env, ctx, corsHeaders, url, runtime, startedAt)
      }

      if (request.method !== 'GET' || !isSearchRoute) {
        return json({ error: 'not_found' }, corsHeaders, 404)
      }

      const query = url.searchParams.get('q')?.trim() ?? ''
      if (query.length > MAX_QUERY_LENGTH) {
        return json({ error: 'query_too_long' }, corsHeaders, 400)
      }
      const type = url.searchParams.get('type')?.trim() || 'any'
      if (!SEARCH_TYPES.has(type)) {
        return json({ error: 'invalid_type' }, corsHeaders, 400)
      }
      const limit = parseResultLimit(url.searchParams.get('limit'))
      if (limit === undefined) {
        return json({ error: 'invalid_limit' }, corsHeaders, 400)
      }
      if (query.length < 2) {
        return json({ results: [] }, corsHeaders, 200, { 'x-nexo-cache': 'bypass' })
      }
      if (!(await isRateLimitAllowed(env.SEARCH_RATE_LIMITER, request, 'search'))) {
        return json({ error: 'rate_limited' }, corsHeaders, 429, { 'retry-after': '60' })
      }

      const runtime = createRequestRuntime('search')
      return await handleSearch(request, env, ctx, corsHeaders, query, type, limit, runtime, startedAt)
    } catch (error) {
      console.error(JSON.stringify({
        event: 'catalog_request_failed',
        route: url.pathname.endsWith('/discover') ? 'discover' : url.pathname.endsWith('/search') ? 'search' : 'other',
        reason: readErrorName(error),
        durationMs: Date.now() - startedAt,
      }))
      const status = error instanceof RequestDeadlineError ? 504 : 500
      return json({ error: status === 504 ? 'upstream_timeout' : 'internal' }, corsHeaders, status)
    }
  },
}

async function handleSearch(request, env, ctx, corsHeaders, query, type, limit, runtime, startedAt) {
  const cache = caches.default
  const cacheRequest = createCacheRequest(request, query, type, limit)
  const cachedResponse = await runtime.cacheMatch(cache, cacheRequest)
  const cachedPayload = await readCachedPayload(cachedResponse, runtime)
  if (cachedPayload !== undefined) {
    logRequestCompleted(runtime, 200, Array.isArray(cachedPayload.results) ? cachedPayload.results.length : 0, startedAt)
    return json(cachedPayload, corsHeaders, 200, {
      'cache-control': cachedResponse.headers.get('cache-control') ?? `public, max-age=${POSITIVE_TTL_SECONDS}`,
      'x-nexo-cache': 'hit',
      'x-nexo-subrequests': String(runtime.subrequestCount),
    })
  }

  const candidates = await searchProviders(query, type, env, runtime)
  const results = rankSearchCandidates(uniqueCandidates(candidates), query, type).slice(0, limit)
  const payload = { results }
  const ttl = results.length ? POSITIVE_TTL_SECONDS : EMPTY_TTL_SECONDS
  const partial = runtime.providerFailures > 0
  if (!partial) scheduleCacheWrite(ctx, runtime, cache, cacheRequest, payload, ttl)
  logRequestCompleted(runtime, 200, results.length, startedAt)
  return json(payload, corsHeaders, 200, {
    'cache-control': partial ? 'no-store' : `public, max-age=${ttl}`,
    'x-nexo-cache': 'miss',
    'x-nexo-partial': partial ? 'true' : 'false',
    'x-nexo-subrequests': String(runtime.subrequestCount),
  })
}

async function handleDiscover(request, env, ctx, corsHeaders, url, runtime, startedAt) {
  const type = url.searchParams.get('type')?.trim() || 'any'
  if (!DISCOVER_TYPES.has(type)) {
    return json({ error: 'invalid_type' }, corsHeaders, 400)
  }
  const duration = url.searchParams.get('duration')?.trim() || 'any'
  if (!DISCOVER_DURATIONS.has(duration)) {
    return json({ error: 'invalid_duration' }, corsHeaders, 400)
  }
  const rawSeed = url.searchParams.get('seed')?.trim() || new Date().toISOString().slice(0, 13)
  if (rawSeed.length > MAX_QUERY_LENGTH) {
    return json({ error: 'seed_too_long' }, corsHeaders, 400)
  }
  const seed = normalizeCacheKeyPart(rawSeed)
  const seedBucket = getSeedBucket(seed)
  const cacheSeed = `${type}:${duration}:${seedBucket}`
  const cache = caches.default
  const cacheRequest = createDiscoverCacheRequest(request, type, duration, seedBucket)
  const cachedResponse = await runtime.cacheMatch(cache, cacheRequest)
  const cachedPayload = await readCachedPayload(cachedResponse, runtime)
  if (cachedPayload !== undefined) {
    logRequestCompleted(runtime, 200, cachedPayload.result ? 1 : 0, startedAt)
    return json(cachedPayload, corsHeaders, 200, {
      'cache-control': cachedResponse.headers.get('cache-control') ?? `public, max-age=${DISCOVER_TTL_SECONDS}`,
      'x-nexo-cache': 'hit',
      'x-nexo-subrequests': String(runtime.subrequestCount),
    })
  }

  const result = await discoverCandidate(type, duration, cacheSeed, env, runtime)
  const payload = { result: result ?? null }
  const ttl = result ? DISCOVER_TTL_SECONDS : EMPTY_TTL_SECONDS
  const partial = runtime.providerFailures > 0
  if (!partial) scheduleCacheWrite(ctx, runtime, cache, cacheRequest, payload, ttl)

  logRequestCompleted(runtime, 200, result ? 1 : 0, startedAt)
  return json(payload, corsHeaders, 200, {
    'cache-control': partial ? 'no-store' : `public, max-age=${ttl}`,
    'x-nexo-cache': 'miss',
    'x-nexo-partial': partial ? 'true' : 'false',
    'x-nexo-subrequests': String(runtime.subrequestCount),
  })
}

async function discoverCandidate(type, duration, seed, env, runtime) {
  const queries = getDiscoverQueries(type, duration, seed).slice(0, 3)
  const groups = await Promise.allSettled(queries.map((query) => searchProviders(query, discoverTypeToSearchType(type), env, runtime)))
  const candidates = uniqueCandidates(groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))).filter((candidate) =>
    Boolean(candidate.posterUrl),
  )
  if (!candidates.length) return undefined
  return candidates[hashSeed(seed) % candidates.length]
}

async function searchProviders(query, type, env, runtime) {
  const tasks = []
  const addTask = (provider, promise) => tasks.push({ provider, promise })
  if (type === 'watch' || type === 'movie' || type === 'series' || type === 'any') {
    addTask('tmdb', searchTmdb(query, env, type, runtime))
  }
  if (type === 'watch' || type === 'anime' || type === 'animeManga' || type === 'any') {
    addTask('anilist', searchAniList(query, 'anime', 'anime', runtime))
    addTask('jikan', searchJikan(query, 'anime', runtime))
  }
  if (type === 'watch' || type === 'manga' || type === 'manhwa' || type === 'animeManga' || type === 'any') {
    const mangaFilter = type === 'manga' || type === 'manhwa' ? type : 'allManga'
    addTask('anilist', searchAniList(query, 'manga', mangaFilter, runtime))
    addTask('kitsu', searchKitsuManga(query, mangaFilter, runtime))
    addTask('jikan', searchJikan(query, mangaFilter, runtime))
  }
  if (type === 'book' || type === 'any') {
    addTask('googleBooks', searchGoogleBooks(query, env, runtime))
    addTask('openLibrary', searchOpenLibrary(query, runtime))
  }
  if (type === 'game' || type === 'any') {
    addTask('rawg', searchRawg(query, env, runtime))
    addTask('wikidata', searchWikidataGames(query, runtime))
  }

  const groups = await Promise.allSettled(tasks.map((task) => task.promise))
  groups.forEach((group, index) => {
    if (group.status === 'rejected') runtime.addProviderFailure(tasks[index].provider)
  })
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

async function searchTmdb(query, env, requestedType = 'watch', runtime) {
  const token = env.TMDB_READ_TOKEN || env.TMDB_TOKEN
  if (!token) return []

  const url = new URL('https://api.themoviedb.org/3/search/multi')
  url.searchParams.set('query', query)
  url.searchParams.set('language', 'es-ES')
  url.searchParams.set('include_adult', 'false')

  const { ok, payload } = await runtime.fetchJson(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  })
  if (!ok) return []
  const baseEntries = (payload.results ?? [])
    .filter((entry) => {
      if (requestedType === 'movie') return entry.media_type === 'movie'
      if (requestedType === 'series') return entry.media_type === 'tv'
      return entry.media_type === 'movie' || entry.media_type === 'tv'
    })

  const detailed = await Promise.allSettled(baseEntries.slice(0, 8).map((entry) => tmdbEntryToCandidate(entry, token, runtime)))
  runtime.addProviderFailures(detailed.filter((result) => result.status === 'rejected').length, 'tmdb')
  return detailed.flatMap((result) => (result.status === 'fulfilled' && result.value ? [result.value] : []))
}

async function tmdbEntryToCandidate(entry, token, runtime) {
  const mediaType = entry.media_type === 'tv' ? 'series' : 'movie'
  const tmdbMediaType = entry.media_type === 'tv' ? 'tv' : 'movie'
  const date = entry.release_date || entry.first_air_date || ''
  const id = String(entry.id)
  const genres = Array.isArray(entry.genre_ids)
    ? entry.genre_ids.flatMap((genreId) => TMDB_GENRES[Number(genreId)] ?? [])
    : []
  const detail = await fetchTmdbJson(`/${tmdbMediaType}/${id}`, token, {
    append_to_response: 'external_ids',
    language: CACHE_LANGUAGE,
  }, runtime)
  const wikidataId = optionalString(detail?.external_ids?.wikidata_id)
  const releaseYear = parseYear(detail?.release_date || detail?.first_air_date || date)
  const progressMeta = tmdbMediaType === 'movie'
    ? readProgressMeta(roundRuntimeHours(detail?.runtime), 'hours')
    : readProgressMeta(readTmdbSeriesEpisodeTotal(detail), 'episodes')

  return {
    id: `tmdb-${entry.media_type}-${id}`,
    title: String(detail?.title || detail?.name || entry.title || entry.name || 'Sin titulo'),
    type: mediaType,
    source: 'tmdb',
    sourceId: id,
    overview: optionalString(detail?.overview) || optionalString(entry.overview),
    posterUrl: detail?.poster_path ? `https://image.tmdb.org/t/p/w342${detail.poster_path}` : entry.poster_path ? `https://image.tmdb.org/t/p/w342${entry.poster_path}` : undefined,
    releaseYear,
    progressTotal: progressMeta?.total,
    progressUnit: progressMeta?.unit,
    genres,
    externalRefs: {
      tmdbId: id,
      wikidataId,
      sourceUrl: `https://www.themoviedb.org/${entry.media_type}/${id}`,
    },
    createdAt: new Date().toISOString(),
  }
}

async function fetchTmdbJson(path, token, params = {}, runtime) {
  const url = new URL(`https://api.themoviedb.org/3${path}`)
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value))
  }
  const { ok, payload } = await runtime.fetchJson(url, {
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
    },
  })
  return ok ? payload : undefined
}

function readTmdbSeriesEpisodeTotal(detail) {
  if (typeof detail?.number_of_episodes === 'number' && Number.isFinite(detail.number_of_episodes) && detail.number_of_episodes > 0) {
    return detail.number_of_episodes
  }
  if (!Array.isArray(detail?.seasons)) return undefined

  const total = detail.seasons
    .filter((season) => typeof season?.season_number === 'number' && season.season_number > 0)
    .reduce((sum, season) => {
      const episodeCount = typeof season.episode_count === 'number' && Number.isFinite(season.episode_count) ? season.episode_count : 0
      return sum + Math.max(0, episodeCount)
    }, 0)
  return total > 0 ? total : undefined
}

async function searchRawg(query, env, runtime) {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) return []

  const url = new URL('https://api.rawg.io/api/games')
  url.searchParams.set('key', apiKey)
  url.searchParams.set('search', query)
  url.searchParams.set('page_size', '8')

  const { ok, payload } = await runtime.fetchJson(url)
  if (!ok) return []
  return (payload.results ?? []).slice(0, 8).map((entry) => rawgEntryToCandidate(entry))
}

function rawgEntryToCandidate(entry) {
  const id = String(entry.id)
  const title = String(entry.name || 'Sin titulo')
  const releaseYear = parseYear(entry.released)

  return {
    id: `rawg-${id}`,
    title,
    type: 'game',
    source: 'rawg',
    sourceId: id,
    posterUrl: optionalString(entry.background_image),
    releaseYear,
    progressTotal: typeof entry.playtime === 'number' && entry.playtime > 0 ? entry.playtime : undefined,
    progressUnit: typeof entry.playtime === 'number' && entry.playtime > 0 ? 'hours' : undefined,
    genres: Array.isArray(entry.genres)
      ? entry.genres.map((genre) => String(genre.name || '')).filter(Boolean).slice(0, 5)
      : [],
    externalRefs: {
      rawgId: id,
      sourceUrl: entry.slug ? `https://rawg.io/games/${entry.slug}` : 'https://rawg.io/',
    },
    createdAt: new Date().toISOString(),
  }
}

async function searchOpenLibrary(query, runtime) {
  const url = new URL('https://openlibrary.org/search.json')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('fields', 'key,title,author_name,first_publish_year,cover_i,subject,number_of_pages_median')

  const { ok, payload } = await runtime.fetchJson(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Nexo/1.0 (https://nexo.codeoverdose.es)',
    },
  })
  if (!ok) return []
  return (payload.docs ?? []).flatMap((entry) => {
    const key = optionalString(entry.key)
    if (!key) return []
    const authors = Array.isArray(entry.author_name) ? entry.author_name.map(String).slice(0, 2) : []
    const title = [String(entry.title || 'Sin titulo'), authors.join(', ')].filter(Boolean).join(' - ')
    const releaseYear = typeof entry.first_publish_year === 'number' ? entry.first_publish_year : undefined
    return [{
      id: `open-library-${key.replace(/\//g, '-')}`,
      title,
      type: 'book',
      source: 'openLibrary',
      sourceId: key,
      posterUrl: entry.cover_i ? `https://covers.openlibrary.org/b/id/${entry.cover_i}-M.jpg` : undefined,
      releaseYear,
      progressTotal: typeof entry.number_of_pages_median === 'number' ? entry.number_of_pages_median : undefined,
      progressUnit: typeof entry.number_of_pages_median === 'number' ? 'pages' : undefined,
      genres: Array.isArray(entry.subject) ? entry.subject.map(String).slice(0, 5) : [],
      externalRefs: {
        openLibraryKey: key,
        sourceUrl: `https://openlibrary.org${key}`,
      },
      createdAt: new Date().toISOString(),
    }]
  }).slice(0, 8)
}

async function searchGoogleBooks(query, env, runtime) {
  const apiKey = optionalString(env.GOOGLE_BOOKS_API_KEY)
  if (!apiKey) return []

  const url = new URL('https://www.googleapis.com/books/v1/volumes')
  url.searchParams.set('q', query)
  url.searchParams.set('maxResults', '8')
  url.searchParams.set('printType', 'books')
  url.searchParams.set('orderBy', 'relevance')
  url.searchParams.set('country', 'ES')
  url.searchParams.set('key', apiKey)
  url.searchParams.set(
    'fields',
    'items(id,volumeInfo(title,subtitle,authors,publishedDate,description,pageCount,categories,imageLinks/thumbnail,infoLink,canonicalVolumeLink,industryIdentifiers))',
  )

  const { ok, payload } = await runtime.fetchJson(url, {
    headers: {
      accept: 'application/json',
      'user-agent': 'Nexo/1.0 (https://nexo.codeoverdose.es)',
    },
  })
  if (!ok) return []
  return (payload.items ?? []).slice(0, 8).map((entry) => {
    const info = entry.volumeInfo ?? {}
    const authors = Array.isArray(info.authors) ? info.authors.map(String).slice(0, 3) : []
    const titleOnly = optionalString(info.title) || 'Sin titulo'
    const subtitle = optionalString(info.subtitle)
    const title = [subtitle ? `${titleOnly}: ${subtitle}` : titleOnly, authors.join(', ')].filter(Boolean).join(' - ')
    const id = String(entry.id || '')
    const thumbnail = optionalString(info.imageLinks?.thumbnail)?.replace(/^http:\/\//, 'https://')
    const releaseYear = parseYear(info.publishedDate)
    const identifiers = Array.isArray(info.industryIdentifiers)
      ? info.industryIdentifiers
          .map((identifier) => optionalString(identifier?.identifier))
          .filter(Boolean)
          .slice(0, 4)
      : []

    return {
      id: `google-books-${id}`,
      title,
      type: 'book',
      source: 'googleBooks',
      sourceId: id,
      overview: optionalString(info.description),
      posterUrl: thumbnail,
      releaseYear,
      progressTotal: typeof info.pageCount === 'number' && info.pageCount > 0 ? info.pageCount : undefined,
      progressUnit: typeof info.pageCount === 'number' && info.pageCount > 0 ? 'pages' : undefined,
      genres: Array.isArray(info.categories) ? info.categories.map(String).slice(0, 5) : [],
      searchAliases: uniqueStrings([titleOnly, subtitle, ...authors, ...identifiers]),
      externalRefs: {
        googleBooksId: id,
        sourceUrl: optionalString(info.canonicalVolumeLink) || optionalString(info.infoLink) || `https://books.google.com/books?id=${id}`,
      },
      createdAt: new Date().toISOString(),
    }
  })
}

async function searchAniList(query, requestedType, requestedFilter = requestedType, runtime) {
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
          }
        }
      }
    `,
    variables: {
      search: query,
      type: requestedType === 'anime' ? 'ANIME' : 'MANGA',
    },
  }

  const { ok, payload } = await runtime.fetchJson('https://graphql.anilist.co', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json' },
    body: JSON.stringify(graphql),
  })
  if (!ok) return []
  return (payload.data?.Page?.media ?? [])
    .map((entry) => {
      const inferredType = inferAniListType(requestedType, entry)
      return { entry, inferredType }
    })
    .filter(({ inferredType }) => matchesAnimeMangaFilter(inferredType, requestedFilter))
    .map(({ entry, inferredType }) => {
      const title = entry.title || {}
      const aliases = uniqueStrings([title.english, title.romaji, title.native])
      const progressMeta = readAniListProgressMeta(inferredType, entry)
      return {
        id: `anilist-${entry.id}`,
        title: title.english || title.romaji || title.native || 'Sin titulo',
        type: inferredType,
        source: 'anilist',
        sourceId: String(entry.id),
        overview: optionalString(entry.description),
        posterUrl: optionalString(entry.coverImage?.medium),
        releaseYear: typeof entry.startDate?.year === 'number' ? entry.startDate.year : undefined,
        progressTotal: progressMeta?.total,
        progressUnit: progressMeta?.unit,
        genres: Array.isArray(entry.genres) ? entry.genres.map(String) : [],
        searchAliases: aliases,
        externalRefs: {
          anilistId: String(entry.id),
          sourceUrl: optionalString(entry.siteUrl) || `https://anilist.co/${inferredType === 'anime' ? 'anime' : 'manga'}/${entry.id}`,
        },
        createdAt: new Date().toISOString(),
      }
    })
}

async function searchJikan(query, requestedFilter, runtime) {
  const endpoint = requestedFilter === 'anime' ? 'anime' : 'manga'
  const url = new URL(`https://api.jikan.moe/v4/${endpoint}`)
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '8')
  url.searchParams.set('sfw', 'true')

  const { ok, payload } = await runtime.fetchJson(url, { headers: { accept: 'application/json' } })
  if (!ok) return []
  const entries = (payload.data ?? [])
    .map((entry) => {
      const inferredType = inferJikanType(endpoint, entry)
      return { entry, inferredType }
    })
    .filter(({ inferredType }) => matchesAnimeMangaFilter(inferredType, requestedFilter))
    .filter(({ entry }) => Boolean(entry?.mal_id))
    .slice(0, 8)

  return entries.map(({ entry, inferredType }) => {
      const id = String(entry.mal_id || '')
      const aliases = readJikanTitleAliases(entry)
      const progressMeta = readJikanProgressMeta(inferredType, entry)
      return {
        id: `jikan-${id}`,
        title: optionalString(entry.title_english) || optionalString(entry.title) || 'Sin titulo',
        type: inferredType,
        source: 'jikan',
        sourceId: id,
        overview: optionalString(entry.synopsis),
        posterUrl: optionalString(entry.images?.jpg?.image_url),
        releaseYear: readJikanReleaseYear(entry),
        progressTotal: progressMeta?.total,
        progressUnit: progressMeta?.unit,
        genres: Array.isArray(entry.genres)
          ? entry.genres.map((genre) => String(genre.name || '')).filter(Boolean).slice(0, 8)
          : [],
        searchAliases: aliases,
        externalRefs: {
          malId: id,
          sourceUrl: optionalString(entry.url) || `https://myanimelist.net/${inferredType === 'anime' ? 'anime' : 'manga'}/${id}`,
        },
        createdAt: new Date().toISOString(),
      }
    })
}

async function searchKitsuManga(query, requestedFilter, runtime) {
  const url = new URL('https://kitsu.io/api/edge/manga')
  url.searchParams.set('filter[text]', query)
  url.searchParams.set('page[limit]', '8')

  const { ok, payload } = await runtime.fetchJson(url, {
    headers: {
      accept: 'application/vnd.api+json',
      'user-agent': 'Nexo/1.0 (https://nexo.codeoverdose.es)',
    },
  })
  if (!ok) return []
  return (payload.data ?? [])
    .map((entry) => {
      const inferredType = inferKitsuType(entry)
      return { entry, inferredType }
    })
    .filter(({ inferredType }) => inferredType && matchesAnimeMangaFilter(inferredType, requestedFilter))
    .map(({ entry, inferredType }) => {
      const id = String(entry.id || '')
      const attributes = entry.attributes ?? {}
      const aliases = collectKitsuTitleAliases(attributes)
      const title = pickKitsuTitle(attributes, query, aliases)
      const slug = optionalString(attributes.slug)
      return {
        id: `kitsu-${id}`,
        title,
        type: inferredType,
        source: 'kitsu',
        sourceId: id,
        overview: optionalString(attributes.synopsis),
        posterUrl: optionalString(attributes.posterImage?.small) || optionalString(attributes.posterImage?.medium),
        releaseYear: parseYear(attributes.startDate),
        genres: [],
        searchAliases: aliases,
        externalRefs: {
          kitsuId: id,
          sourceUrl: slug ? `https://kitsu.io/manga/${slug}` : `https://kitsu.io/manga/${id}`,
        },
        createdAt: new Date().toISOString(),
      }
    })
    .filter((candidate) => Boolean(candidate.sourceId))
}

function inferAniListType(requestedType, entry) {
  if (requestedType === 'anime') return inferAniListMediaType('ANIME', entry)
  return inferAniListMediaType('MANGA', entry)
}

function inferAniListMediaType(mediaType, entry) {
  if (mediaType === 'ANIME') return 'anime'
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

function inferKitsuType(entry) {
  const subtype = String(entry.attributes?.subtype || '').toLowerCase()
  if (subtype === 'manhwa') return 'manhwa'
  if (subtype === 'novel') return undefined
  return 'manga'
}

function matchesAnimeMangaFilter(type, requestedFilter) {
  if (requestedFilter === 'allManga') return type === 'manga' || type === 'manhwa'
  return type === requestedFilter
}

function readJikanReleaseYear(entry) {
  if (typeof entry.year === 'number') return entry.year
  return entry.published?.prop?.from?.year || entry.aired?.prop?.from?.year
}

function readAniListProgressMeta(type, entry) {
  if (type === 'anime') return readProgressMeta(entry.episodes, 'episodes')
  return readProgressMeta(entry.chapters, 'chapters') || readProgressMeta(entry.volumes, 'volumes')
}

function readJikanProgressMeta(type, entry) {
  if (type === 'anime') return readProgressMeta(entry.episodes, 'episodes')
  return readProgressMeta(entry.chapters, 'chapters') || readProgressMeta(entry.volumes, 'volumes')
}

function readProgressMeta(value, unit) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? { total: value, unit } : undefined
}

function roundRuntimeHours(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return undefined
  return Math.round((value / 60) * 10) / 10
}

function readJikanTitleAliases(entry) {
  const typedTitles = Array.isArray(entry.titles)
    ? entry.titles.map((titleEntry) => optionalString(titleEntry?.title)).filter(Boolean)
    : []
  return uniqueStrings([entry.title, entry.title_english, entry.title_japanese, ...typedTitles])
}

function collectKitsuTitleAliases(attributes) {
  const titles = attributes.titles && typeof attributes.titles === 'object' ? Object.values(attributes.titles) : []
  const abbreviated = Array.isArray(attributes.abbreviatedTitles) ? attributes.abbreviatedTitles : []
  return uniqueStrings([attributes.canonicalTitle, ...titles, ...abbreviated])
}

function pickKitsuTitle(attributes, query, aliases) {
  const queryText = normalizeSearchText(query)
  const queryCompact = compactSearchText(query)
  const exactAlias = aliases.find((alias) => {
    const aliasText = normalizeSearchText(alias)
    return aliasText === queryText || compactSearchText(aliasText) === queryCompact
  })
  if (exactAlias) return exactAlias

  const titles = attributes.titles && typeof attributes.titles === 'object' ? attributes.titles : {}
  return (
    optionalString(titles.es_es) ||
    optionalString(titles.en_us) ||
    optionalString(titles.en_jp) ||
    optionalString(attributes.canonicalTitle) ||
    optionalString(Object.values(titles)[0]) ||
    'Sin titulo'
  )
}

async function searchWikidataGames(query, runtime) {
  const url = new URL('https://www.wikidata.org/w/api.php')
  url.searchParams.set('action', 'wbsearchentities')
  url.searchParams.set('search', query)
  url.searchParams.set('language', 'en')
  url.searchParams.set('format', 'json')
  url.searchParams.set('origin', '*')
  url.searchParams.set('limit', '8')

  const { ok, payload } = await runtime.fetchJson(url)
  if (!ok) return []
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

class SubrequestBudgetError extends Error {
  constructor() {
    super('Subrequest budget exhausted')
    this.name = 'SubrequestBudgetError'
  }
}

class RequestDeadlineError extends Error {
  constructor() {
    super('Request deadline exceeded')
    this.name = 'RequestDeadlineError'
  }
}

class ProviderBodyTooLargeError extends Error {
  constructor() {
    super('Provider response body exceeded the allowed size')
    this.name = 'ProviderBodyTooLargeError'
  }
}

class ProviderHttpError extends Error {
  constructor(status) {
    super(`Provider returned HTTP ${status}`)
    this.name = 'ProviderHttpError'
    this.status = status
  }
}

function createRequestRuntime(route) {
  const deadlineAt = Date.now() + TOTAL_TIMEOUT_MS
  const waiters = []
  let active = 0
  const failedProviders = new Set()
  let subrequestCount = 0

  function consumeSubrequest() {
    if (subrequestCount >= MAX_SUBREQUESTS) throw new SubrequestBudgetError()
    subrequestCount += 1
  }

  async function acquireSlot() {
    if (Date.now() >= deadlineAt) throw new RequestDeadlineError()
    if (active < MAX_CONCURRENCY) {
      active += 1
      return
    }

    await new Promise((resolve, reject) => {
      const waiter = { resolve, reject, timer: undefined }
      const remaining = Math.max(1, deadlineAt - Date.now())
      waiter.timer = setTimeout(() => {
        const index = waiters.indexOf(waiter)
        if (index >= 0) waiters.splice(index, 1)
        reject(new RequestDeadlineError())
      }, remaining)
      waiters.push(waiter)
    })
  }

  function releaseSlot() {
    const waiter = waiters.shift()
    if (waiter) {
      clearTimeout(waiter.timer)
      waiter.resolve()
      return
    }
    active = Math.max(0, active - 1)
  }

  async function boundedFetchJson(input, init = {}) {
    consumeSubrequest()
    await acquireSlot()
    const remaining = deadlineAt - Date.now()
    if (remaining <= 0) {
      releaseSlot()
      throw new RequestDeadlineError()
    }

    const operationDeadlineAt = Math.min(deadlineAt, Date.now() + PROVIDER_TIMEOUT_MS)
    const controller = new AbortController()
    const abortFromCaller = () => controller.abort(init.signal?.reason)
    if (init.signal?.aborted) abortFromCaller()
    else init.signal?.addEventListener('abort', abortFromCaller, { once: true })
    const timeout = setTimeout(
      () => controller.abort(new RequestDeadlineError()),
      Math.max(1, operationDeadlineAt - Date.now()),
    )

    try {
      const response = await raceWithAbort(fetch(input, { ...init, signal: controller.signal }), controller.signal)
      assertOperationActive(controller.signal, operationDeadlineAt)
      const bodyText = await readBoundedResponseText(response, controller.signal)
      assertOperationActive(controller.signal, operationDeadlineAt)

      if (!response.ok) throw new ProviderHttpError(response.status)

      const payload = JSON.parse(bodyText)
      assertOperationActive(controller.signal, operationDeadlineAt)
      return { ok: true, payload, status: response.status }
    } finally {
      clearTimeout(timeout)
      init.signal?.removeEventListener('abort', abortFromCaller)
      releaseSlot()
    }
  }

  return {
    route,
    get providerFailures() {
      return failedProviders.size
    },
    get failedProviders() {
      return [...failedProviders]
    },
    get subrequestCount() {
      return subrequestCount
    },
    addProviderFailure(provider) {
      failedProviders.add(provider)
    },
    addProviderFailures(count, provider = 'unknown') {
      if (count > 0) failedProviders.add(provider)
    },
    async cacheMatch(cache, request) {
      consumeSubrequest()
      return cache.match(request)
    },
    async cachePut(cache, request, response) {
      consumeSubrequest()
      return cache.put(request, response)
    },
    fetchJson: boundedFetchJson,
  }
}

async function readBoundedResponseText(response, signal) {
  const declaredLength = Number(response.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_BODY_BYTES) {
    await response.body?.cancel(new ProviderBodyTooLargeError()).catch(() => undefined)
    throw new ProviderBodyTooLargeError()
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await raceWithAbort(reader.read(), signal)
      if (done) break
      if (!value || typeof value.byteLength !== 'number') throw new TypeError('Provider response body was not binary data')
      const chunk = value instanceof Uint8Array ? value : new Uint8Array(value)
      totalBytes += chunk.byteLength
      if (totalBytes > MAX_PROVIDER_BODY_BYTES) {
        const error = new ProviderBodyTooLargeError()
        await reader.cancel(error).catch(() => undefined)
        throw error
      }
      chunks.push(chunk)
    }
  } catch (error) {
    await reader.cancel(error).catch(() => undefined)
    throw error
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

function raceWithAbort(promise, signal) {
  if (signal.aborted) return Promise.reject(readAbortReason(signal))

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      signal.removeEventListener('abort', onAbort)
      callback(value)
    }
    const onAbort = () => finish(reject, readAbortReason(signal))

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error),
    )
  })
}

function assertOperationActive(signal, deadlineAt) {
  if (signal.aborted) throw readAbortReason(signal)
  if (Date.now() >= deadlineAt) throw new RequestDeadlineError()
}

function readAbortReason(signal) {
  return signal.reason instanceof Error ? signal.reason : new RequestDeadlineError()
}

async function readCachedPayload(response, runtime) {
  if (!response) return undefined
  try {
    const payload = await response.json()
    const valid = runtime.route === 'search'
      ? payload && typeof payload === 'object' && Array.isArray(payload.results)
      : payload && typeof payload === 'object' && Object.hasOwn(payload, 'result')
    if (!valid) throw new TypeError('Invalid catalog cache payload')
    return payload
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'catalog_cache_corrupt',
      route: runtime.route,
      reason: readErrorName(error),
    }))
    return undefined
  }
}

function scheduleCacheWrite(ctx, runtime, cache, request, payload, ttl) {
  const response = new Response(JSON.stringify(payload), {
    headers: {
      'cache-control': `public, max-age=${ttl}`,
      'content-type': 'application/json; charset=utf-8',
    },
  })
  const write = runtime.cachePut(cache, request, response).catch((error) => {
    console.warn(JSON.stringify({
      event: 'catalog_cache_write_failed',
      route: runtime.route,
      reason: readErrorName(error),
    }))
  })
  if (ctx?.waitUntil) ctx.waitUntil(write)
  else void write
}

async function isRateLimitAllowed(binding, request, route) {
  if (!binding?.limit) return true
  const key = await createRateLimitKey(request, route)
  const result = await binding.limit({ key })
  return Boolean(result?.success)
}

async function createRateLimitKey(request, route) {
  const clientAddress = request.headers.get('cf-connecting-ip') || 'anonymous'
  const bytes = new TextEncoder().encode(`${route}:${clientAddress}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hash = [...new Uint8Array(digest)]
    .slice(0, 16)
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')
  return `${route}:${hash}`
}

function logRequestCompleted(runtime, status, resultCount, startedAt) {
  console.log(JSON.stringify({
    event: 'catalog_request_completed',
    route: runtime.route,
    status,
    resultCount,
    partial: runtime.providerFailures > 0,
    providerFailures: runtime.providerFailures,
    failedProviders: runtime.failedProviders,
    subrequests: runtime.subrequestCount,
    durationMs: Date.now() - startedAt,
  }))
}

function readErrorName(error) {
  return error instanceof Error && error.name ? error.name : 'UnknownError'
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get('origin') ?? ''
  const allowedOrigins = (env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
  const allowed = !origin || allowedOrigins.includes(origin)
  const headers = {
    'access-control-allow-headers': 'content-type, accept',
    'access-control-allow-methods': 'GET, OPTIONS',
    vary: 'Origin',
  }
  if (origin && allowed) headers['access-control-allow-origin'] = origin
  return { allowed, headers }
}

function createCacheRequest(request, query, type, limit) {
  const normalizedQuery = normalizeCacheKeyPart(query)
  return new Request(
    `https://nexo-catalog-cache.local/search?v=${PROVIDER_VERSION}&language=${CACHE_LANGUAGE}&type=${type}&limit=${limit}&q=${encodeURIComponent(normalizedQuery)}`,
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

function parseResultLimit(value) {
  if (value === null || value.trim() === '') return 24
  if (!/^\d+$/.test(value)) return undefined
  const limit = Number(value)
  return limit >= 1 && limit <= MAX_RESULT_LIMIT ? limit : undefined
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
      'x-nexo-provider-version': PROVIDER_VERSION,
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
  'mas',
  'mi',
  'mia',
  'mio',
  'mis',
  'no',
  'of',
  'on',
  'para',
  'por',
  'princess',
  'que',
  'se',
  'sin',
  'star',
  'su',
  'sus',
  'te',
  'the',
  'to',
  'tu',
  'un',
  'una',
  'uno',
  'upon',
  'wa',
  'wish',
  'with',
  'y',
])

const SOURCE_PRIORITY = {
  anilist: 1,
  jikan: 2,
  kitsu: 3,
  tmdb: 5,
  googleBooks: 6,
  openLibrary: 7,
  rawg: 8,
  wikidata: 9,
}

function rankSearchCandidates(candidates, query, requestedType) {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreSearchCandidate(query, candidate, requestedType),
    }))
    .filter((entry) => entry.score > 0)
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
  const titleFields = [candidate.title, ...(candidate.searchAliases ?? [])].filter(Boolean)
  const allFields = [
    ...titleFields,
    candidate.overview,
    candidate.type,
    candidate.source,
    candidate.sourceId,
    candidate.releaseYear ? String(candidate.releaseYear) : undefined,
    ...(candidate.genres ?? []),
    ...Object.values(candidate.externalRefs ?? {}),
  ].filter(Boolean)
  const sourceFields = Object.values(candidate.externalRefs ?? {}).filter(Boolean)
  const normalizedTitleFields = titleFields.map(normalizeSearchText).filter(Boolean)
  const compactTitleFields = titleFields.map(compactSearchText).filter(Boolean)
  const normalizedAllFields = allFields.map(normalizeSearchText).filter(Boolean)
  const normalizedTitleTokenFields = new Set(normalizedTitleFields.flatMap(tokenizeSearchText))
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
    if (queryText.includes(titleText) && compactTitle.length >= 4) phraseScore = Math.max(phraseScore, 620)
  }

  for (const field of sourceFields) {
    const normalizedField = normalizeSearchText(field)
    const compactField = compactSearchText(field)
    if (normalizedField.includes(queryText)) phraseScore = Math.max(phraseScore, 720)
    if (compactField.includes(queryCompact)) phraseScore = Math.max(phraseScore, 700)
  }

  score += phraseScore

  let highSignalHits = 0
  let lowSignalHits = 0
  let titleHighSignalHits = 0
  let titleLowSignalHits = 0
  let highSignalQueryTokens = 0
  for (const token of queryTokens) {
    if (!LOW_SIGNAL_TOKENS.has(token)) highSignalQueryTokens += 1
    const hasTitleToken = normalizedTitleTokenFields.has(token) || normalizedTitleFields.some((field) => isSearchTokenSubstringHit(token, field))
    const hasToken = hasTitleToken || normalizedTokenFields.has(token) || normalizedAllFields.some((field) => isSearchTokenSubstringHit(token, field))
    if (!hasToken) continue
    if (LOW_SIGNAL_TOKENS.has(token)) {
      lowSignalHits += 1
      if (hasTitleToken) titleLowSignalHits += 1
    } else {
      highSignalHits += 1
      if (hasTitleToken) titleHighSignalHits += 1
    }
  }

  const titleTokenHits = titleHighSignalHits + titleLowSignalHits
  if (!phraseScore) {
    if (titleTokenHits === 0) return 0
    if (queryTokens.length > 1) {
      const titleCoverage = titleTokenHits / queryTokens.length
      const titleHighCoverage = highSignalQueryTokens ? titleHighSignalHits / highSignalQueryTokens : 0
      if (highSignalQueryTokens > 0 && titleHighCoverage < 0.67) return 0
      if (titleCoverage < 0.5) return 0
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

function isSearchTokenSubstringHit(token, field) {
  return token.length >= 4 && !LOW_SIGNAL_TOKENS.has(token) && field.includes(token)
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

function uniqueStrings(values) {
  const seen = new Set()
  const results = []
  for (const value of values) {
    const text = optionalString(value)
    if (!text) continue
    const key = normalizeSearchText(text)
    if (!key || seen.has(key)) continue
    seen.add(key)
    results.push(text)
  }
  return results
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
