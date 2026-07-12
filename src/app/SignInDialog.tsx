import { LogIn, X } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { DialogFocusReturn, handleDialogKeyDown } from './shared'

interface SignInDialogProps {
  error?: string
  onClose: () => void
  onCreateAccount: (email: string, password: string) => Promise<void>
  onEmailSignIn: (email: string, password: string) => Promise<void>
  onGoogleSignIn: () => Promise<void>
  onResetPassword: (email: string) => Promise<void>
}

export default function SignInDialog({
  error,
  onClose,
  onCreateAccount,
  onEmailSignIn,
  onGoogleSignIn,
  onResetPassword,
}: SignInDialogProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'signin' | 'create' | 'reset'>('signin')
  const [pendingProvider, setPendingProvider] = useState<'email' | 'google' | 'create' | 'reset'>()
  const [localError, setLocalError] = useState<string>()
  const [notice, setNotice] = useState<string>()
  const pending = Boolean(pendingProvider)
  const feedback = localError ?? error

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || (mode !== 'reset' && !password)) return

    setPendingProvider(mode === 'signin' ? 'email' : mode)
    setLocalError(undefined)
    setNotice(undefined)
    try {
      if (mode === 'signin') {
        await onEmailSignIn(email, password)
        onClose()
      } else if (mode === 'create') {
        await onCreateAccount(email, password)
        onClose()
      } else {
        await onResetPassword(email)
        setNotice('Si existe una cuenta para ese correo, recibiras instrucciones para recuperar el acceso.')
      }
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'No se pudo completar la accion')
    } finally {
      setPendingProvider(undefined)
    }
  }

  async function submitGoogle() {
    setPendingProvider('google')
    setLocalError(undefined)
    setNotice(undefined)
    try {
      await onGoogleSignIn()
      onClose()
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesion')
    } finally {
      setPendingProvider(undefined)
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <DialogFocusReturn />
      <section
        aria-labelledby="sign-in-dialog-title"
        aria-modal="true"
        className="auth-login-dialog"
        role="dialog"
        onKeyDown={(event) => handleDialogKeyDown(event, pending ? () => undefined : onClose)}
      >
        <button
          aria-label="Cerrar acceso a Nexo"
          className="icon-button dialog-close"
          disabled={pending}
          title="Cerrar"
          type="button"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <div className="panel-heading compact">
          <div>
            <span className="eyebrow">Acceso</span>
            <h2 id="sign-in-dialog-title">
              {mode === 'signin' ? 'Entrar en Nexo' : mode === 'create' ? 'Crear cuenta' : 'Recuperar acceso'}
            </h2>
          </div>
        </div>
        <div aria-label="Modo de acceso" className="auth-mode-switch" role="tablist">
          <button
            aria-selected={mode === 'signin'}
            role="tab"
            type="button"
            onClick={() => { setMode('signin'); setLocalError(undefined); setNotice(undefined) }}
          >
            Entrar
          </button>
          <button
            aria-selected={mode === 'create'}
            role="tab"
            type="button"
            onClick={() => { setMode('create'); setLocalError(undefined); setNotice(undefined) }}
          >
            Crear cuenta
          </button>
        </div>
        <form className="auth-login-form" onSubmit={submitEmail}>
          <label>
            Email
            <input
              autoFocus
              autoComplete="email"
              inputMode="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          {mode !== 'reset' && (
            <label>
              Contraseña
              <input
                autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
                minLength={6}
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          )}
          {feedback && <p className="auth-login-error" role="alert">{feedback}</p>}
          {notice && <p className="auth-login-notice" role="status">{notice}</p>}
          <div className="auth-login-actions">
            <button className="primary-button" disabled={pending || !email.trim() || (mode !== 'reset' && !password)} type="submit">
              <LogIn size={16} />
              {pending
                ? 'Procesando'
                : mode === 'signin'
                  ? 'Entrar con email'
                  : mode === 'create'
                    ? 'Crear cuenta'
                    : 'Enviar recuperacion'}
            </button>
            {mode === 'signin' && (
              <button className="secondary-button" disabled={pending} type="button" onClick={() => void submitGoogle()}>
                <LogIn size={16} />
                {pendingProvider === 'google' ? 'Entrando' : 'Entrar con Google'}
              </button>
            )}
          </div>
          <button
            className="auth-reset-link"
            disabled={pending}
            type="button"
            onClick={() => {
              setMode(mode === 'reset' ? 'signin' : 'reset')
              setLocalError(undefined)
              setNotice(undefined)
            }}
          >
            {mode === 'reset' ? 'Volver a entrar' : 'He olvidado mi contraseña'}
          </button>
        </form>
      </section>
    </div>
  )
}
