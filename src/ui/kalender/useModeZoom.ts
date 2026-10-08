import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { ZOOM_MS, zoomFrame, type ZoomPoint } from './zoom'

/**
 * The zoom between two column widths (R28): the width is drawn anew on every frame while the day at the
 * left edge moves to where it ends. Returns the function that starts one, from the width in use. `then`
 * runs with the last frame, and is where the width zoomed to is made the width in use. With reduced
 * motion there is one frame only.
 */
export function useModeZoom(scrollRef: RefObject<HTMLDivElement | null>, setWidth: (colW: number | null) => void, placeLeft: (left: number, colW: number) => void) {
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  return useCallback(
    (fromW: number, to: ZoomPoint, then?: () => void) => {
      cancelAnimationFrame(frame.current)
      const el = scrollRef.current
      const from = { colW: fromW, left: (el?.scrollLeft ?? 0) / fromW }
      const end = () => {
        setWidth(null)
        placeLeft(to.left, to.colW)
        then?.()
      }
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return end()
      // The width zoomed from holds from now on, whatever the rows are changed to in the meantime.
      setWidth(from.colW)
      const started = performance.now()
      const step = (now: number) => {
        const progress = (now - started) / ZOOM_MS
        if (progress >= 1) return end()
        const at = zoomFrame(from, to, progress)
        setWidth(at.colW)
        placeLeft(at.left, at.colW)
        frame.current = requestAnimationFrame(step)
      }
      frame.current = requestAnimationFrame(step)
    },
    [scrollRef, setWidth, placeLeft],
  )
}
