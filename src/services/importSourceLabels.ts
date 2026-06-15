import type { ImportSourceId } from '../domain/types'

export const importSourceLabels: Record<ImportSourceId, string> = {
  anilist: 'AniList',
  myanimelist: 'MyAnimeList',
  letterboxd: 'Letterboxd',
  goodreads: 'Goodreads',
}
