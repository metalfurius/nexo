import { BookOpen, Film, Gamepad2, Library } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ItemType } from '../domain/types'
import { itemTypeLabels } from '../lib/libraryItemInsights'
import { getCoverArtStyle, getCoverArtTitle } from './coverArtModel'

export type CoverArtPresentation = 'default' | 'hero'

export interface CoverArtProps {
  posterUrl?: string
  presentation?: CoverArtPresentation
  priority?: boolean
  title: string
  type: ItemType
}

const coverIcons: Record<ItemType, typeof Film> = {
  anime: Film,
  book: BookOpen,
  comic: BookOpen,
  game: Gamepad2,
  manga: BookOpen,
  manhwa: BookOpen,
  movie: Film,
  other: Library,
  series: Film,
}

export function CoverArt({ posterUrl, presentation = 'default', priority = false, title, type }: CoverArtProps) {
  const [failedPosterUrl, setFailedPosterUrl] = useState<string>()
  const shouldShowPoster = Boolean(posterUrl && failedPosterUrl !== posterUrl)
  const fallbackStyle = useMemo(() => getCoverArtStyle(title, type), [title, type])
  const Icon = coverIcons[type]
  const className = [
    'cover-art',
    type,
    presentation === 'hero' ? 'cover-art-hero' : undefined,
    shouldShowPoster ? 'with-poster' : 'fallback-cover',
  ].filter(Boolean).join(' ')

  return (
    <div aria-hidden="true" className={className} data-presentation={presentation} style={shouldShowPoster ? undefined : fallbackStyle}>
      {shouldShowPoster && (
        <img
          alt=""
          fetchPriority={priority ? 'high' : undefined}
          loading={priority ? 'eager' : 'lazy'}
          src={posterUrl}
          onError={() => setFailedPosterUrl(posterUrl)}
        />
      )}
      {!shouldShowPoster && (
        <>
          <span className="cover-art-letter">{title.slice(0, 1).toUpperCase()}</span>
          <span className="cover-art-type">{itemTypeLabels[type]}</span>
          <strong className="cover-art-title">{getCoverArtTitle(title)}</strong>
          <Icon className="cover-art-icon" size={24} aria-hidden="true" />
        </>
      )}
    </div>
  )
}
