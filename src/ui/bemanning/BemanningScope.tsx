import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react'
import type { ISODate } from '../../domain/dates'
import { deleteBlock, type Clipboard, type DayCell as Day } from '../../domain/staffing/edit'
import type { AllocationRow, CompetenceStyle, VenuePhase } from '../../domain/types'
import { usePref } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import type { Columns } from '../kalender/gridTypes'
import { useStableActions } from '../kalender/useStableActions'
import { useToasts, type Toast } from '../Toasts'
import { dayGrid, dividerHeight, personRowAt } from './dayGrid'
import { type BlockNames } from './dayCell'
import type { AbsenceDraft } from './PersonPanel'
import type { ProjectSpan } from './projectsInView'
import type { CrossMove } from './TimeTrack'
import type { Rect } from './tools'
import { LAST_KEY, useBemanningBalance } from './useBemanningBalance'
import { useBemanningKeys } from './useBemanningKeys'
import { useBrush } from './useBrush'
import { usePeopleLines } from './usePeopleLines'
import { useStaffingEdits } from './useStaffingEdits'
import { useStrokeInput, useStrokeState } from './useStrokeInput'
import { stretched, useStrokePreview } from './useStrokePreview'
import { clamp } from '../../domain/numbers'

export type { PersonLine } from './usePeopleLines'
export type { PlaceLine, ProjectLine } from './lineBalances'
export type { StretchPlan, StrokeInfo } from './useStrokePreview'

export type Density = 'detail' | 'compact'
const cleanDensity = (stored: unknown): Density => (stored === 'compact' ? 'compact' : 'detail')

interface Props {
  /** Bemanning is what the rows of the Kalender show. Nothing is worked out otherwise. */
  active: boolean
  /** Innleid is shown in place of the people: the keys and the tools of the people are at rest. */
  innleid: boolean
  /** Every day of the period. */
  dates: ISODate[]
  cols: Columns
  viewport: { left: number; width: number }
  scrollRef: RefObject<HTMLDivElement | null>
  /** The day in focus, shared with the plan. */
  focusDate: ISODate | undefined
  onFocusDate: (date: ISODate) => void
  /** Every project with days in the hall calendar. */
  projects: ProjectSpan[]
  /** The planning rows whose FTE is the demand: those of the projects that are shown. */
  planned: AllocationRow[]
  phases: Map<string, Map<ISODate, VenuePhase>>
  /** The project chosen in the filter. */
  chosenProject: string
  /** The person whose hours are open, above the others. The grid keeps it, to leave the open hours room. */
  unfolded: string | null
  setUnfolded: Dispatch<SetStateAction<string | null>>
  /** Brings a day into view. */
  onShowDate: (date: ISODate) => void
  /** The setting «Navn på blokker». */
  blockNames: BlockNames
  /** The overtime a person may have in a week before it is flagged (R36). */
  overtimeLimit: number
  children: ReactNode
}

/**
 * The state of Bemanning, put together from its parts: the balance and the days in view (`useBemanningBalance`), the tool and the
 * brush (`useBrush`), the people's lines (`usePeopleLines`), what a stroke would do (`useStrokePreview`), what the tools write
 * (`useStaffingEdits`), the stroke from the press to the let-go (`useStrokeInput`) and the keys (`useBemanningKeys`).
 */
function useBemanningState({ active, innleid, dates, cols, viewport, scrollRef, focusDate, onFocusDate, projects, planned, phases, chosenProject, unfolded, setUnfolded, onShowDate, blockNames, overtimeLimit }: Omit<Props, 'children'>) {
  const { workspace, updateStaffing, undo } = useWorkspace()
  const ws = workspace!
  /** The days selected with «Velg», as lines and columns of the people shown, and what was copied from them. */
  const [selection, setSelection] = useState<Rect | null>(null)
  const [clip, setClip] = useState<Clipboard | null>(null)
  const panelOpen = useRef(false)
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const [menu, setMenu] = useState<{ cell: Day; x: number; y: number } | null>(null)
  const [demandPop, setDemandPop] = useState<{ competence: string; date: ISODate; x: number; y: number } | null>(null)
  /** The person the panel is about, with the absence that is being entered and the week it was opened for. */
  const [panel, setPanel] = useState<{ personId: string; draft?: AbsenceDraft; week?: ISODate } | null>(null)
  /** In the open hours: the block that is being dragged to another day, and the block that is selected. */
  const [cross, setCrossState] = useState<CrossMove | null>(null)
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null)
  const [projectsOpen, setProjectsOpen] = usePref('showProjects', true)
  const [projectDensity, setProjectDensity] = usePref<Density>('projectDensity', 'detail', cleanDensity)
  const [demandOpen, setDemandOpen] = usePref('showDemand', true)
  const [demandDensity, setDemandDensity] = usePref<Density>('demandDensity', 'detail', cleanDensity)
  const [idleOpen, setIdleOpen] = usePref('bemanningIdleOpen', false)
  const { toasts, show: toast, dismiss: dismissToast } = useToasts()
  const bodyRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    panelOpen.current = panel !== null
  }, [panel])

  // ---- the parts --------------------------------------------------------------------------------------
  const view = useBemanningBalance({ active, ws, dates, cols, viewport, planned, panelOpen: panel !== null, focusDate })
  const { staffed, styles, balance, projectBalance, viewDates, remainingOf, firstWorkday, weekStart, week } = view
  const brush = useBrush({ ws, staffed, balance, projectBalance, planned, viewDates, firstWorkday, toast, setSelection, setUnfolded })
  const { tool, activeTool, activeBrush, activeProject, activeHall, brushWork, projectLines, placeLines, clearBrush, pickTool, pickBrush, stepProject } = brush
  const people = usePeopleLines({ active, ws, dates, brush: activeBrush, week, weekStart, unfolded, overtimeLimit })
  const { persons, lines, listed, listedAble, divided, lineOf } = people
  const grid = useMemo(() => dayGrid(listed, dates, lineOf), [listed, dates, lineOf])
  const strokeState = useStrokeState()
  const { stroke } = strokeState
  const preview = useStrokePreview({ active, ws, dates, stroke, grid, listed, activeTool, brush: activeBrush, brushWork, activeProject, projectLines, placeLines, balance, projectBalance, planned, viewDates, remainingOf, hover, clip })
  const edits = useStaffingEdits({ ws, updateStaffing, undo, toast, dates, grid, persons, styles, brush: activeBrush, brushWork, selection, clip, setClip, hover })
  const { stretch } = preview
  const input = useStrokeInput({
    wd: ws.settings.workday,
    scrollRef,
    bodyRef,
    rowAt: (top) => (listed.length ? personRowAt(top, listedAble, listed.length, dividerHeight(listedAble, listed.length, divided)) : null),
    colW: cols.colW,
    dates,
    stops: true,
    block: '.bm-block',
    strokeState,
    activeTool,
    panelOpen,
    selection,
    setSelection,
    onFocusDate,
    paint: (s) => activeBrush && edits.paint(preview.paintCells(s), activeBrush),
    clear: (s) => edits.clear(grid.strokeCells(s)),
    moveBlocks: (s, copy) => edits.moveBlocks(grid.dayAt(s.row0, s.col0), grid.dayAt(s.row1, s.col1), copy),
    // An end of a run is painted over its new days as the brush would, or the run's blocks on them removed.
    finishStretch: () => {
      if (stretch && stretched(ws, stretch) !== (ws.assignments ?? [])) updateStaffing((w) => ({ ...w, assignments: stretched(w, stretch) }))
    },
  })
  const { cancelStroke } = input

  // Only a change of the day or the time is a new place for the block that is dragged. It is kept beside
  // the state too, so the button let go reads where the block is, not where it was when the drag began.
  const crossRef = useRef<CrossMove | null>(null)
  const setCross = useCallback((next: CrossMove | null) => {
    crossRef.current = next
    setCrossState((was) => (was && next && was.id === next.id && was.date === next.date && Math.abs(was.start - next.start) < 1 ? was : next))
  }, [])
  /** Ends the drag of a block to another day, and gives where it was let go. */
  const takeCross = useCallback(() => {
    const move = crossRef.current
    setCross(null)
    return move
  }, [setCross])
  /** The day a selection started in: the person «E» opens, and the day a new absence starts on. */
  const selected: Day | null = selection && selection.row0 < listed.length ? grid.dayAt(selection.row0, selection.col0) : null
  const selectDay = (day: Day | null) => {
    const row = day ? listed.findIndex((line) => line.person.id === day.personId) : -1
    const col = day ? dates.indexOf(day.date) : -1
    setSelection(row >= 0 && col >= 0 ? { row0: row, col0: col, row1: row, col1: col } : null)
  }

  // A selection is lines of the list as it is, so it is let go of when the list changes.
  const toggleUnfolded = (personId: string) => {
    setSelection(null)
    setUnfolded((current) => (current === personId ? null : personId))
  }
  /** Moves the open hours to the person before or after in the list. */
  const stepUnfolded = (delta: number) => {
    const at = lines.findIndex((line) => line.person.id === unfolded)
    const next = lines[clamp(at + delta, 0, lines.length - 1)]
    setSelection(null)
    if (next) setUnfolded(next.person.id)
  }

  const actions = useStableActions({
    cellDown: (event: React.MouseEvent) => input.cellDown(event),
    cellMenu: (personId: string, date: ISODate, event: React.MouseEvent) => {
      event.preventDefault()
      cancelStroke()
      selectDay({ personId, date })
      setMenu({ cell: { personId, date }, x: event.clientX, y: event.clientY })
    },
    unfold: toggleUnfolded,
    openPanel: (personId: string) => setPanel((open) => (open?.personId === personId && !open.draft ? null : { personId })),
    /** The pointer moved over the people: the day under it is where the brush would paint. */
    bodyMove: (event: React.MouseEvent) => {
      const at = input.cellAt(event.clientX, event.clientY)
      if (stroke || !(activeTool === 'paint' || (activeTool === 'select' && clip))) return
      setHover((h) => (at && h && h.row === at.row && h.col === at.col ? h : at))
    },
    bodyLeave: () => setHover(null),
  })

  useBemanningKeys({
    active: active && !innleid,
    holdShift: input.holdShift,
    canCopy: !!selection,
    canPaste: !!clip,
    copy: edits.copySelection,
    paste: edits.pasteClip,
    popoverOpen: !!menu || !!demandPop,
    stroking: !!stroke,
    cancelStroke,
    selectedBlock: !!selectedBlock,
    dropBlock: () => setSelectedBlock(null),
    selection: !!selection,
    dropSelection: () => setSelection(null),
    brushOrTool: !!activeBrush || tool !== 'select',
    clearBrush,
    panel: !!panel,
    closePanel: () => setPanel(null),
    fold: () => setUnfolded(null),
    pickTool,
    brushKeys: staffed.map((style) => style.key),
    pickBrush,
    toggleHours: () => {
      const personId = selected?.personId ?? unfolded
      if (personId) toggleUnfolded(personId)
    },
    hoursOpen: !!unfolded,
    stepHours: stepUnfolded,
    canStepLines: !!activeBrush && projectLines.length > 0,
    stepLines: stepProject,
    remove:
      selectedBlock || selection
        ? () => {
            if (selectedBlock) {
              updateStaffing((w) => ({ ...w, assignments: deleteBlock(w.assignments ?? [], selectedBlock) }))
              setSelectedBlock(null)
            } else edits.clear(edits.selectionCells())
          }
        : null,
  })

  return {
    ws, dates, cols, scrollRef, room: view.room, viewFrom: view.viewFrom, viewTo: view.viewTo, bodyRef, onFocusDate, projects, phases, chosenProject,
    persons, staffed, styles, keyOf: view.keyOf, lastKey: Math.min(staffed.length, LAST_KEY),
    tool: activeTool, brush: activeBrush, brushProject: activeProject, brushHall: activeHall, brushWork, pickTool, pickBrush, clearBrush, pickFromDemand: brush.pickFromDemand, pickProject: brush.pickProject, pickPlace: brush.pickPlace,
    balance, shownBalance: preview.shownBalance, shownRemaining: preview.shownRemaining, totals: view.totals, remainingOf, demandRows: view.demandRows, uncoverable: view.uncoverable, projectLines, projectShown: preview.projectShown, restShown: preview.restShown, placeLines, placeShown: preview.placeShown, projectName: brush.projectName, projectBalance, kalenderProjects: brush.kalenderProjects,
    lines, listed, listedAble, able: people.able, week, isOk: people.isOk, isOpen: people.isOpen, ghost: preview.ghost, info: preview.info, refused: preview.refused, stroke, stretch: preview.stretch, paintReach: preview.paintReach, selected, selection, clip, setClip,
    unfolded, setUnfolded, toggleUnfolded, stepUnfolded, cross, setCross, takeCross, selectedBlock, setSelectedBlock, dateAtX: input.dateAtX,
    unresolved: people.open.length, removeOpen: edits.removeOpen, paint: edits.paint, clear: edits.clear,
    menu, setMenu, demandPop, setDemandPop, panel, setPanel, overtimeLimit, breaches: people.breaches, overLimit: people.overLimit, blockNames, onShowDate, firstWorkday,
    projectsOpen, setProjectsOpen, projectDensity, setProjectDensity, demandOpen, setDemandOpen, demandDensity, setDemandDensity, idleOpen, setIdleOpen,
    toasts, toast: toast as (text: string, action?: Toast['action']) => void, dismissToast, updateStaffing,
    actions, nameOf: edits.nameOf, labelOf: edits.labelOf, dayName: edits.dayName,
  }
}

type BemanningState = ReturnType<typeof useBemanningState>
/** What the days of a person's line tell the grid; the handlers keep their identity (see `useStableActions`). */
export type PersonActions = BemanningState['actions']
export type DemandRow = { style: CompetenceStyle; key: number }

const BemanningContext = createContext<BemanningState | null>(null)

/**
 * Bemanning as a mode of the Kalender: who does the work the plan asks for. It holds what the parts of the
 * mode share (the tool and the competence in focus, the stroke under way, the balance of the period), so
 * the grid around it is not drawn again when the pointer moves over the people.
 */
export function BemanningScope({ children, ...props }: Props) {
  const state = useBemanningState(props)
  return <BemanningContext.Provider value={state}>{children}</BemanningContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useBemanning = (): BemanningState => {
  const state = useContext(BemanningContext)
  if (!state) throw new Error('Bemanning is read outside its scope')
  return state
}
