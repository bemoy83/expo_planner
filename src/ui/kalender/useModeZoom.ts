import { useCallback, useEffect, useRef } from 'react'
import { heldColumns, ZOOM_MS, zoomFrame, type HeldColumns, type ZoomPoint } from './zoom'

/**
 * The zoom between two column widths (R28): the width of a day changes on every frame while the day at
 * the left edge moves to where it ends. A frame is a width and a place written to the page (`step`);
 * the lines are drawn once, with the days of the whole way (`hold`), and not again until the end.
 * Returns the function that starts one, from the width on screen. `then` runs with the last frame, and is
 * where the width zoomed to is made the width in use. With reduced motion, or where the way is too long
 * to draw in one go, there is one frame only.
 */
export function useModeZoom(zoomFrom: () => ZoomPoint & { room: number }, step: (left: number, colW: number) => void, hold: (columns: HeldColumns | null) => void, placeLeft: (left: number, colW: number) => void) {
  const frame = useRef(0)
  useEffect(() => () => cancelAnimationFrame(frame.current), [])
  return useCallback(
    (to: ZoomPoint, then?: () => void) => {
      cancelAnimationFrame(frame.current)
      const from = zoomFrom()
      const end = () => {
        hold(null)
        placeLeft(to.left, to.colW)
        then?.()
      }
      const columns = from.room > 0 ? heldColumns(from, to, from.room) : null
      if (!columns || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return end()
      hold(columns)
      // The width zoomed from holds from now on, whatever the rows are changed to in the meantime.
      step(from.left, from.colW)
      const started = performance.now()
      const next = (now: number) => {
        const progress = (now - started) / ZOOM_MS
        if (progress >= 1) return end()
        const at = zoomFrame(from, to, progress)
        step(at.left, at.colW)
        frame.current = requestAnimationFrame(next)
      }
      frame.current = requestAnimationFrame(next)
    },
    [zoomFrom, step, hold, placeLeft],
  )
}
