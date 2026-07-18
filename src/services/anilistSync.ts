import { doc, onSnapshot } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import type { AniListSyncIntegration, AniListSyncResult } from '../domain/types'
import { getFirebaseServices } from './firebaseDb'
import { getFirebaseFunctionsClient } from './firebaseFunctions'

export function subscribeAniListSync(
  userId: string,
  onIntegration: (integration: AniListSyncIntegration | undefined) => void,
  onError: (error: Error) => void,
) {
  const services = getFirebaseServices()
  if (!services) return () => undefined
  const integrationDocument = doc(services.db, 'users', userId, 'integrations', 'anilist')
  return onSnapshot(
    integrationDocument,
    (snapshot) => onIntegration(snapshot.exists() ? normalizeIntegration(snapshot.data()) : undefined),
    (error) => onError(error),
  )
}

export async function configureAniListSync(username: string, enabled: boolean) {
  const functionsClient = getFirebaseFunctionsClient()
  if (!functionsClient) throw new Error('Firebase Functions no esta disponible para configurar AniList.')
  const callable = httpsCallable<{ username: string; enabled: boolean }, { integration?: unknown }>(
    functionsClient,
    'configureAniListSync',
  )
  const result = await callable({ username, enabled })
  return normalizeIntegration(result.data.integration)
}

export async function runAniListSync(mode: 'automatic' | 'manual' = 'automatic'): Promise<AniListSyncResult> {
  const functionsClient = getFirebaseFunctionsClient()
  if (!functionsClient) throw new Error('Firebase Functions no esta disponible para sincronizar AniList.')
  const callable = httpsCallable<{ mode: 'automatic' | 'manual' }, AniListSyncResult>(functionsClient, 'syncAniList')
  const result = await callable({ mode })
  return normalizeSyncResult(result.data)
}

function normalizeIntegration(value: unknown): AniListSyncIntegration | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const state = source.state === 'syncing' || source.state === 'error' || source.state === 'disabled' ? source.state : 'idle'
  const result = source.lastResult && typeof source.lastResult === 'object' ? source.lastResult as Record<string, unknown> : undefined
  const error = source.lastError && typeof source.lastError === 'object' ? source.lastError as Record<string, unknown> : undefined
  return {
    enabled: source.enabled === true,
    username: typeof source.username === 'string' ? source.username : '',
    state,
    updatedAt: optionalString(source.updatedAt),
    lastAttemptAt: optionalString(source.lastAttemptAt),
    lastSuccessAt: optionalString(source.lastSuccessAt),
    nextAutomaticSyncAt: optionalString(source.nextAutomaticSyncAt),
    retryAfter: optionalString(source.retryAfter),
    lastResult: result ? {
      added: finiteNumber(result.added),
      updated: finiteNumber(result.updated),
      unchanged: finiteNumber(result.unchanged),
      totalRemote: finiteNumber(result.totalRemote),
    } : undefined,
    lastError: error ? {
      code: optionalString(error.code) ?? 'unknown',
      message: optionalString(error.message) ?? 'No se pudo sincronizar AniList.',
      at: optionalString(error.at) ?? '',
    } : undefined,
  }
}

function normalizeSyncResult(value: unknown): AniListSyncResult {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const status = source.status === 'synced' || source.status === 'cooldown' || source.status === 'busy' ? source.status : 'disabled'
  return {
    status,
    added: finiteNumber(source.added),
    updated: finiteNumber(source.updated),
    unchanged: finiteNumber(source.unchanged),
    totalRemote: finiteNumber(source.totalRemote),
    lastSuccessAt: optionalString(source.lastSuccessAt),
  }
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
