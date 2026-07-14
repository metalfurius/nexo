import type { DiscoveryCandidate, ExplorerSearchType } from '../domain/types'
import { externalCandidateToDiscovery, publicItemToDiscovery } from '../lib/catalog'
import { dedupeCatalogSearchCandidates, rankCatalogSearchCandidates } from '../lib/catalogSearch'
import { fetchCatalogGatewaySearch } from './catalogGateway'
import { fetchPublicCatalog } from './publicCatalog'

export type CatalogSearchSource = 'catalogApi' | 'publicCatalog'

export interface CatalogSearchRequest {
  query: string
  type: ExplorerSearchType
  limit?: number
  signal?: AbortSignal
}

export interface CatalogSearchResult {
  candidates: DiscoveryCandidate[]
  partial: boolean
  sources: readonly CatalogSearchSource[]
}

const defaultCatalogSearchLimit = 24
const maxCatalogSearchLimit = 48
export const maxCatalogSearchQueryLength = 120

export async function searchCatalogSources(request: CatalogSearchRequest): Promise<CatalogSearchResult> {
  const query = cleanCatalogSearchQuery(request.query)
  const type = request.type || 'any'
  const limit = normalizeCatalogSearchLimit(request.limit)
  const publicPromise = requireCatalogSource(
    'publicCatalog',
    fetchPublicCatalog(query, type, limit, request.signal),
  )

  if (query.length < 2) {
    const publicItems = await publicPromise
    return {
      candidates: rankCatalogSearchCandidates(publicItems.map(publicItemToDiscovery), query, type).slice(0, limit),
      partial: false,
      sources: ['publicCatalog'],
    }
  }

  const [publicResult, gatewayResult] = await Promise.allSettled([
    publicPromise,
    requireCatalogSource(
      'catalogApi',
      fetchCatalogGatewaySearch(query, type, limit, request.signal),
    ),
  ])
  const sources: CatalogSearchSource[] = []
  const candidates: DiscoveryCandidate[] = []

  if (publicResult.status === 'fulfilled') {
    sources.push('publicCatalog')
    candidates.push(...publicResult.value.map(publicItemToDiscovery))
  }
  if (gatewayResult.status === 'fulfilled') {
    sources.push('catalogApi')
    candidates.push(...gatewayResult.value.candidates.map(externalCandidateToDiscovery))
  }

  if (!sources.length) {
    if (request.signal?.aborted) throw request.signal.reason ?? createAbortError()
    throw new Error('No se pudo consultar el catalogo. Prueba de nuevo.')
  }

  return {
    candidates: rankCatalogSearchCandidates(
      dedupeCatalogSearchCandidates(candidates),
      query,
      type,
    ).slice(0, limit),
    partial: sources.length < 2 || (gatewayResult.status === 'fulfilled' && gatewayResult.value.partial),
    sources,
  }
}

export function cleanCatalogSearchQuery(query: string) {
  return query.trim().slice(0, maxCatalogSearchQueryLength)
}

function normalizeCatalogSearchLimit(value = defaultCatalogSearchLimit) {
  if (!Number.isFinite(value)) return defaultCatalogSearchLimit
  return Math.min(maxCatalogSearchLimit, Math.max(1, Math.trunc(value)))
}

async function requireCatalogSource<T>(
  source: CatalogSearchSource,
  request: Promise<T | undefined>,
): Promise<T> {
  const result = await request
  if (result === undefined) throw new Error(`${source} no esta disponible.`)
  return result
}

function createAbortError() {
  return new DOMException('La busqueda se cancelo.', 'AbortError')
}
