import {
  cleanCatalogSearchQuery,
  type CatalogSearchRequest,
  type CatalogSearchResult,
} from './catalogSearchClient'

export interface CatalogSearchController {
  cancel: () => void
  run: (
    request: CatalogSearchRequest,
    load: (request: CatalogSearchRequest) => Promise<CatalogSearchResult>,
    options?: { force?: boolean },
  ) => Promise<CatalogSearchResult>
}

export function createCatalogSearchController(timeoutMs = 10_000): CatalogSearchController {
  let active: { controller: AbortController; key: string; promise: Promise<CatalogSearchResult> } | undefined
  let lastCompleted: { key: string; result: CatalogSearchResult } | undefined

  function cancel() {
    active?.controller.abort(createAbortReason('La busqueda se cancelo.'))
    active = undefined
  }

  function run(
    request: CatalogSearchRequest,
    load: (request: CatalogSearchRequest) => Promise<CatalogSearchResult>,
    options: { force?: boolean } = {},
  ) {
    if (request.signal?.aborted) {
      return Promise.reject(request.signal.reason ?? createAbortReason('La busqueda se cancelo.'))
    }
    const normalizedRequest = {
      ...request,
      query: cleanCatalogSearchQuery(request.query),
      limit: normalizeLimit(request.limit),
      type: request.type || 'any',
    }
    const key = `${normalizedRequest.type}:${normalizedRequest.limit}:${normalizedRequest.query.toLocaleLowerCase('es')}`

    if (!options.force && active?.key === key) return active.promise
    if (!options.force && lastCompleted?.key === key) return Promise.resolve(lastCompleted.result)

    cancel()
    const controller = new AbortController()
    const abortPromise = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(controller.signal.reason ?? createAbortReason('La busqueda se cancelo.'))
      }, { once: true })
    })
    const timeoutId = window.setTimeout(() => {
      controller.abort(createAbortReason('La busqueda tardo demasiado. Prueba de nuevo.'))
    }, timeoutMs)
    const abortFromParent = () => controller.abort(request.signal?.reason ?? createAbortReason('La busqueda se cancelo.'))
    request.signal?.addEventListener('abort', abortFromParent, { once: true })

    const promise = Promise.race([
      load({ ...normalizedRequest, signal: controller.signal }),
      abortPromise,
    ])
      .then((result) => {
        if (!controller.signal.aborted) lastCompleted = { key, result }
        return result
      })
      .finally(() => {
        window.clearTimeout(timeoutId)
        request.signal?.removeEventListener('abort', abortFromParent)
        if (active?.controller === controller) active = undefined
      })

    active = { controller, key, promise }
    return promise
  }

  return { cancel, run }
}

function normalizeLimit(value = 24) {
  if (!Number.isFinite(value)) return 24
  return Math.min(48, Math.max(1, Math.trunc(value)))
}

function createAbortReason(message: string) {
  const error = new Error(message)
  error.name = 'AbortError'
  return error
}
