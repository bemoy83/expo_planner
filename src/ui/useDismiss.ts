import { useEffect, type RefObject } from 'react'
import { useStableActions } from './kalender/useStableActions'

interface DismissOptions {
  /**
   * The first press outside only closes it: the press is swallowed, with its click, so it selects nothing and presses nothing
   * under it, and Escape goes no further (Innleid's popover of orders over the grid).
   */
  swallow?: boolean
  /** Enter does this, where it is not typed in a field. */
  onEnter?: () => void
}

/** Closes a menu or popover on a press outside `ref` and on Escape. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void, { swallow = false, onEnter }: DismissOptions = {}) {
  const latest = useStableActions({ close: () => setOpen(false), enter: () => onEnter?.() })
  const hasEnter = onEnter !== undefined
  useEffect(() => {
    if (!open) return
    let swallowing = false
    const onDown = (e: MouseEvent) => {
      if (ref.current?.contains(e.target as Node)) return
      if (swallow) {
        e.preventDefault()
        e.stopPropagation()
        swallowing = true
      }
      latest.close()
    }
    const onClick = (e: MouseEvent) => {
      if (!swallowing) return
      e.preventDefault()
      e.stopPropagation()
      swallowing = false
    }
    const onKey = (e: KeyboardEvent) => {
      const enter = e.key === 'Enter' && hasEnter && !(e.target instanceof HTMLInputElement)
      if (e.key !== 'Escape' && !enter) return
      if (swallow) {
        e.preventDefault()
        e.stopPropagation()
      }
      if (enter) latest.enter()
      else latest.close()
    }
    document.addEventListener('mousedown', onDown, swallow)
    document.addEventListener('keydown', onKey, swallow)
    if (swallow) document.addEventListener('click', onClick, true)
    return () => {
      document.removeEventListener('mousedown', onDown, swallow)
      document.removeEventListener('keydown', onKey, swallow)
      // The click of the press that closed it comes after this: it is let through to be swallowed, then the listener goes.
      if (swallow) setTimeout(() => document.removeEventListener('click', onClick, true))
    }
  }, [ref, open, swallow, hasEnter, latest])
}
