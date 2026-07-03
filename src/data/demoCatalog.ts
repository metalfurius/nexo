import type { PublicCatalogItem } from '../domain/types'
import { buildPublicCatalogItem } from '../lib/catalog'

export const demoPublicCatalog: PublicCatalogItem[] = [
  buildPublicCatalogItem(
    {
      id: 'book-odisea',
      title: 'Odisea',
      type: 'book',
      description: 'Viaje fundacional, regreso imposible y uno de esos clásicos que todavía muerden.',
      releaseYear: -700,
      genres: ['clasico', 'aventura', 'mitologia'],
      tags: ['epico', 'literatura', 'grecia'],
      moodTags: ['denso', 'clasico'],
      externalRefs: {
        sourceUrl: 'https://openlibrary.org/search?q=Odyssey+Homer',
      },
    },
    'demo-moderator',
  ),
  buildPublicCatalogItem(
    {
      id: 'game-outer-wilds',
      title: 'Outer Wilds',
      type: 'game',
      description: 'Exploracion espacial de misterio, memoria y curiosidad pura.',
      releaseYear: 2019,
      genres: ['misterio', 'exploracion', 'sci-fi'],
      tags: ['juego', 'raro', 'sin spoilers'],
      moodTags: ['sorpresa', 'intenso'],
      posterUrl: 'https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/753640/library_600x900_2x.jpg',
    },
    'demo-moderator',
  ),
  buildPublicCatalogItem(
    {
      id: 'movie-arrival',
      title: 'Arrival',
      type: 'movie',
      description: 'Ciencia ficcion contemplativa sobre lenguaje, duelo y tiempo.',
      releaseYear: 2016,
      genres: ['sci-fi', 'drama'],
      tags: ['pelicula', 'contemplativa'],
      moodTags: ['denso'],
    },
    'demo-moderator',
  ),
  buildPublicCatalogItem(
    {
      id: 'movie-dune-2021',
      title: 'Dune',
      type: 'movie',
      description: 'Ciencia ficcion politica de desierto, casas nobles y poder mesianico.',
      releaseYear: 2021,
      genres: ['sci-fi', 'aventura'],
      tags: ['pelicula', 'space opera'],
      moodTags: ['epico', 'denso'],
      externalRefs: {
        sourceUrl: 'https://www.themoviedb.org/movie/438631-dune',
      },
    },
    'demo-moderator',
  ),
]
