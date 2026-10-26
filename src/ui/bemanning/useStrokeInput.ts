import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { ISODate } from '../../domain/dates'
import type { WorkdaySettings } from '../../domain/types'
import { LEFT_W } from '../kalender/layout'
import { stretchStop } from './runs'
import type { Rect, Stroke, Tool } from './tools'
import { daysAcross, useFollowPointer } from './useFollowPointer'

/** Below this width of a day, an end is pulled by whole days: two hours are too little to aim at. */
const STOPS_FROM_W = 64
/** How far the pointer goes from where it was pressed before a press is a stroke that stops at a time, and no longer a click on the day. */
const DRAG_FROM = 4

/**
 * The stroke under way, kept beside the state too, so the button let go right after it went down still ends it;
 * and whether Shift is held, which takes a stroke no further than where the demand is met, read by a stroke under way at once.
 */
export function useStrokeState() {
  const [stroke, setStrokeState] = useState<Stroke | null>(null)
  const strokeRef = useRef<Stroke | null>(null)
  const setStroke = (next: Stroke | null) => {
    strokeRef.current = next
    setStrokeState(next)
  }
  const shiftHeld = useRef(false)
  const setShift = (down: boolean) => {
    shiftHeld.current = down
  }
  return { stroke, strokeRef, setStroke, setShift, shiftHeld }
}

interface Options {
  wd: WorkdaySettings
  scrollRef: RefObject<HTMLDivElement | null>
  /** The lines a stroke is drawn over (the people of Faste, the suppliers' shifts of Innleid), which a point is measured against. */
  bodyRef: RefObject<HTMLDivElement | null>
  /** The line under a point `top` pixels down the lines, or `null` where there are none. */
  rowAt: (top: number) => number | null
  colW: number
  dates: ISODate[]
  /** A stroke of the brush and a pulled end stop at times of the day where the days are wide enough (Faste); without, they take whole days (Innleid). */
  stops: boolean
  /** What a block of the lines is, which a press with «Velg» moves where `moveBlocks` is given. */
  block: string
  strokeState: ReturnType<typeof useStrokeState>
  activeTool: Tool
  /** The Person panel lies over the right edge of the days, so a stroke scrolls on short of it. */
  panelOpen: RefObject<boolean>
  selection: Rect | null
  setSelection: Dispatch<SetStateAction<Rect | null>>
  onFocusDate: (date: ISODate) => void
  /** What a stroke ends in: the brush's, the eraser's, a move of the blocks of a day (Alt copies them), and a pulled end of a run. */
  paint: (s: Stroke) => void
  clear: (s: Stroke) => void
  moveBlocks?: (s: Stroke, copy: boolean) => void
  finishStretch?: () => void
}

/**
 * A stroke over the people from the press to the let-go: what a press starts by the tool and where it lands, the pointer followed
 * wherever it goes with the grid scrolled on near its edges, Shift answered at once, and what the stroke does when it ends.
 */
export function useStrokeInput({ wd, scrollRef, bodyRef, rowAt, colW, dates, stops: timed, block, strokeState, activeTool, panelOpen, selection, setSelection, onFocusDate, paint, clear, moveBlocks, finishStretch }: Options) {
  const { strokeRef, setStroke, setShift, shiftHeld } = strokeState
  /** Where across the window the button went down for the stroke under way. */
  const pressedAt = useRef(0)

  /** The line and the day under a point of the window. The pointer is measured against the grid, not the elements, so nothing laid over the grid stops a stroke. */
  const cellAt = (x: number, y: number): { row: number; col: number } | null => {
    const el = scrollRef.current
    const body = bodyRef.current
    if (!el || !body) return null
    const row = rowAt(y - body.getBoundingClientRect().top)
    if (row === null) return null
    const col = Math.floor(daysAcross(el, x, colW))
    return { row, col: Math.min(dates.length - 1, Math.max(0, col)) }
  }
  /** The day under a point of the window, or `null` outside the days. */
  const dateAtX = useCallback(
    (x: number): ISODate | null => {
      const el = scrollRef.current
      if (!el) return null
      return x < el.getBoundingClientRect().left + LEFT_W ? null : (dates[Math.floor(daysAcross(el, x, colW))] ?? null)
    },
    [scrollRef, colW, dates],
  )

  const cancelStroke = () => {
    followed.stop()
    setStroke(null)
  }
  const finishStroke = (s: Stroke, copy: boolean) => {
    cancelStroke()
    const dragged = s.row0 !== s.row1 || s.col0 !== s.col1
    // R46: an end of a run let go where it was pulled to.
    if (s.mode === 'stretch') finishStretch?.()
    else if (s.mode === 'erase') clear(s)
    else if (s.mode === 'paint') paint(s)
    else if (!dragged) {
      // A press that goes nowhere is a click: it selects the day, and lets go of it when it was the one selected.
      const same = selection !== null && selection.row0 === s.row0 && selection.col0 === s.col0 && selection.row1 === s.row0 && selection.col1 === s.col0
      setSelection(same ? null : { row0: s.row0, col0: s.col0, row1: s.row0, col1: s.col0 })
      if (!same) onFocusDate(dates[s.col0])
    } else if (s.mode === 'select') setSelection({ row0: s.row0, col0: s.col0, row1: s.row1, col1: s.col1 })
    else moveBlocks?.(s, copy)
  }

  // A stroke follows the pointer wherever it goes, and ends where the button is let go.
  const followed = useFollowPointer(scrollRef, panelOpen, {
    move: (x: number, y: number) => {
      const at = cellAt(x, y)
      const s = strokeRef.current
      if (!at || !s) return
      // How far into the day under it the pointer is, and whether a day is wide enough to aim at a stop of it.
      const share = daysAcross(scrollRef.current!, x, colW) - at.col
      const stops = timed && colW >= STOPS_FROM_W
      if (s.mode === 'stretch' && s.stretch) {
        // The end of a run is pulled along its own line, wherever the pointer strays, to a stop of the day under the pointer.
        const time = stops ? stretchStop(share, s.stretch.edge, wd) : share < 0.5 ? wd.dayStart : wd.dayEnd
        const toDemand = shiftHeld.current
        if (s.col1 !== at.col || s.stretch.at !== time || !s.toDemand !== !toDemand) setStroke({ ...s, col1: at.col, toDemand, stretch: { ...s.stretch, at: time } })
      } else if (s.mode === 'paint' && stops) {
        // The brush is drawn to a stop of the day under the pointer too, once the pointer has left where it was pressed.
        const moved = s.at !== undefined || at.row !== s.row0 || at.col !== s.col0 || Math.abs(x - pressedAt.current) > DRAG_FROM
        const stop = moved ? stretchStop(share, at.col < s.col0 ? 'start' : 'end', wd) : undefined
        // A day the stroke has only reached the near edge of is not in it yet: the stroke ends with the day before, whole.
        const short = stop !== undefined && (at.col > s.col0 ? stop <= wd.dayStart : at.col < s.col0 && stop >= wd.dayEnd)
        const col = short ? at.col + (at.col > s.col0 ? -1 : 1) : at.col
        const time = short ? (at.col > s.col0 ? wd.dayEnd : wd.dayStart) : stop
        const toDemand = shiftHeld.current
        if (s.row1 !== at.row || s.col1 !== col || s.at !== time || !s.toDemand !== !toDemand) setStroke({ ...s, row1: at.row, col1: col, at: time, toDemand })
      } else if (s.mode === 'paint') {
        // A stroke of whole days goes no further than where the demand is met while Shift is held, as one that stops at times does.
        const toDemand = shiftHeld.current
        if (s.row1 !== at.row || s.col1 !== at.col || !s.toDemand !== !toDemand) setStroke({ ...s, row1: at.row, col1: at.col, toDemand })
      } else if (s.row1 !== at.row || s.col1 !== at.col) setStroke({ ...s, row1: at.row, col1: at.col })
    },
    up: (e: MouseEvent) => {
      if (strokeRef.current) finishStroke(strokeRef.current, e.altKey)
    },
  })
  const { pointer } = followed

  /** A press on the people starts a stroke: by the tool, on a block a move with «Velg», and on an end of a run a pull of it with any tool. */
  const cellDown = (event: React.MouseEvent) => {
    if (event.button !== 0) return
    const at = cellAt(event.clientX, event.clientY)
    if (!at) return
    // With «Velg», a press on a block can drag the day's blocks to another day; a press beside them selects days.
    const onBlock = moveBlocks !== undefined && event.target instanceof Element && event.target.closest(block) !== null
    // The lane of a line a press is on, where a line has them: Tøm started there empties that lane alone, unless Shift is held.
    const lane = event.target instanceof HTMLElement && !event.shiftKey ? event.target.closest<HTMLElement>('[data-lane]')?.dataset.lane : undefined
    // The ends of a run answer to every tool, see `.bm-edge`: a run is given more days or fewer without a change of tool or brush.
    const edge = event.target instanceof HTMLElement && !event.altKey ? event.target.closest<HTMLElement>('.bm-edge') : null
    const mode = edge ? 'stretch' : event.altKey || activeTool === 'erase' ? 'erase' : activeTool === 'paint' ? 'paint' : onBlock ? 'move' : 'select'
    event.preventDefault()
    if (mode === 'paint' || mode === 'erase') setSelection(null)
    pressedAt.current = event.clientX
    setStroke({ mode, toDemand: mode === 'paint' && event.shiftKey, ...(mode === 'erase' && lane !== undefined && { lane }), row0: at.row, col0: at.col, row1: at.row, col1: at.col, stretch: edge ? { edge: edge.dataset.edge === 'start' ? 'start' : 'end', blockId: edge.dataset.block ?? '' } : undefined })
    followed.follow(event.clientX, event.clientY)
  }

  /** Shift goes down or up: a stroke under way is worked out again where the pointer is. */
  const holdShift = (down: boolean) => {
    setShift(down)
    if (strokeRef.current && pointer.current) followed.move(pointer.current.x, pointer.current.y)
  }

  return { cellAt, dateAtX, cellDown, cancelStroke, holdShift }
}
