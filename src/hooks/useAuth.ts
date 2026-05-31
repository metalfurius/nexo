import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  isFirebaseConfigured,
  signInWithGoogle,
  signOutCurrentUser,
  watchAuth,
} from '../services/firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(isFirebaseConfigured)
  const [error, setError] = useState<string | undefined>()

  useEffect(() => {
    return watchAuth((nextUser) => {
      setUser(nextUser)
      setLoading(false)
    })
  }, [])

  return {
    user,
    loading,
    isFirebaseConfigured,
    error,
    signIn: async () => {
      try {
        setError(undefined)
        await signInWithGoogle()
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesion')
      }
    },
    signOut: signOutCurrentUser,
  }
}
