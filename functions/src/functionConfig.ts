const DEFAULT_FUNCTION_ORIGINS = process.env.FUNCTIONS_EMULATOR === 'true'
  ? 'http://localhost:5173,http://127.0.0.1:5173'
  : 'https://nexo.codeoverdose.es'

export const FUNCTION_CORS = (process.env.NEXO_ALLOWED_ORIGINS ?? DEFAULT_FUNCTION_ORIGINS)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

export const APP_VERSION = process.env.NEXO_VERSION ?? 'unknown'

export const CALLABLE_OPTIONS = {
  cors: FUNCTION_CORS,
  enforceAppCheck: process.env.NEXO_ENFORCE_APP_CHECK === 'true',
}
