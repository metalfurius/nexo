import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_WEIGHTS,
  type ExternalCandidate,
  type ItemStatus,
  type ListItem,
  nowIso,
} from '../domain/types'
import { demoItems } from '../data/demoItems'
import { slugify, uniqueValues } from '../lib/strings'
import { createFirestoreRepository } from '../services/libraryRepository'

export function useLibrary(userId?: string) {
  const repository = useMemo(() => (userId ? createFirestoreRepository(userId) : undefined), [userId])
  const [remoteItems, setRemoteItems] = useState<ListItem[]>([])
  const [remoteUserId, setRemoteUserId] = useState<string | undefined>()
  const [demoLibrary, setDemoLibrary] = useState<ListItem[]>(demoItems)
  const [error, setError] = useState<string | undefined>()
  const remoteReady = Boolean(repository && userId && remoteUserId === userId)
  const loading = Boolean(repository && !remoteReady)
  const items = repository ? (remoteReady ? remoteItems : []) : demoLibrary
  const activeError = remoteReady ? error : undefined

  useEffect(() => {
    if (!repository || !userId) return undefined

    return repository.subscribeItems(
      (nextItems) => {
        setRemoteItems(nextItems)
        setRemoteUserId(userId)
        setError(undefined)
      },
      (reason) => {
        setRemoteItems([])
        setRemoteUserId(userId)
        setError(reason.message)
      },
    )
  }, [repository, userId])

  async function saveItem(item: ListItem) {
    const normalized = {
      ...item,
      tags: uniqueValues(item.tags),
      genres: uniqueValues(item.genres),
      moodTags: uniqueValues(item.moodTags),
      updatedAt: nowIso(),
    }
    if (repository) {
      await repository.saveItem(normalized)
    } else {
      setDemoLibrary((current) => upsertItem(current, normalized))
    }
  }

  async function deleteItem(id: string) {
    if (repository) {
      await repository.deleteItem(id)
    } else {
      setDemoLibrary((current) => current.filter((item) => item.id !== id))
    }
  }

  async function deleteAllItems() {
    if (repository) {
      await repository.deleteAllItems()
    } else {
      setDemoLibrary([])
    }
  }

  async function setStatus(id: string, status: ItemStatus) {
    if (repository) {
      await repository.setStatus(id, status)
    } else {
      setDemoLibrary((current) =>
        current.map((item) => (item.id === id ? { ...item, status, updatedAt: nowIso() } : item)),
      )
    }
  }

  async function snoozeRecommendation(id: string) {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    if (repository) {
      await repository.snoozeRecommendation(id)
    } else {
      setDemoLibrary((current) =>
        current.map((item) =>
          item.id === id
            ? { ...item, recommendationCooldownUntil: tomorrow.toISOString(), updatedAt: nowIso() }
            : item,
        ),
      )
    }
  }

  async function recordRecommendation(itemId: string, reasons: string[]) {
    if (repository) await repository.recordRecommendation(itemId, reasons)
  }

  async function searchExternal(query: string, type: string): Promise<ExternalCandidate[]> {
    if (repository) return repository.searchExternal(query, type)
    return demoExternalCandidates(query, type)
  }

  function candidateToItem(candidate: ExternalCandidate): ListItem {
    return {
      id: `${candidate.type}-${slugify(candidate.title)}-${candidate.sourceId}`.slice(0, 120),
      title: candidate.title,
      type: candidate.type,
      status: 'wishlist',
      genres: candidate.genres,
      tags: uniqueValues([candidate.type, candidate.source, ...candidate.genres]),
      moodTags: [],
      weights: DEFAULT_WEIGHTS,
      notes: candidate.overview,
      source: 'external',
      externalRefs: candidate.externalRefs,
      posterUrl: candidate.posterUrl,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    }
  }

  return {
    items,
    loading,
    error: activeError,
    saveItem,
    deleteItem,
    deleteAllItems,
    setStatus,
    snoozeRecommendation,
    recordRecommendation,
    searchExternal,
    candidateToItem,
  }
}

function upsertItem(items: ListItem[], nextItem: ListItem) {
  const exists = items.some((item) => item.id === nextItem.id)
  if (!exists) return [nextItem, ...items]
  return items.map((item) => (item.id === nextItem.id ? nextItem : item))
}

function demoExternalCandidates(query: string, type: string): ExternalCandidate[] {
  const base = nowIso()
  const cleanedQuery = query.trim() || 'Nueva recomendacion'
  return [
    {
      id: `demo-${slugify(cleanedQuery)}`,
      title: cleanedQuery,
      type: type === 'watch' || type === 'any' ? 'movie' : (type as ExternalCandidate['type']),
      source: 'tmdb',
      sourceId: `demo-${slugify(cleanedQuery)}`,
      overview: 'Candidato de demostracion hasta configurar Firebase Functions.',
      genres: [],
      externalRefs: {},
      createdAt: base,
    },
  ]
}
