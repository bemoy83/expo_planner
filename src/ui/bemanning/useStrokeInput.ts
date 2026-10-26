import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from 'react'
import type { ISODate } from '../../domain/dates'
import type { DayCell as Day } from '../../domain/staffing/edit'
import type { Workspace, WorkdaySettings } from '../../domain/types'
import { LEFT_W } from '../kalender/layout'
import { dividerHeight, personRowAt, type DayGrid } from './dayGrid'
import { stretchStop } from './runs'
import type { Rect, Stroke, Tool } from './tools'
import { daysAcross, useFollowPointer } from './useFollowPointer'
import { stretched, type StretchPlan } from './useStrokePreview'

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
  ws: Workspace
  wd: WorkdaySettings
  scrollRef: RefObject<HTMLDivElement | null>
  /** The people's lines, which a point is measured against. */
  bodyRef: RefObject<HTMLDivElement | null>
  colW: number
  dates: ISODate[]
  grid: DayGrid
  /** How many lines are listed, how many of them have the competence in focus, and whether a divider follows those. */
  listedCount: number
  listedAble: number
  divided: boolean
  strokeState: ReturnType<typeof useStrokeState>
  activeTool: Tool
  brush: string | null
  /** The Person panel lies over the right edge of the days, so a stroke scrolls on short of it. */
  panelOpen: RefObject<boolean>
  selection: Rect | null
  setSelection: Dispatch<SetStateAction<Rect | null>>
  onFocusDate: (date: ISODate) => void
  updateStaffing: (change: (w: Workspace) => Workspace) => void
  /** What a stroke ends in, see `useStrokePreview` and `useStaffingEdits`. */
  stretch: StretchPlan | null
  paintCells: (s: Stroke) => Day[]
  paint: (cells: Day[], competence: string) => void
  clear: (cells: Day[]) => void
  moveBlocks: (from: Day, to: Day, copy: boolean) => void
}

/**
 * A stroke over the people from the press to the let-go: what a press starts by the tool and where it lands, the pointer followed
 * wherever it goes with the grid scrolled on near its edges, Shift answered at once, and what the stroke does when it ends.
 */
export function useStrokeInput({ ws, wd, scrollRef, bodyRef, colW, dates, grid, listedCount, listedAble, divided, strokeState, activeTool, brush, panelOpen, selection, setSelection, onFocusDate, updateStaffing, stretch, paintCells, paint, clear, moveBlocks }: Options) {
  const { strokeRef, setStroke, setShift, shiftHeld } = strokeState
  /** Where across the window the button went down for the stroke under way. */
  const pressedAt = useRef(0)

  /** The line and the day under a point of the window. The pointer is measured against the grid, not the elements, so nothing laid over the grid stops a stroke. */
  const cellAt = (x: number, y: number): { row: number; col: number } | null => {
    const el = scrollRef.current
    const body = bodyRef.current
    if (!el || !body || !listedCount) return null
    const col = Math.floor(daysAcross(el, x, colW))
    const row = personRowAt(y - body.getBoundingClientRect().top, listedAble, listedCount, dividerHeight(listedAble, listedCount, divided))
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
    if (s.mode === 'stretch') {
      // R46: an end of a run let go where it was pulled to. Its days are painted as the brush would, or the run's blocks on them removed.
      if (!stretch || stretched(ws, stretch) === (ws.assignments ?? [])) return
      updateStaffing((w) => ({ ...w, assignments: stretched(w, stretch) }))
    } else if (s.mode === 'erase') clear(grid.strokeCells(s))
    else if (s.mode === 'paint') {
      if (brush) paint(paintCells(s), brush)
    } else if (!dragged) {
      // A press that goes nowhere is a click: it selects the day, and lets go of it when it was the one selected.
      const same = selection !== null && selection.row0 === s.row0 && selection.col0 === s.col0 && selection.row1 === s.row0 && selection.col1 === s.col0
      setSelection(same ? null : { row0: s.row0, col0: s.col0, row1: s.row0, col1: s.col0 })
      if (!same) onFocusDate(dates[s.col0])
    } else if (s.mode === 'select') setSelection({ row0: s.row0, col0: s.col0, row1: s.row1, col1: s.col1 })
    else moveBlocks(grid.dayAt(s.row0, s.col0), grid.dayAt(s.row1, s.col1), copy)
  }

  // A stroke follows the pointer wherever it goes, and ends where the button is let go.
  const followed = useFollowPointer(scrollRef, panelOpen, {
    move: (x: number, y: number) => {
      const at = cellAt(x, y)
      const s = strokeRef.current
      if (!at || !s) return
      // How far into the day under it the pointer is, and whether a day is wide enough to aim at a stop of it.
      const share = daysAcross(scrollRef.current!, x, colW) - at.col
      const stops = colW >= STOPS_FROM_W
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
    const onBlock = event.target instanceof Element && event.target.closest('.bm-block') !== null
    // The ends of a run answer to every tool, see `.bm-edge`: a run is given more days or fewer without a change of tool or brush.
    const edge = event.target instanceof HTMLElement && !event.altKey ? event.target.closest<HTMLElement>('.bm-edge') : null
    const mode = edge ? 'stretch' : event.altKey || activeTool === 'erase' ? 'erase' : activeTool === 'paint' ? 'paint' : onBlock ? 'move' : 'select'
    event.preventDefault()
    if (mode === 'paint' || mode === 'erase') setSelection(null)
    pressedAt.current = event.clientX
    setStroke({ mode, toDemand: mode === 'paint' && event.shiftKey, row0: at.row, col0: at.col, row1: at.row, col1: at.col, stretch: edge ? { edge: edge.dataset.edge === 'start' ? 'start' : 'end', blockId: edge.dataset.block ?? '' } : undefined })
    followed.follow(event.clientX, event.clientY)
  }

  /** Shift goes down or up: a stroke under way is worked out again where the pointer is. */
  const holdShift = (down: boolean) => {
    setShift(down)
    if (strokeRef.current && pointer.current) followed.move(pointer.current.x, pointer.current.y)
  }

  return { cellAt, dateAtX, cellDown, cancelStroke, holdShift }
}
