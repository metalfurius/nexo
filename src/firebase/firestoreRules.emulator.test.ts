import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'

const maybeDescribe = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip

maybeDescribe('firestore.rules emulator', () => {
  let env: RulesTestEnvironment

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'listas-web-test',
      firestore: {
        rules: readFileSync('firestore.rules', 'utf8'),
      },
    })
  })

  afterAll(async () => {
    await env.cleanup()
  })

  it('allows only authorized users to read app collections', async () => {
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'authorizedUsers', 'owner'), { email: 'owner@example.com' })
      await setDoc(doc(context.firestore(), 'items', 'outer-wilds'), { title: 'Outer Wilds' })
    })

    const ownerDb = env.authenticatedContext('owner').firestore()
    const strangerDb = env.authenticatedContext('stranger').firestore()

    await expect(getDoc(doc(ownerDb, 'items', 'outer-wilds'))).resolves.toBeTruthy()
    await expect(getDoc(doc(strangerDb, 'items', 'outer-wilds'))).rejects.toThrow()
  })
})

