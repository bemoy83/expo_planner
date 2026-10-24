import { useCallback, useMemo, useRef, useState, type RefObject } from 'react'
import { type DemandIndex } from '../../domain/calc'
import type { ISODate } from '../../domain/dates'
import type { AllocationRow, Settings } from '../../domain/types'
import type { AllocLane } from './gridTypes'
import { rangeOf, type Pull, type Selection, type Tool } from './selection'
import { eraserCells, eraserPill, ghostCells, pencilCells, pencilNotice, pencilPill, pencilProgress, pencilStroke, proposal, proposalNotice, pullNotice, pullPill, pullPreview, pullProgress } from './strokes'
import { formatFte } from '../format'

type PlanStroke = Exclude<Tool, 'select'>

interface Options {
  dates: ISODate[]
  allocLanes: AllocLane[]
  demandIndex: DemandIndex
  settings: Settings
  windowOf: (row: AllocationRow) => Set<ISODate> | undefined
  getValue: (lane: number, date: ISODate) => number | undefined
  setValue: (lane: number, date: ISODate, value: number | null) => void
  setRowFte: (row: AllocationRow, date: ISODate, value: number | null) => void
  selection: Selection | null
  /** The selection as a stroke that ends in the same event reads it. */
  selectionRef: RefObject<Selection | null>
  setNotice: (notice: string | null) => void
}

/**
 * The tools of the plan that write across the days: the pencil («Fordel behov»), the eraser, «Foreslå plan» and a pulled end
 * of a span. What each would write is worked out in `strokes.ts`; this holds the stroke or the pull under way, and what it
 * would leave in the cells, on the status bar and on its pill while it lasts.
 */
export function usePlanStrokes({ dates, allocLanes, demandIndex, settings, windowOf, getValue, setValue, setRowFte, selection, selectionRef, setNotice }: Options) {
  // The tool of the stroke being drawn. Alt held when the mouse goes down picks the eraser for that one stroke,
  // whatever tool is chosen.
  const [stroke, setStroke] = useState<PlanStroke | null>(null)
  const strokeRef = useRef<PlanStroke | null>(null)
  // An end of a span being pulled along the days.
  const [pull, setPull] = useState<Pull | null>(null)
  const pullRef = useRef<Pull | null>(null)

  const strokeFor = useCallback((sel: Selection | null) => pencilStroke(sel, dates, allocLanes, demandIndex, settings), [dates, allocLanes, demandIndex, settings])

  const drawDemand = useCallback(
    (over: Selection | null = selectionRef.current) => {
      const drawn = strokeFor(over)
      if (!drawn) return
      for (const { lane, parts } of drawn.lanes) drawn.target.forEach((date, i) => setValue(lane, date, parts[i] || null))
      setNotice(pencilNotice(drawn))
    },
    [strokeFor, setValue, selectionRef, setNotice],
  )

  /** «Foreslå plan»: fills rows over their windows, see `proposal`. */
  const proposePlan = useCallback(
    (list: AllocationRow[], replace: boolean) => {
      const plan = proposal(list, replace, windowOf, demandIndex, settings)
      for (const { row, date, value } of plan.writes) setRowFte(row, date, value)
      setNotice(proposalNotice(plan))
    },
    [windowOf, demandIndex, settings, setRowFte, setNotice],
  )

  /** The eraser: clears every cell drawn across. On a level in entry mode, that day is cleared for the rows below. */
  const eraseDrawn = useCallback(() => {
    const sel = selectionRef.current
    if (!sel) return
    const { lane0, lane1, col0, col1 } = rangeOf(sel)
    let erased = 0
    for (let lane = lane0; lane <= lane1; lane++)
      for (let col = col0; col <= col1; col++) {
        const value = getValue(lane, dates[col])
        if (value === undefined) continue
        erased += value
        setValue(lane, dates[col], null)
      }
    setNotice(erased ? `Visket ut ${formatFte(erased, 1)} FTE-dager` : 'Ingenting å viske ut her')
  }, [dates, getValue, setValue, selectionRef, setNotice])

  // While a stroke is being drawn, what it would give: shown in the cells, with the level per day in the status bar.
  // The total is left out: a stroke always places all that is left, so it would not move.
  const preview = useMemo(() => (stroke === 'pencil' ? strokeFor(selection) : null), [stroke, strokeFor, selection])
  const pullView = useMemo(() => pullPreview(pull, dates, allocLanes, demandIndex, settings), [pull, dates, allocLanes, demandIndex, settings])
  const startPull = useCallback(
    (started: Pull) => {
      pullRef.current = started
      setPull(started)
      setNotice(null)
    },
    [setNotice],
  )

  const commitPull = () => {
    const done = pullRef.current
    const view = pullPreview(done, dates, allocLanes, demandIndex, settings)
    pullRef.current = null
    setPull(null)
    if (!done || !view) return
    for (const cell of view.cells) setValue(cell.lane, cell.date, cell.value)
    // A pull selects nothing, as a pulled end of a run does not in Bemanning: what was selected is selected still.
    setNotice(pullNotice(view))
  }

  // What the stroke or the pull in progress would write, and from it what the cells of each line would hold if it ended now, keyed by lane.
  const written = useMemo(() => [...pencilCells(preview), ...(pullView?.cells ?? [])], [preview, pullView])
  const ghost = useMemo(() => ghostCells([...written, ...eraserCells(stroke === 'eraser' ? selection : null, dates)]), [written, stroke, selection, dates])

  // What the stroke or the pull in progress would do, for the status bar.
  const progress = pull && pullView ? pullProgress(pull, pullView) : preview ? pencilProgress(preview) : null
  // What the stroke or the drag in progress would do, on one pill over the days and the lines it changes.
  const pill = pull && pullView ? pullPill(pullView, getValue) : preview ? pencilPill(preview, getValue) : stroke === 'eraser' && selection ? eraserPill(selection, dates, getValue) : null

  return { stroke, setStroke, strokeRef, pull, setPull, pullRef, pullView, startPull, commitPull, drawDemand, proposePlan, eraseDrawn, written, ghost, progress, pill }
}
