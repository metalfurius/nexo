import { useLayoutEffect, useRef, type RefObject } from 'react'

const ROADMAP_ITEM_SELECTOR = '[data-roadmap-item-id]'

function capturePositions(root: HTMLElement) {
  const positions = new Map<string, DOMRect>()
  root.querySelectorAll<HTMLElement>(ROADMAP_ITEM_SELECTOR).forEach((element) => {
    const id = element.dataset.roadmapItemId
    if (id) positions.set(id, element.getBoundingClientRect())
  })
  return positions
}

export function useRoadmapFlip(rootRef: RefObject<HTMLElement | null>, signature: string) {
  const previousPositions = useRef<Map<string, DOMRect>>(new Map())

  useLayoutEffect(() => {
    const root = rootRef.current
    if (!root) return

    const nextPositions = capturePositions(root)
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (!reduceMotion && previousPositions.current.size > 0) {
      root.querySelectorAll<HTMLElement>(ROADMAP_ITEM_SELECTOR).forEach((element) => {
        const id = element.dataset.roadmapItemId
        const previous = id ? previousPositions.current.get(id) : undefined
        const next = id ? nextPositions.get(id) : undefined
        if (!previous || !next) return

        const x = previous.left - next.left
        const y = previous.top - next.top
        if (Math.abs(x) < 1 && Math.abs(y) < 1) return
        if (typeof element.animate !== 'function') return

        element.animate(
          [
            { transform: `translate(${x}px, ${y}px)`, offset: 0 },
            { transform: 'translate(0, 0)', offset: 1 },
          ],
          { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' },
        )
      })
    }

    previousPositions.current = nextPositions
  }, [rootRef, signature])
}
