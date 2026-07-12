import { describe, expect, it } from 'vitest'
import { appIntentReducer, type AppIntentState } from './intents'

describe('appIntentReducer', () => {
  it('keeps one discriminated intent at a time', () => {
    const state = appIntentReducer({}, { intent: { id: 1, kind: 'add' }, type: 'dispatch' })

    expect(state.current).toEqual({ id: 1, kind: 'add' })
    expect(
      appIntentReducer(state, {
        intent: { id: 2, kind: 'discover', mode: 'search', query: 'Dune' },
        type: 'dispatch',
      }).current,
    ).toEqual({ id: 2, kind: 'discover', mode: 'search', query: 'Dune' })
  })

  it('ignores a stale consume action after a newer intent arrives', () => {
    const state: AppIntentState = { current: { id: 4, kind: 'roll', scope: 'roadmap-next' } }

    expect(appIntentReducer(state, { id: 3, type: 'consume' })).toBe(state)
    expect(appIntentReducer(state, { id: 4, type: 'consume' })).toEqual({})
  })
})
