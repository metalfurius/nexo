export function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false
  return /ChunkLoadError|Loading chunk \d+ failed|Failed to fetch dynamically imported module|Importing a module script failed/i
    .test(`${error.name} ${error.message}`)
}
