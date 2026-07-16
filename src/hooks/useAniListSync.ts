import type { AniListSyncIntegration, AniListSyncResult } from '../domain/types'
import { useCallback, useEffect, useRef, useState } from 'react'

const loadAniListSyncService = () => import('../services/anilistSync')

export interface AniListSyncController {
  integration?: AniListSyncIntegration
  loading: boolean
  pending: boolean
  error?: string
  configure: (username: string, enabled: boolean) => Promise<void>
  syncNow: () => Promise<AniListSyncResult | undefined>
}

export function useAniListSync(userId?: string, isAdmin = false): AniListSyncController {
  const [integration, setIntegration] = useState<AniListSyncIntegration | undefined>()
  const [loading, setLoading] = useState(Boolean(userId && isAdmin))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const attemptedAutomaticKeyRef = useRef<string | undefined>(undefined)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    attemptedAutomaticKeyRef.current = undefined
    if (!userId || !isAdmin) {
      const timeoutId = window.setTimeout(() => {
        setIntegration(undefined)
        setLoading(false)
        setError(undefined)
      }, 0)
      return () => window.clearTimeout(timeoutId)
    }

    const loadingTimeoutId = window.setTimeout(() => setLoading(true), 0)
    let unsubscribe: () => void = () => undefined
    let disposed = false
    void loadAniListSyncService()
      .then(({ subscribeAniListSync }) => {
        if (disposed) return
        unsubscribe = subscribeAniListSync(
          userId,
          (nextIntegration) => {
            setIntegration(nextIntegration)
            setLoading(false)
          },
          (reason) => {
            setLoading(false)
            setError(reason.message)
          },
        )
      })
      .catch((reason: unknown) => {
        if (disposed) return
        setLoading(false)
        setError(reason instanceof Error ? reason.message : 'AniList no esta disponible.')
      })
    return () => {
      disposed = true
      unsubscribe()
      window.clearTimeout(loadingTimeoutId)
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
      timerRef.current = undefined
    }
  }, [isAdmin, userId])

  const runAutomatic = useCallback(async () => {
    if (!userId || !isAdmin || !integration?.enabled || integration.state === 'syncing') return
    const nextAt = integration.nextAutomaticSyncAt ? Date.parse(integration.nextAutomaticSyncAt) : NaN
    const retryAt = integration.retryAfter ? Date.parse(integration.retryAfter) : NaN
    const scheduledAt = [nextAt, retryAt].filter((value) => Number.isFinite(value) && value > Date.now()).sort((left, right) => left - right)[0]
    if (scheduledAt) return
    const key = `${userId}:${integration.username}:${integration.lastSuccessAt ?? 'never'}`
    if (attemptedAutomaticKeyRef.current === key) return
    attemptedAutomaticKeyRef.current = key
    setPending(true)
    setError(undefined)
    try {
      const { runAniListSync } = await loadAniListSyncService()
      await runAniListSync('automatic')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo sincronizar AniList.')
    } finally {
      setPending(false)
    }
  }, [integration, isAdmin, userId])

  useEffect(() => {
    if (!integration?.enabled || integration.state === 'syncing') return undefined
    const nextAt = integration.nextAutomaticSyncAt ? Date.parse(integration.nextAutomaticSyncAt) : NaN
    const retryAt = integration.retryAfter ? Date.parse(integration.retryAfter) : NaN
    const scheduledAt = [nextAt, retryAt].filter((value) => Number.isFinite(value) && value > Date.now()).sort((left, right) => left - right)[0]
    if (scheduledAt) {
      timerRef.current = window.setTimeout(() => {
        attemptedAutomaticKeyRef.current = undefined
        void runAutomatic()
      }, Math.min(scheduledAt - Date.now(), 2_147_000_000))
      return () => {
        if (timerRef.current !== undefined) window.clearTimeout(timerRef.current)
        timerRef.current = undefined
      }
    }
    const timeoutId = window.setTimeout(() => void runAutomatic(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [integration, runAutomatic])

  useEffect(() => {
    const retry = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        attemptedAutomaticKeyRef.current = undefined
        void runAutomatic()
      }
    }
    window.addEventListener('online', retry)
    document.addEventListener('visibilitychange', retry)
    return () => {
      window.removeEventListener('online', retry)
      document.removeEventListener('visibilitychange', retry)
    }
  }, [runAutomatic])

  const configure = useCallback(async (username: string, enabled: boolean) => {
    setPending(true)
    setError(undefined)
    try {
      const { configureAniListSync } = await loadAniListSyncService()
      const nextIntegration = await configureAniListSync(username, enabled)
      setIntegration(nextIntegration)
      attemptedAutomaticKeyRef.current = undefined
      if (enabled) await (await loadAniListSyncService()).runAniListSync('automatic')
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'No se pudo configurar AniList.'
      setError(message)
      throw reason
    } finally {
      setPending(false)
    }
  }, [])

  const syncNow = useCallback(async () => {
    setPending(true)
    setError(undefined)
    try {
      const { runAniListSync } = await loadAniListSyncService()
      return await runAniListSync('manual')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo sincronizar AniList.')
      throw reason
    } finally {
      setPending(false)
    }
  }, [])

  return { integration, loading, pending, error, configure, syncNow }
}
