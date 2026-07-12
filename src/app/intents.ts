import type { DiscoverMode } from './shared'

export type AppIntent =
  | { id: number; kind: 'add' }
  | { id: number; itemId: string; kind: 'open-item' }
  | { id: number; kind: 'discover'; mode: DiscoverMode; query?: string }
  | { id: number; kind: 'roll'; scope: 'roadmap-next' | 'all' }

export type AppIntentDraft =
  | { kind: 'add' }
  | { itemId: string; kind: 'open-item' }
  | { kind: 'discover'; mode: DiscoverMode; query?: string }
  | { kind: 'roll'; scope: 'roadmap-next' | 'all' }

export interface AppIntentState {
  current?: AppIntent
}

export type AppIntentAction =
  | { intent: AppIntent; type: 'dispatch' }
  | { id: number; type: 'consume' }

export function appIntentReducer(state: AppIntentState, action: AppIntentAction): AppIntentState {
  if (action.type === 'dispatch') return { current: action.intent }
  return state.current?.id === action.id ? {} : state
}
