import { useEffect, useRef, type RefObject } from 'react'
import { PANEL_W } from '../cssVars'
import { LEFT_W } from '../kalender/layout'
import { useStableActions } from '../kalender/useStableActions'

/** How near the edges of the days the pointer makes a stroke scroll the grid: the right edge, the label column, the bottom. */
const SCROLL_NEAR_RIGHT = 40
const SCROLL_NEAR_LEFT = 16
const SCROLL_NEAR_BOTTOM = 30

/** Where across the days a point of the window is, counted in days from the first: the whole of it is the column, the rest how far into that day. */
export const daysAcross = (el: HTMLElement, x: number, colW: number): number => (x - el.getBoundingClientRect().left - LEFT_W + el.scrollLeft) / colW

interface Handlers {
  /** The pointer is somewhere else, or the grid has scrolled under it. */
  move: (x: number, y: number) => void
  /** The button is let go, wherever the pointer is. */
  up: (e: MouseEvent) => void
}

/**
 * A press followed to its let-go, in both parts of Bemanning: the pointer is read wherever it goes, not only over the days,
 * and near the edges of the days the grid scrolls on under a still pointer. The handlers are read anew on every event.
 * `panelOpen`: a side panel lies over the right edge of the days, so a stroke scrolls on short of it.
 */
export function useFollowPointer(scrollRef: RefObject<HTMLDivElement | null>, panelOpen: RefObject<boolean>, handlers: Handlers) {
  const on = useStableActions(handlers)
  const stopRef = useRef<(() => void) | null>(null)
  /** Where the pointer was last seen, while a press is followed. */
  const pointer = useRef<{ x: number; y: number } | null>(null)

  const stop = () => {
    stopRef.current?.()
    pointer.current = null
  }
  /** Follows a press from the point it went down at. */
  const follow = (x: number, y: number) => {
    stopRef.current?.()
    pointer.current = { x, y }
    const onMove = (e: MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY }
      on.move(e.clientX, e.clientY)
    }
    const timer = setInterval(() => {
      const el = scrollRef.current
      const at = pointer.current
      if (!el || !at) return
      const box = el.getBoundingClientRect()
      const dx = at.x > box.right - SCROLL_NEAR_RIGHT - (panelOpen.current ? PANEL_W : 0) ? 1 : at.x < box.left + LEFT_W + SCROLL_NEAR_LEFT ? -1 : 0
      const dy = at.y > box.bottom - SCROLL_NEAR_BOTTOM ? 1 : 0
      if (!dx && !dy) return
      el.scrollLeft += dx * 40
      el.scrollTop += dy * 20
      on.move(at.x, at.y)
    }, 60)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', on.up)
    stopRef.current = () => {
      clearInterval(timer)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', on.up)
      stopRef.current = null
    }
  }
  useEffect(() => () => stopRef.current?.(), [])
  return { follow, stop, pointer, move: on.move }
}
