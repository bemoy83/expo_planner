import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { LEFT_W } from './layout'
import type { Cell, Fill, Grip, Pull, Selection, Tool } from './selection'

type Stroke = Exclude<Tool, 'select'>

/** How far the mouse moves from a press on an end of a span before it says what the press is. */
const GRIP_SLOP = 4

const pullMode = (e: MouseEvent | KeyboardEvent): Pull['mode'] => (e.altKey ? 'sum' : e.shiftKey ? 'demand' : 'carry')

interface Options {
  scrollRef: RefObject<HTMLDivElement | null>
  /** A drag across cells is in progress. */
  dragging: RefObject<boolean>
  /** The drag of the fill handle in progress. */
  fillRef: RefObject<Fill | null>
  /** The tool of the stroke being drawn. */
  strokeRef: RefObject<Stroke | null>
  /** The cell a Shift-click started on, until the mouse is dragged on. */
  spring: RefObject<Cell | null>
  /** The press on an end of a span that has not moved yet, and the pull of that end in progress. */
  gripRef: RefObject<Grip | null>
  /** The cell a plain press with «Velg» is on, until the mouse reaches another cell or is let go: a press selects nothing by itself. */
  pressed: RefObject<Cell | null>
  pullRef: RefObject<Pull | null>
  setPull: Dispatch<SetStateAction<Pull | null>>
  setFill: Dispatch<SetStateAction<Fill | null>>
  setSelection: Dispatch<SetStateAction<Selection | null>>
  setStroke: (stroke: Stroke | null) => void
  /** What ends a drag, and the columns as they are now. */
  drawDemand: () => void
  eraseDrawn: () => void
  commitFill: () => void
  startPull: (grip: Grip, toCol: number, mode: Pull['mode']) => void
  /** Selects the cell of a press, once it is a click or, on an end of a span, no pull. */
  gripSelect: (cell: Cell) => void
  commitPull: () => void
  colW: number
  dayCount: number
}

/**
 * A drag ends wherever the mouse is released. While it lasts, the grid follows the mouse past its left
 * and right edges. A press on an end of a span becomes a pull of that end once the mouse moves sideways,
 * and a stroke or a selection as from any cell once it moves up or down. The listeners are attached once and read what they need from a ref, so a drag is not
 * disturbed when the rows or the tool change under it.
 */
export function useGridDrag({ scrollRef, dragging, fillRef, strokeRef, spring, gripRef, pressed, pullRef, setFill, setPull, setSelection, setStroke, ...latest }: Options) {
  const env = useRef(latest)
  useEffect(() => {
    env.current = latest
  })
  useEffect(() => {
    let mouseX: number | null = null
    let timer: ReturnType<typeof setInterval> | undefined
    /** The day under the mouse, or the nearest one in view. */
    const colAt = (x: number) => {
      const el = scrollRef.current
      if (!el) return 0
      const { colW, dayCount } = env.current
      const rect = el.getBoundingClientRect()
      return Math.max(0, Math.min(dayCount - 1, Math.floor((Math.min(Math.max(x, rect.left + LEFT_W), rect.right - 1) - rect.left - LEFT_W + el.scrollLeft) / colW)))
    }
    const pullTo = (toCol: number, mode?: Pull['mode']) => setPull((p) => (p && (p.toCol !== toCol || (mode && p.mode !== mode)) ? { ...p, toCol, mode: mode ?? p.mode } : p))
    const follow = () => {
      const el = scrollRef.current
      if (!el || mouseX === null || !(dragging.current || fillRef.current || pullRef.current)) return
      const { colW } = env.current
      const rect = el.getBoundingClientRect()
      const step = mouseX > rect.right - 24 ? colW : mouseX < rect.left + LEFT_W + 24 ? -colW : 0
      if (!step) return
      el.scrollLeft += step
      // No cell is entered while the grid moves under a still mouse, so the selection follows the scroll.
      const col = colAt(mouseX)
      if (pullRef.current) pullTo(col)
      else if (fillRef.current) setFill((f) => f && { ...f, toCol: Math.max(f.col0, col) })
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
      const grip = gripRef.current
      if (grip && Math.max(Math.abs(e.clientX - grip.x), Math.abs(e.clientY - grip.y)) >= GRIP_SLOP) {
        gripRef.current = null
        if (Math.abs(e.clientX - grip.x) >= Math.abs(e.clientY - grip.y)) env.current.startPull(grip, colAt(e.clientX), pullMode(e))
        else {
          // Up or down, it is a drag as from any cell, and starts on the cell that was pressed.
          env.current.gripSelect(grip)
          dragging.current = true
          strokeRef.current = grip.stroke
          setStroke(grip.stroke)
        }
      } else if (pullRef.current) pullTo(colAt(e.clientX), pullMode(e))
      mouseX = dragging.current || fillRef.current || pullRef.current ? e.clientX : null
      // The timer runs only while something is being dragged.
      if (mouseX !== null && timer === undefined) timer = setInterval(follow, 60)
      setStretch(e.altKey)
    }
    // Alt and Shift can be pressed or let go while the mouse rests.
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Alt' || e.key === 'Shift') && pullRef.current) {
        e.preventDefault()
        setPull((p) => p && { ...p, mode: pullMode(e) })
      } else if (e.key === 'Alt' && fillRef.current) {
        e.preventDefault()
        setStretch(e.type === 'keydown')
      }
    }
    const onUp = () => {
      rest()
      const { drawDemand, eraseDrawn, commitFill, commitPull, gripSelect } = env.current
      if (fillRef.current) {
        commitFill()
        return
      }
      if (pullRef.current) {
        commitPull()
        return
      }
      // A press on an end of a span that never moved is a click, and the tool does what it does on any cell.
      if (gripRef.current) {
        gripSelect(gripRef.current)
        dragging.current = true
        strokeRef.current = gripRef.current.stroke
      }
      gripRef.current = null
      // A press that never reached another cell is a click, and selects its cell now.
      if (pressed.current) gripSelect(pressed.current)
      pressed.current = null
      const dragged = dragging.current
      const drawn = strokeRef.current
      dragging.current = false
      strokeRef.current = null
      spring.current = null
      setStroke(null)
      if (dragged && drawn === 'pencil') drawDemand()
      if (dragged && drawn === 'eraser') eraseDrawn()
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
