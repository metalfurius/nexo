import { useCallback, useState } from 'react'

export function useGuardedSignOut({
  hasUnsavedChanges,
  sessionKey,
  signOut,
}: {
  hasUnsavedChanges: boolean
  sessionKey?: string
  signOut: () => Promise<void>
}) {
  const [pendingSession, setPendingSession] = useState<string | null | undefined>(null)
  const [errorState, setErrorState] = useState<{ message: string; sessionKey?: string }>()
  const [discardPrompt, setDiscardPrompt] = useState<{ open: boolean; sessionKey?: string }>()
  const pending = pendingSession !== null && pendingSession === sessionKey
  const error = errorState && errorState.sessionKey === sessionKey ? errorState.message : undefined
  const discardPromptOpen = Boolean(discardPrompt && discardPrompt.sessionKey === sessionKey && discardPrompt.open)

  const perform = useCallback(async () => {
    if (pending) return
    const requestedSession = sessionKey
    setPendingSession(requestedSession)
    setErrorState(undefined)
    try {
      await signOut()
    } catch {
      setErrorState({ message: 'No se pudo salir', sessionKey: requestedSession })
    } finally {
      setPendingSession((current) => current === requestedSession ? null : current)
    }
  }, [pending, sessionKey, signOut])

  const request = useCallback(() => {
    if (pending) return
    if (hasUnsavedChanges) {
      setDiscardPrompt({ open: true, sessionKey })
      return
    }
    void perform()
  }, [hasUnsavedChanges, pending, perform, sessionKey])

  const discardAndContinue = useCallback(() => {
    setDiscardPrompt({ open: false, sessionKey })
    void perform()
  }, [perform, sessionKey])

  return {
    discardAndContinue,
    discardPromptOpen,
    error,
    keepEditing: () => setDiscardPrompt({ open: false, sessionKey }),
    pending,
    request,
  }
}
