import type { ExternalCandidate } from '../domain/types'

export interface ExternalSourceCredit {
  detail: string
  id: ExternalCandidate['source']
  label: string
  requiresKey: boolean
  url: string
}

export type ExternalDiscoverType = 'any' | 'movie' | 'series' | 'animeManga' | 'game' | 'book'
export type ExternalDiscoverDuration = 'any' | 'short' | 'medium' | 'long'

export const externalSourceCredits: ExternalSourceCredit[] = [
  {
    detail: 'Peliculas, series, posters y fechas a traves del proxy privado de catalogo.',
    id: 'tmdb',
    label: 'TMDB',
    requiresKey: true,
    url: 'https://www.themoviedb.org/',
  },
  {
    detail: 'Juegos, portadas, generos y fechas a traves del proxy privado de catalogo.',
    id: 'rawg',
    label: 'RAWG',
    requiresKey: true,
    url: 'https://rawg.io/',
  },
  {
    detail: 'Libros, autores y portadas publicas sin clave de API.',
    id: 'openLibrary',
    label: 'Open Library',
    requiresKey: false,
    url: 'https://openlibrary.org/',
  },
  {
    detail: 'Libros, autores y portadas a traves del proxy privado de catalogo.',
    id: 'googleBooks',
    label: 'Google Books',
    requiresKey: true,
    url: 'https://books.google.com/',
  },
  {
    detail: 'Anime, manga y manhwa con generos y portadas sin clave de API.',
    id: 'anilist',
    label: 'AniList',
    requiresKey: false,
    url: 'https://anilist.co/',
  },
  {
    detail: 'Manga y manhwa con aliases localizados, tags y portadas sin clave de API.',
    id: 'mangaDex',
    label: 'MangaDex',
    requiresKey: false,
    url: 'https://mangadex.org/',
  },
  {
    detail: 'Manga y manhwa con titulos localizados y portadas sin clave de API.',
    id: 'kitsu',
    label: 'Kitsu',
    requiresKey: false,
    url: 'https://kitsu.io/',
  },
  {
    detail: 'Respaldo abierto de MyAnimeList para anime, manga y manhwa sin clave de API.',
    id: 'jikan',
    label: 'Jikan',
    requiresKey: false,
    url: 'https://jikan.moe/',
  },
  {
    detail: 'Fallback abierto para juegos y obras dificiles de encontrar.',
    id: 'wikidata',
    label: 'Wikidata',
    requiresKey: false,
    url: 'https://www.wikidata.org/',
  },
]
