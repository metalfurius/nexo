import { useEffect, useState } from 'react'
import type { FirebaseAuthOperation, FirebaseUser } from '../services/firebaseAuth'
import { isFirebaseConfigured } from '../services/firebaseConfig'

type FirebaseAuthService = typeof import('../services/firebaseAuth')

function createPublicAuthActionError(message: string) {
  // Firebase failures can include account data in their cause; expose only the translated message.
  return new Error(message)
}

export function useAuth() {
  const [user, setUser] = useState<FirebaseUser | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    if (!isFirebaseConfigured) {
      return undefined
    }

    let disposed = false
    let unsubscribe: (() => void) | undefined

    void import('../services/firebaseAuth')
      .then(({ watchAuth }) => {
        if (disposed) return
        unsubscribe = watchAuth((nextUser) => {
          setUser(nextUser)
          setLoading(false)
        })
      })
      .catch((reason) => {
        if (disposed) return
        void reason
        setError('No se pudo cargar Firebase Auth.')
        setLoading(false)
      })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  async function runAuthAction(
    operation: FirebaseAuthOperation,
    action: (service: FirebaseAuthService) => Promise<void>,
  ) {
    let service: FirebaseAuthService | undefined
    try {
      setError(undefined)
      service = await import('../services/firebaseAuth')
      await action(service)
    } catch (reason) {
      const message = service
        ? service.getFirebaseAuthErrorMessage(reason, operation)
        : getAuthImportErrorMessage(operation)
      setError(message)
      throw createPublicAuthActionError(message)
    }
  }

  return {
    user,
    loading,
    isFirebaseConfigured,
    error,
    signInWithGoogle: () => runAuthAction('google-sign-in', ({ signInWithGoogle }) => signInWithGoogle()),
    signInWithEmail: (email: string, password: string) =>
      runAuthAction('sign-in', ({ signInWithEmail }) => signInWithEmail(email, password)),
    createAccount: (email: string, password: string) =>
      runAuthAction('create-account', ({ createAccount }) => createAccount(email, password)),
    resetPassword: (email: string) =>
      runAuthAction('reset-password', ({ resetPassword }) => resetPassword(email)),
    signOut: () => runAuthAction('sign-out', ({ signOutCurrentUser }) => signOutCurrentUser()),
  }
}

function getAuthImportErrorMessage(operation: FirebaseAuthOperation) {
  switch (operation) {
    case 'create-account':
      return 'No se pudo crear la cuenta.'
    case 'google-sign-in':
      return 'No se pudo iniciar sesión con Google.'
    case 'reset-password':
      return 'No se pudo enviar el correo de recuperación.'
    case 'sign-out':
      return 'No se pudo cerrar la sesión.'
    default:
      return 'No se pudo iniciar sesión.'
  }
}
