import { useEffect, useState } from 'react'
import type { FirebaseUser } from '../services/firebaseAuth'
import { isFirebaseConfigured } from '../services/firebaseConfig'

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
        setError(reason instanceof Error ? reason.message : 'No se pudo cargar Firebase Auth')
        setLoading(false)
      })

    return () => {
      disposed = true
      unsubscribe?.()
    }
  }, [])

  return {
    user,
    loading,
    isFirebaseConfigured,
    error,
    signInWithGoogle: async () => {
      try {
        setError(undefined)
        const { signInWithGoogle } = await import('../services/firebaseAuth')
        await signInWithGoogle()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesion')
        throw reason
      }
    },
    signInWithEmail: async (email: string, password: string) => {
      try {
        setError(undefined)
        const { signInWithEmail } = await import('../services/firebaseAuth')
        await signInWithEmail(email, password)
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesion')
        throw reason
      }
    },
    signOut: async () => {
      const { signOutCurrentUser } = await import('../services/firebaseAuth')
      await signOutCurrentUser()
    },
  }
}
