import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCatalogSearchController } from './catalogSearchController'

const emptyResult = { candidates: [], partial: false, sources: ['publicCatalog'] as const }

describe('catalogSearchController', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('deduplicates the active and completed query for at least ten seconds', async () => {
    vi.useFakeTimers()
    const load = vi.fn(async () => emptyResult)
    const controller = createCatalogSearchController()
    const request = { query: 'Dune', type: 'any' as const }

    const first = controller.run(request, load)
    const duplicate = controller.run(request, load)
    await expect(first).resolves.toEqual(emptyResult)
    await expect(duplicate).resolves.toEqual(emptyResult)
    await vi.advanceTimersByTimeAsync(10_000)
    await expect(controller.run(request, load)).resolves.toEqual(emptyResult)

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('allows an explicit retry to force one new request', async () => {
    const load = vi.fn(async () => emptyResult)
    const controller = createCatalogSearchController()
    const request = { query: 'Dune', type: 'any' as const }

    await controller.run(request, load)
    await controller.run(request, load, { force: true })

    expect(load).toHaveBeenCalledTimes(2)
  })

  it('aborts the whole search after the ten second budget', async () => {
    vi.useFakeTimers()
    const load = vi.fn((request: { signal?: AbortSignal }) => {
      void request.signal
      return new Promise<typeof emptyResult>(() => undefined)
    })
    const controller = createCatalogSearchController()

    const request = controller.run({ query: 'Dune', type: 'any' }, load)
    const rejection = expect(request).rejects.toMatchObject({
      message: 'La busqueda tardo demasiado. Prueba de nuevo.',
      name: 'AbortError',
    })
    await vi.advanceTimersByTimeAsync(10_000)

    await rejection
    expect(load.mock.calls[0][0].signal?.aborted).toBe(true)
  })

  it('aborts an older request when query or type changes', async () => {
    let firstSignal: AbortSignal | undefined
    const load = vi.fn((request: { query: string; signal?: AbortSignal }) => {
      if (request.query === 'Dune') {
        firstSignal = request.signal
        return new Promise<typeof emptyResult>((_resolve, reject) => {
          request.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true })
        })
      }
      return Promise.resolve(emptyResult)
    })
    const controller = createCatalogSearchController()

    const first = controller.run({ query: 'Dune', type: 'any' }, load)
    await expect(controller.run({ query: 'Solaris', type: 'book' }, load)).resolves.toEqual(emptyResult)

    expect(firstSignal?.aborted).toBe(true)
    await expect(first).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('does not start network work for an already aborted request', async () => {
    const parent = new AbortController()
    parent.abort(new DOMException('Cancelled', 'AbortError'))
    const load = vi.fn(async () => emptyResult)
    const controller = createCatalogSearchController()

    await expect(controller.run({ query: 'Dune', type: 'any', signal: parent.signal }, load))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(load).not.toHaveBeenCalled()
  })
})
