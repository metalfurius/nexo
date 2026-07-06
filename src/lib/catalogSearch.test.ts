import { describe, expect, it } from 'vitest'
import { dedupeCatalogSearchCandidates, rankCatalogSearchCandidates, scoreCatalogSearchCandidate } from './catalogSearch'

describe('catalog search relevance', () => {
  it.each([
    ['Oyasumi punpun', 'Oyasumi Punpun', 'Oyasumi Sleeping Beauty'],
    ['Furare girl', 'Furare Girl', 'The Rolling Girls'],
    ['Kawaii nante kiitenai', 'Kawaii nante Kiitenai!!', 'Kawaii dake ja Nai Shikimori-san'],
    ['Fundari Kettari Aishitari', 'Fundari, Kettari, Aishitari', 'Ai Shite Knight'],
  ])('puts exact manga matches above anime partials for %s', (query, exactTitle, partialTitle) => {
    const ranked = rankCatalogSearchCandidates(
      [
        candidate(partialTitle, 'anime', 'anilist'),
        candidate(exactTitle, 'manga', 'jikan', {
          sourceUrl: `https://myanimelist.net/manga/1/${exactTitle.replace(/\s+/g, '_')}`,
        }),
      ],
      query,
      'any',
    )

    expect(ranked[0].title).toBe(exactTitle)
  })

  it('keeps ambiguous results while prioritizing the closest catalog hit', () => {
    const chitraResults = rankCatalogSearchCandidates(
      [
        candidate('Chitra', 'manhwa', 'jikan'),
        candidate('Chitra Ganesh', 'book', 'openLibrary'),
        candidate('The Chitral Expedition', 'book', 'openLibrary'),
      ],
      'Chitra',
      'any',
    )
    const starResults = rankCatalogSearchCandidates(
      [
        candidate('Princess Star Wish', 'anime', 'anilist'),
        candidate('A Wish Upon a Star', 'manga', 'jikan'),
        candidate('Wish', 'movie', 'tmdb'),
      ],
      'A wish upon a star',
      'any',
    )

    expect(chitraResults).toHaveLength(3)
    expect(chitraResults[0].title).toBe('Chitra')
    expect(starResults).toHaveLength(2)
    expect(starResults[0].title).toBe('A Wish Upon a Star')
    expect(scoreCatalogSearchCandidate('A wish upon a star', starResults[1])).toBeLessThan(
      scoreCatalogSearchCandidate('A wish upon a star', starResults[0]),
    )
  })

  it('handles compact punctuation and source URL title matches', () => {
    const ranked = rankCatalogSearchCandidates(
      [
        candidate('Class President is a Maid', 'anime', 'anilist'),
        candidate('Kaichou wa Maid-sama!', 'manga', 'jikan'),
        candidate('Say "I Love You".', 'manga', 'jikan', {
          sourceUrl: 'https://myanimelist.net/manga/11767/Suki_tte_Ii_na_yo',
        }),
      ],
      'suki tte ii na yo',
      'manga',
    )
    const maidRanked = rankCatalogSearchCandidates(
      [
        candidate('Maid in Abyss', 'anime', 'anilist'),
        candidate('Kaichou wa Maid-sama!', 'manga', 'jikan'),
      ],
      'maid-sama',
      'any',
    )

    expect(ranked[0].title).toBe('Say "I Love You".')
    expect(maidRanked[0].title).toBe('Kaichou wa Maid-sama!')
  })

  it('uses curated aliases without hardcoding titles in the scorer', () => {
    const ranked = rankCatalogSearchCandidates(
      [
        candidate('Hero Rival Show', 'anime', 'anilist'),
        {
          ...candidate('Your Ultimate Love Rival', 'manhwa', 'nexo'),
          searchAliases: ["I have become the hero's rival"],
          searchTokens: ['your', 'ultimate', 'love', 'rival', 'hero'],
        },
      ],
      "I have become the hero's rival",
      'any',
    )

    expect(ranked[0].title).toBe('Your Ultimate Love Rival')
  })

  it('uses provider aliases without requiring curated catalog entries', () => {
    const ranked = rankCatalogSearchCandidates(
      [
        candidate('Night School', 'manga', 'jikan'),
        {
          ...candidate('Painter of the Night', 'manhwa', 'mangaDex'),
          searchAliases: ['Pintor Nocturno', 'Yahwacheop'],
        },
      ],
      'Pintor nocturno',
      'manhwa',
    )

    expect(ranked[0].title).toBe('Painter of the Night')
  })

  it('does not count type-only matches as search hits', () => {
    expect(scoreCatalogSearchCandidate('Odisea', candidate('Outer Wilds', 'game', 'nexo'), 'game')).toBe(0)
  })

  it('filters broad Spanish connector noise without hiding the exact book match', () => {
    const ranked = rankCatalogSearchCandidates(
      [
        {
          ...candidate('En tu siglo o en el mio', 'book', 'googleBooks'),
          searchAliases: ['En tu siglo o en el mio', 'Laia Tinaut'],
        },
        candidate("Frieren: Beyond Journey's End", 'anime', 'anilist', {
          sourceUrl: 'https://anilist.co/anime/154587',
        }),
        {
          ...candidate('Hana no O-en Step', 'manga', 'jikan'),
          overview: 'A future adventure about students assigned to a dorm.',
          searchAliases: ['\u82b1\u306eO-EN\u30b9\u30c6\u30c3\u30d7'],
        },
      ],
      'En tu siglo o en el mio',
      'any',
    )

    expect(ranked.map((entry) => entry.title)).toEqual(['En tu siglo o en el mio'])
  })

  it.each([
    [
      'One Piece',
      candidate('One Piece', 'anime', 'jikan'),
      {
        ...candidate('Straw Hat Almanac', 'book', 'googleBooks'),
        overview: 'A historian finds one piece of evidence after another.',
      },
    ],
    [
      'Dune',
      candidate('Dune', 'movie', 'tmdb'),
      {
        ...candidate('Desert Planet', 'game', 'rawg'),
        overview: 'Explore a shifting dune in a survival sandbox.',
      },
    ],
    [
      'The Last of Us',
      candidate('The Last of Us', 'series', 'tmdb'),
      {
        ...candidate('Apocalypse Dispatch', 'movie', 'tmdb'),
        overview: 'The last of us will write one final message.',
      },
    ],
    [
      'Chainsaw Man',
      candidate('Chainsaw Man', 'manga', 'jikan'),
      {
        ...candidate('Toolbox Manual', 'book', 'openLibrary'),
        overview: 'A chainsaw man repairs equipment in short essays.',
      },
    ],
    [
      'Painter of the Night',
      candidate('Painter of the Night', 'manhwa', 'mangaDex'),
      {
        ...candidate('Night Gallery', 'movie', 'tmdb'),
        overview: 'A painter of the night sky becomes famous.',
      },
    ],
  ])('requires title or alias signal before secondary metadata can rank %s', (query, exact, noise) => {
    const ranked = rankCatalogSearchCandidates([noise, exact], query, 'any')

    expect(ranked.map((entry) => entry.title)).toEqual([exact.title])
  })

  it('prefers canonical anime and manga indexes over broad chapter catalogs when text relevance ties', () => {
    const ranked = rankCatalogSearchCandidates(
      [
        candidate('Example Saga', 'manga', 'mangaDex'),
        candidate('Example Saga', 'anime', 'jikan'),
        candidate('Example Saga', 'manga', 'kitsu'),
      ],
      'Example Saga',
      'any',
    )

    expect(ranked.map((entry) => entry.source)).toEqual(['jikan', 'kitsu', 'mangaDex'])
  })

  it('dedupes public Nexo matches against external providers for the same work', () => {
    const dune2021Nexo = {
      ...candidate('Dune', 'movie', 'nexo', { tmdbId: '438631' }),
      overview: 'Ficha curada de Nexo.',
      releaseYear: 2021,
    }
    const dune2021Tmdb = {
      ...candidate('Dune', 'movie', 'tmdb', { tmdbId: '438631' }),
      overview: 'External TMDB copy.',
      releaseYear: 2021,
    }
    const dune1984Tmdb = {
      ...candidate('Dune', 'movie', 'tmdb', { tmdbId: '841' }),
      releaseYear: 1984,
    }
    const duneGameNexo = {
      ...candidate('Dune', 'game', 'nexo'),
      releaseYear: 1992,
    }
    const duneGameRawg = {
      ...candidate('Dune', 'game', 'rawg'),
      releaseYear: 1992,
    }

    const ranked = rankCatalogSearchCandidates(
      dedupeCatalogSearchCandidates([duneGameRawg, dune2021Tmdb, dune2021Nexo, dune1984Tmdb, duneGameNexo]),
      'Dune',
      'any',
    )

    expect(ranked).toHaveLength(3)
    expect(ranked).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ releaseYear: 2021, source: 'nexo', type: 'movie' }),
        expect.objectContaining({ releaseYear: 1984, source: 'tmdb', type: 'movie' }),
        expect.objectContaining({ releaseYear: 1992, source: 'nexo', type: 'game' }),
      ]),
    )
  })

  it('dedupes shared external identities with harmless formatting differences', () => {
    const ranked = rankCatalogSearchCandidates(
      dedupeCatalogSearchCandidates([
        {
          ...candidate('Dune', 'movie', 'tmdb', { tmdbId: ' 438631 ' }),
          overview: 'External TMDB copy.',
          releaseYear: 2021,
        },
        {
          ...candidate('Dune', 'movie', 'nexo', { tmdbId: '438631' }),
          overview: 'Ficha curada de Nexo.',
          releaseYear: 2021,
        },
        {
          ...candidate('The Left Hand of Darkness', 'book', 'openLibrary', { isbn: '978-0-441-47812-5' }),
          releaseYear: 1969,
        },
        {
          ...candidate('The Left Hand of Darkness', 'book', 'googleBooks', { isbn: '9780441478125' }),
          releaseYear: 1969,
        },
        {
          ...candidate('Control', 'game', 'wikidata', { wikidataId: 'q54820300' }),
          releaseYear: 2019,
        },
        {
          ...candidate('Control', 'game', 'rawg', { wikidataId: ' Q54820300 ' }),
          releaseYear: 2019,
        },
      ]),
      'Dune',
      'any',
    )

    expect(ranked).toHaveLength(1)
    expect(ranked[0]).toEqual(expect.objectContaining({ source: 'nexo', title: 'Dune' }))

    const deduped = dedupeCatalogSearchCandidates([
      candidate('The Left Hand of Darkness', 'book', 'openLibrary', { isbn: '978-0-441-47812-5' }),
      candidate('The Left Hand of Darkness', 'book', 'googleBooks', { isbn: '9780441478125' }),
      candidate('Control', 'game', 'wikidata', { wikidataId: 'q54820300' }),
      candidate('Control', 'game', 'rawg', { wikidataId: ' Q54820300 ' }),
    ])

    expect(deduped).toHaveLength(2)
    expect(deduped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: 'The Left Hand of Darkness' }),
        expect.objectContaining({ title: 'Control' }),
      ]),
    )
  })

  it('keeps the real catalog audit list findable through exact titles or curated aliases', () => {
    const fixtures = [
      ['akatsuki no yona', 'Yona of the Dawn', ['Akatsuki no Yona']],
      ['dengeki daisy', 'Dengeki Daisy', []],
      ['fruit basket', 'Fruits Basket', ['Fruit Basket']],
      ['kaichou wa maid sama', 'Kaichou wa Maid-sama!', []],
      ['kimi ni todoke', 'Kimi ni Todoke', []],
      ['kamisama hajimemasjita', 'Kamisama Hajimemashita', ['Kamisama Hajimemasjita']],
      ['suki te ii na yo', 'Say "I Love You".', ['Suki te ii na yo', 'Suki tte Ii na yo']],
      ['Akagami no shirayuki hime', 'Snow White with the Red Hair', ['Akagami no Shirayuki-hime']],
      ['Oyasumi punpun', 'Oyasumi Punpun', []],
      ['Chitra', 'Chitra', []],
      ['kono oto tomare', 'Kono Oto Tomare!', []],
      ['Furare girl', 'Furare Girl', []],
      ['Cavier falcon princess', 'Carrier Falcon Princess', ['Cavier Falcon Princess']],
      ["I have become the hero's rival", 'Your Ultimate Love Rival', ["I have become the hero's rival"]],
      ['Kawaii nante kiitenai', 'Kawaii nante Kiitenai!!', []],
      ['Please cry, crown prince', 'Cry for Me Crown Prince', ['Please Cry, Crown Prince']],
      ['A wish upon a star', 'A Wish Upon a Star', []],
      ['Uruwashi no yoi no tsuki', 'Uruwashi no Yoi no Tsuki', []],
      ['Fundari, Kettari, Aishitari', 'Fundari, Kettari, Aishitari', []],
    ] as const
    const noise = [
      candidate('Wish Princess Girl Star', 'anime', 'anilist'),
      candidate('Kawaii dake ja Nai Shikimori-san', 'anime', 'anilist'),
      candidate('The Rolling Girls', 'anime', 'anilist'),
    ]

    for (const [query, title, aliases] of fixtures) {
      const ranked = rankCatalogSearchCandidates(
        [
          ...noise,
          {
            ...candidate(title, 'manga', 'nexo'),
            searchAliases: [...aliases],
            searchTokens: [...aliases, title].flatMap((entry) => entry.toLowerCase().split(/\s+/)),
          },
        ],
        query,
        'any',
      )

      expect(ranked[0].title).toBe(title)
    }
  })
})

function candidate(
  title: string,
  type: 'anime' | 'book' | 'game' | 'manga' | 'manhwa' | 'movie' | 'series',
  source: 'anilist' | 'googleBooks' | 'jikan' | 'kitsu' | 'mangaDex' | 'nexo' | 'openLibrary' | 'rawg' | 'tmdb' | 'wikidata',
  externalRefs = {},
) {
  return {
    title,
    type,
    source,
    sourceId: title,
    genres: [],
    tags: [],
    moodTags: [],
    searchTokens: [],
    externalRefs,
  }
}
