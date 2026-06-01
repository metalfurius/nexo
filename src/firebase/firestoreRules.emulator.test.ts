import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const maybeDescribe = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip

maybeDescribe('firestore.rules emulator', () => {
  let env: RulesTestEnvironment

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'nexo-test',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    })
  })

  afterAll(async () => {
    await env?.cleanup()
  })

  beforeEach(async () => {
    await env.clearFirestore()
  })

  it('allows signed-in users to read and write their own library', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()
    const itemRef = doc(ownerDb, 'users', 'owner', 'items', 'outer-wilds')

    await expect(setDoc(itemRef, { title: 'Outer Wilds' })).resolves.toBeUndefined()
    await expect(getDoc(itemRef)).resolves.toBeTruthy()
  })

  it('blocks signed-in users from another user library', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', 'owner', 'items', 'outer-wilds'), {
        title: 'Outer Wilds',
      })
    })

    const otherDb = env.authenticatedContext('other').firestore()

    await expect(getDoc(doc(otherDb, 'users', 'owner', 'items', 'outer-wilds'))).rejects.toThrow()
    await expect(setDoc(doc(otherDb, 'users', 'owner', 'items', 'new-item'), { title: 'Nope' })).rejects.toThrow()
  })

  it('blocks anonymous users from user libraries', async () => {
    const anonymousDb = env.unauthenticatedContext().firestore()

    await expect(getDoc(doc(anonymousDb, 'users', 'owner', 'items', 'outer-wilds'))).rejects.toThrow()
    await expect(setDoc(doc(anonymousDb, 'users', 'owner', 'items', 'new-item'), { title: 'Nope' })).rejects.toThrow()
  })

  it('blocks legacy root collections', async () => {
    const ownerDb = env.authenticatedContext('owner').firestore()

    await expect(setDoc(doc(ownerDb, 'items', 'outer-wilds'), { title: 'Outer Wilds' })).rejects.toThrow()
    await expect(getDoc(doc(ownerDb, 'items', 'outer-wilds'))).rejects.toThrow()
  })

  it('lets signed-in users read active public catalog items but not write them', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'publicItems', 'book-odisea'), {
        title: 'Odisea',
        type: 'book',
      })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()

    await expect(getDoc(doc(ownerDb, 'publicItems', 'book-odisea'))).resolves.toBeTruthy()
    await expect(setDoc(doc(ownerDb, 'publicItems', 'book-odisea'), { title: 'Nope' })).rejects.toThrow()
  })

  it('blocks anonymous public catalog reads', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'publicItems', 'archived'), {
        title: 'Archived',
        archivedAt: '2026-01-01T00:00:00.000Z',
      })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()
    const anonymousDb = env.unauthenticatedContext().firestore()

    await expect(getDoc(doc(ownerDb, 'publicItems', 'archived'))).resolves.toBeTruthy()
    await expect(getDoc(doc(anonymousDb, 'publicItems', 'archived'))).rejects.toThrow()
  })

  it('allows moderators to write public catalog items directly', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'moderators', 'owner'), { createdAt: '2026-01-01T00:00:00.000Z' })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()
    const otherDb = env.authenticatedContext('other').firestore()

    await expect(setDoc(doc(ownerDb, 'publicItems', 'book-odisea'), { title: 'Odisea' })).resolves.toBeUndefined()
    await expect(setDoc(doc(otherDb, 'publicItems', 'book-odisea'), { title: 'Nope' })).rejects.toThrow()
  })

  it('allows users to read only their own moderator marker', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'moderators', 'owner'), { createdAt: '2026-01-01T00:00:00.000Z' })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()
    const otherDb = env.authenticatedContext('other').firestore()

    await expect(getDoc(doc(ownerDb, 'moderators', 'owner'))).resolves.toBeTruthy()
    await expect(getDoc(doc(otherDb, 'moderators', 'owner'))).rejects.toThrow()
  })
})
