import { useEffect, useRef, type Dispatch, type RefObject, type SetStateAction } from 'react'
import { LEFT_W } from './layout'
import type { Cell, Press, Pull, Selection, Tool } from './selection'

type Stroke = Exclude<Tool, 'select'>

/** How far the mouse moves from a press on an end of a span before it says what the press is. */
const GRIP_SLOP = 4

const pullMode = (e: MouseEvent | KeyboardEvent): Pull['mode'] => (e.shiftKey ? 'shift' : 'carry')

interface Options {
  scrollRef: RefObject<HTMLDivElement | null>
  /** A drag across cells is in progress. */
  dragging: RefObject<boolean>
  /** The tool of the stroke being drawn. */
  strokeRef: RefObject<Stroke | null>
  /** The cell a Shift-click started on, until the mouse is dragged on. */
  /** The press that has selected nothing yet, and the pull of an end of a span in progress. */
  press: RefObject<Press | null>
  pullRef: RefObject<Pull | null>
  /** What was selected when the mouse went down. */
  before: RefObject<Selection | null>
  setPull: (pull: Pull | null) => void
  setSelection: Dispatch<SetStateAction<Selection | null>>
  setStroke: (stroke: Stroke | null) => void
  /** What ends a drag, and the columns as they are now. */
  drawDemand: () => void
  eraseDrawn: () => void
  startPull: (pull: Pull) => void
  /** Selects the cell of a press, once it is a click or, on an end of a span, no pull. */
  pressSelect: (cell: Cell, extend?: boolean) => void
  commitPull: () => void
  colW: number
  dayCount: number
}

/**
 * A drag ends wherever the mouse is released. While it lasts, the grid follows the mouse past its left
 * and right edges. A press on an end of a span becomes a pull of that end once the mouse moves sideways,
 * and a stroke or a selection as from any cell once it moves up or down. The listeners are attached once
 * and read what they need from a ref, so a drag is not disturbed when the rows or the tool change under it.
 */
export function useGridDrag({ scrollRef, dragging, strokeRef, press, pullRef, before, setPull, setSelection, setStroke, ...latest }: Options) {
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
    // The pull is kept in its ref as it moves, so letting go ends it where the mouse is, whether or not the grid has drawn it yet.
    const pullTo = (toCol: number, mode?: Pull['mode']) => {
      const pull = pullRef.current
      if (!pull || (pull.toCol === toCol && (!mode || pull.mode === mode))) return
      pullRef.current = { ...pull, toCol, mode: mode ?? pull.mode }
      setPull(pullRef.current)
    }
    const follow = () => {
      const el = scrollRef.current
      if (!el || mouseX === null || !(dragging.current || pullRef.current)) return
      const { colW } = env.current
      const rect = el.getBoundingClientRect()
      const step = mouseX > rect.right - 24 ? colW : mouseX < rect.left + LEFT_W + 24 ? -colW : 0
      if (!step) return
      el.scrollLeft += step
      // No cell is entered while the grid moves under a still mouse, so the selection follows the scroll.
      const col = colAt(mouseX)
      if (pullRef.current) pullTo(col)
      else setSelection((sel) => (sel && sel.focus.col !== col ? { ...sel, focus: { ...sel.focus, col } } : sel))
    }
    const rest = () => {
      mouseX = null
      clearInterval(timer)
      timer = undefined
    }
    const onMove = (e: MouseEvent) => {
      const grip = press.current?.span ? press.current : null
      if (grip && Math.max(Math.abs(e.clientX - grip.x), Math.abs(e.clientY - grip.y)) >= GRIP_SLOP) {
        press.current = null
        if (Math.abs(e.clientX - grip.x) >= Math.abs(e.clientY - grip.y)) env.current.startPull({ lane: grip.lane, ...grip.span!, toCol: colAt(e.clientX), mode: pullMode(e) })
        else {
          // Up or down, it is a drag as from any cell, and starts on the cell that was pressed.
          env.current.pressSelect(grip, grip.extend)
          dragging.current = true
          strokeRef.current = grip.stroke
          setStroke(grip.stroke)
        }
      } else if (pullRef.current) pullTo(colAt(e.clientX), pullMode(e))
      mouseX = dragging.current || pullRef.current ? e.clientX : null
      // The timer runs only while something is being dragged.
      if (mouseX !== null && timer === undefined) timer = setInterval(follow, 60)
    }
    // Shift can be pressed or let go while the mouse rests.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift' && pullRef.current) {
        e.preventDefault()
        pullTo(pullRef.current.toCol, pullMode(e))
      }
    }
    const onUp = () => {
      rest()
      const { drawDemand, eraseDrawn, commitPull, pressSelect } = env.current
      if (pullRef.current) {
        commitPull()
        return
      }
      // A press that never reached another cell is a click: its cell is selected now, and on an end of a span the tool does what it does on any cell.
      const clicked = press.current
      press.current = null
      if (clicked) pressSelect(clicked, clicked.extend)
      if (clicked?.span) {
        dragging.current = true
        strokeRef.current = clicked.stroke
      }
      const dragged = dragging.current
      const drawn = strokeRef.current
      dragging.current = false
      strokeRef.current = null
      setStroke(null)
      if (dragged && drawn === 'pencil') drawDemand()
      if (dragged && drawn === 'eraser') eraseDrawn()
      // A stroke is no selection: what was selected before it is selected again, and the cells it was drawn across are not.
      if (dragged && drawn) setSelection(before.current)
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
