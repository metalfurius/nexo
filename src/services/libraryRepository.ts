import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type Firestore,
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
  setStatus: (id: string, status: ItemStatus) => Promise<void>
  snoozeRecommendation: (id: string) => Promise<void>
  recordRecommendation: (itemId: string, reasons: string[]) => Promise<void>
  searchExternal: (query: string, type: string) => Promise<ExternalCandidate[]>
}

export function createFirestoreRepository(): LibraryRepository | undefined {
  const services = getFirebaseServices()
  if (!services) return undefined

  return {
    subscribeItems(onItems, onError) {
      const itemsQuery = query(collection(services.db, 'items'), orderBy('updatedAt', 'desc'))
      return onSnapshot(
        itemsQuery,
        (snapshot) => {
          onItems(snapshot.docs.map((itemDoc) => itemDoc.data() as ListItem))
        },
        (error) => onError(error),
      )
    },
    saveItem(item) {
      return setDoc(doc(services.db, 'items', item.id), {
        ...item,
        updatedAt: nowIso(),
      })
    },
    deleteItem(id) {
      return deleteDoc(doc(services.db, 'items', id))
    },
    setStatus(id, status) {
      return setDoc(
        doc(services.db, 'items', id),
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
        doc(services.db, 'items', id),
        {
          recommendationCooldownUntil: tomorrow.toISOString(),
          updatedAt: nowIso(),
        },
        { merge: true },
      )
    },
    async recordRecommendation(itemId, reasons) {
      await addDoc(collection(services.db, 'recommendationRuns'), {
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

export function createItemId(db: Firestore, title: string) {
  return doc(collection(db, 'items')).id || title
}

