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
    const type = url.searchParams.get('type')?.trim() ?? 'any'
    if (query.length < 2) {
      return json({ results: [] }, corsHeaders)
    }

    const results = await searchProtectedProviders(query, type, env)
    return json({ results: uniqueCandidates(results).slice(0, 16) }, corsHeaders, 200, {
      'cache-control': 'public, max-age=300',
    })
  },
}

async function searchProtectedProviders(query, type, env) {
  const tasks = []
  if (type === 'watch' || type === 'movie' || type === 'series' || type === 'any') {
    tasks.push(searchTmdb(query, env))
  }
  if (type === 'game' || type === 'any') {
    tasks.push(searchRawg(query, env))
  }

  const groups = await Promise.allSettled(tasks)
  return groups.flatMap((group) => (group.status === 'fulfilled' ? group.value : []))
}

async function searchTmdb(query, env) {
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
    .filter((entry) => entry.media_type === 'movie' || entry.media_type === 'tv')
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

function stripUndefined(value) {
  if (Array.isArray(value)) return value.map(stripUndefined)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => (entry === undefined ? [] : [[key, stripUndefined(entry)]])),
    )
  }
  return value
}
