import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { LEFT_W } from './layout'
import type { Cell, Fill, Section, Selection, Tool } from './selection'

type Stroke = Exclude<Tool, 'select'>

interface Options {
  scrollRef: RefObject<HTMLDivElement | null>
  /** The section a drag across cells started in. */
  dragging: RefObject<Section | null>
  /** The drag of the fill handle in progress. */
  fillRef: RefObject<Fill | null>
  /** The tool of the stroke being drawn. */
  strokeRef: RefObject<Stroke | null>
  /** The cell a Shift-click started on, until the mouse is dragged on. */
  spring: RefObject<Cell | null>
  setFill: Dispatch<SetStateAction<Fill | null>>
  setSelection: Dispatch<SetStateAction<Selection | null>>
  setStroke: (stroke: Stroke | null) => void
  /** What ends a drag, and the columns as they are now. */
  drawDemand: () => void
  eraseDrawn: () => void
  commitFill: () => void
  colW: number
  dayCount: number
}

/**
 * A drag ends wherever the mouse is released. While it lasts, the grid follows the mouse past its left
 * and right edges. The listeners are attached once and read what they need from a ref, so a drag is not
 * disturbed when the rows or the tool change under it.
 */
export function useGridDrag({ scrollRef, dragging, fillRef, strokeRef, spring, setFill, setSelection, setStroke, ...latest }: Options) {
  const env = useRef(latest)
  useEffect(() => {
    env.current = latest
  })
  useEffect(() => {
    let mouseX: number | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    const follow = () => {
      const el = scrollRef.current
      if (!el || mouseX === null || !(dragging.current || fillRef.current)) return
      const { colW, dayCount } = env.current
      const rect = el.getBoundingClientRect()
      const step = mouseX > rect.right - 24 ? colW : mouseX < rect.left + LEFT_W + 24 ? -colW : 0
      if (!step) return
      el.scrollLeft += step
      // No cell is entered while the grid moves under a still mouse, so the selection follows the scroll.
      const col = Math.max(0, Math.min(dayCount - 1, Math.floor((Math.min(Math.max(mouseX, rect.left + LEFT_W), rect.right - 1) - rect.left - LEFT_W + el.scrollLeft) / colW)))
      if (fillRef.current) setFill((f) => f && { ...f, toCol: Math.max(f.col0, col) })
      else setSelection((sel) => (sel && sel.focus.col !== col ? { ...sel, focus: { ...sel.focus, col } } : sel))
    }
    const rest = () => {
      mouseX = null
      clearInterval(timer)
      timer = undefined
    }
    const setStretch = (stretch: boolean) => {
      if (fillRef.current && fillRef.current.stretch !== stretch) setFill((f) => f && { ...f, stretch })
    }
    const onMove = (e: MouseEvent) => {
      mouseX = dragging.current || fillRef.current ? e.clientX : null
      // The timer runs only while something is being dragged.
      if (mouseX !== null && timer === undefined) timer = setInterval(follow, 60)
      setStretch(e.altKey)
    }
    // Alt can be pressed or let go while the mouse rests.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && fillRef.current) {
        e.preventDefault()
        setStretch(e.type === 'keydown')
      }
    }
    const onUp = () => {
      rest()
      const { drawDemand, eraseDrawn, commitFill } = env.current
      if (fillRef.current) {
        commitFill()
        return
      }
      const section = dragging.current
      const drawn = strokeRef.current
      dragging.current = null
      strokeRef.current = null
      spring.current = null
      setStroke(null)
      if (section === 'alloc' && drawn === 'pencil') drawDemand()
      if (section === 'alloc' && drawn === 'eraser') eraseDrawn()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('keydown', onKey)
    window.addEventListener('keyup', onKey)
    return () => {
      rest()
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('keyup', onKey)
    }
    // The refs and the setters keep their identity.
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
}
