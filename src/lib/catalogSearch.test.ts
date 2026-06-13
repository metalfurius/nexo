import { describe, expect, it } from 'vitest'
import { rankCatalogSearchCandidates, scoreCatalogSearchCandidate } from './catalogSearch'

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
  type: 'anime' | 'book' | 'game' | 'manga' | 'manhwa' | 'movie',
  source: 'anilist' | 'googleBooks' | 'jikan' | 'kitsu' | 'mangaDex' | 'nexo' | 'openLibrary' | 'tmdb',
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
