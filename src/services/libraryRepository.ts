import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
  writeBatch,
} from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import {
  type ExternalCandidate,
  type ItemStatus,
  type ListItem,
  nowIso,
} from '../domain/types'
import { getFirebaseServices } from './firebase'

export interface LibraryRepository {
  subscribeItems: (onItems: (items: ListItem[]) => void, onError: (error: Error) => void) => () => void
  saveItem: (item: ListItem) => Promise<void>
  deleteItem: (id: string) => Promise<void>
  deleteAllItems: () => Promise<void>
  setStatus: (id: string, status: ItemStatus) => Promise<void>
  snoozeRecommendation: (id: string) => Promise<void>
  recordRecommendation: (itemId: string, reasons: string[]) => Promise<void>
  searchExternal: (query: string, type: string) => Promise<ExternalCandidate[]>
}

export function createFirestoreRepository(userId: string): LibraryRepository | undefined {
  const services = getFirebaseServices()
  if (!services) return undefined
  const itemCollection = collection(services.db, 'users', userId, 'items')
  const itemDocument = (id: string) => doc(services.db, 'users', userId, 'items', id)
  const recommendationRunCollection = collection(services.db, 'users', userId, 'recommendationRuns')

  return {
    subscribeItems(onItems, onError) {
      const itemsQuery = query(itemCollection, orderBy('updatedAt', 'desc'))
      return onSnapshot(
        itemsQuery,
        (snapshot) => {
          onItems(snapshot.docs.map((itemDoc) => itemDoc.data() as ListItem))
        },
        (error) => onError(error),
      )
    },
    saveItem(item) {
      return setDoc(itemDocument(item.id), {
        ...withoutUndefined(item),
        updatedAt: nowIso(),
      })
    },
    deleteItem(id) {
      return deleteDoc(itemDocument(id))
    },
    async deleteAllItems() {
      const snapshot = await getDocs(itemCollection)
      for (const docsChunk of chunk(snapshot.docs, 450)) {
        const batch = writeBatch(services.db)
        for (const itemDoc of docsChunk) {
          batch.delete(itemDoc.ref)
        }
        await batch.commit()
      }
    },
    setStatus(id, status) {
      return setDoc(
        itemDocument(id),
        {
          status,
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    snoozeRecommendation(id) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      return setDoc(
        itemDocument(id),
        {
          recommendationCooldownUntil: tomorrow.toISOString(),
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    async recordRecommendation(itemId, reasons) {
      await addDoc(recommendationRunCollection, {
        itemId,
        reasons,
        createdAt: nowIso(),
      })
    },
    async searchExternal(searchQuery, type) {
      const callable = httpsCallable<{ query: string; type: string }, { candidates: ExternalCandidate[] }>(
        services.functions,
        'searchExternal',
      )
      const result = await callable({ query: searchQuery, type })
      return result.data.candidates
    },
  }
}

function chunk<Value>(values: Value[], size: number) {
  const chunks: Value[][] = []
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size))
  }
  return chunks
}

export function createItemId(db: Firestore, userId: string, title: string) {
  return doc(collection(db, 'users', userId, 'items')).id || title
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((entry) => withoutUndefined(entry)) as T
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) =>
        entry === undefined ? [] : [[key, withoutUndefined(entry)]],
      ),
    ) as T
  }

  return value
}
