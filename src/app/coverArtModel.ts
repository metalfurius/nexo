import type { CSSProperties } from 'react'
import type { ItemType } from '../domain/types'

export const coverArtPalettes: Record<ItemType, Array<[string, string, string]>> = {
  anime: [['#7dd3fc', '#c084fc', '#0f172a'], ['#f9a8d4', '#67e8f9', '#1e1b4b']],
  book: [['#fbbf24', '#7c3aed', '#1c1917'], ['#f59e0b', '#10b981', '#111827']],
  comic: [['#fb7185', '#fde047', '#18181b'], ['#38bdf8', '#fb923c', '#111827']],
  game: [['#34d399', '#60a5fa', '#06130f'], ['#22d3ee', '#a3e635', '#111827']],
  manga: [['#f472b6', '#facc15', '#1f1020'], ['#a78bfa', '#fda4af', '#18181b']],
  manhwa: [['#2dd4bf', '#f472b6', '#111827'], ['#60a5fa', '#fbbf24', '#0f172a']],
  movie: [['#93c5fd', '#f97316', '#111827'], ['#38bdf8', '#c084fc', '#0f172a']],
  other: [['#a7f3d0', '#f0abfc', '#111827'], ['#fde68a', '#67e8f9', '#1f2937']],
  series: [['#818cf8', '#22c55e', '#111827'], ['#fda4af', '#60a5fa', '#1e1b4b']],
}

export function getCoverArtStyle(title: string, type: ItemType): CSSProperties {
  const palettes = coverArtPalettes[type]
  const palette = palettes[Math.abs(hashText(`${type}:${title}`)) % palettes.length]
  return {
    '--cover-accent-a': palette[0],
    '--cover-accent-b': palette[1],
    '--cover-ink': palette[2],
  } as CSSProperties
}

export function getCoverArtTitle(title: string) {
  const words = title.replace(/\([^)]*\)/g, '').split(/\s+/).map((word) => word.trim()).filter(Boolean)
  return (words.slice(0, 3).join(' ') || title.trim() || 'Nexo').slice(0, 48)
}

export function hashText(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = (hash * 31 + value.charCodeAt(index)) | 0
  return hash
}
