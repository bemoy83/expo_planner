import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { competenceStyles, staffedCompetences } from '../../domain/competences'
import { weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { buildBalance, cellsToDemand, clearDays, copyDays, overtimeBreaches, defaultBrush, deleteBlock, landingGaps, moveDay, pasteDays, pasteTargets, okAssignments, openUnresolved, onlyOffDays, paidHours, paidTotal, paintBlock, paintDays, paintGaps, personWeek, removeUnresolved, uncoverable as uncoverableHours, balanceTotals, type Balance, type Clipboard, type DayCell as Day, type PaintSpan, type PersonWeek, type WeekTotals } from '../../domain/staffing'
import type { AllocationRow, Assignment, CompetenceStyle, Person, Unavailability, VenuePhase, Workspace } from '../../domain/types'
import { usePref } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { isTyping } from '../dom'
import type { Columns } from '../kalender/gridTypes'
import { fmtDay } from '../kalender/labels'
import { LEFT_W } from '../kalender/layout'
import { useStableActions } from '../kalender/useStableActions'
import { useToasts, type Toast } from '../Toasts'
import { ABSENCE_LABELS, type BlockNames } from './dayCell'
import type { AbsenceDraft } from './PersonPanel'
import { DIVIDER_H, PANEL_W, PERSON_H } from './layout'
import type { ProjectSpan } from './projectsInView'
import type { CrossMove } from './TimeTrack'
import { runDays, stretchRun, stretchStop, type BlocksOn, type Piece } from './runs'
import { strokeRange, TOOL_KEYS, type Rect, type Stroke, type Tool } from './tools'
import { EPSILON, weekDates, WEEKDAYS_LONG } from './week'

/** The highest number a competence can be picked with on the keyboard. */
const LAST_KEY = 9
/** How near the edges of the days the pointer makes a stroke scroll the grid: the right edge, the label column, the bottom. */
const SCROLL_NEAR_RIGHT = 40
const SCROLL_NEAR_LEFT = 16
const SCROLL_NEAR_BOTTOM = 30
/** Below this width of a day, an end is pulled by whole days: two hours are too little to aim at. */
const STOPS_FROM_W = 64
/** How far the pointer goes from where it was pressed before a press is a stroke that stops at a time, and no longer a click on the day. */
const DRAG_FROM = 4

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

/** One person's line: who, and what the grid knows about their days. */
export interface PersonLine {
  person: Person
  assignments: Map<ISODate, Assignment[]> | undefined
  absence: Map<ISODate, Unavailability[]> | undefined
  week: PersonWeek
  /** The person lacks the competence in focus. */
  dim: boolean
}

/** What a stroke, or the brush over a day, would do: shown before the button is let go. */
export interface StrokeInfo {
  mode: 'paint' | 'erase' | 'select'
  half: boolean
  /** Person-days that get time, or lose their blocks. */
  days: number
  hours: number
  people: number
  /** Workdays in the stroke that the brush cannot fill. */
  skipped: number
  /** The stroke goes no further than where the demand is met. */
  toDemand?: boolean
  /** The competence the time is of, when it is not the brush's: that of a run whose end is pulled. */
  competence?: string
}

/** What a pulled end of a run does: the days of the person's line it covers, and whether they get time or lose their blocks of the run. */
export interface StretchPlan {
  row: number
  colFrom: number
  colTo: number
  competence: string
  erase: boolean
  cells: Day[]
  /** The blocks of the run that are given up. */
  blockIds: string[]
  /** The block the end is pulled back into, with the time it is cut to and the day it is on. */
  trim?: { blockId: string; date: ISODate; start: number; end: number }
  /** The day of the end itself, which gets more of its normal time: no day to count as passed over when it has none free. */
  own?: ISODate
}

/** The time a stroke would give the days of each person, with the competence it is of. */
type Ghosts = Map<string, Map<ISODate, Piece[]>>
const NO_GHOST: Ghosts = new Map()
const NO_HOURS = new Map<string, number>()

/** Where across the days a point of the window is, counted in days from the first: the whole of it is the column, the rest how far into that day. */
const daysAcross = (el: HTMLElement, x: number, colW: number): number => (x - el.getBoundingClientRect().left - LEFT_W + el.scrollLeft) / colW

/** Per competence: the hours that remain in the days. A day that is over does not make up for one that is short. */
const remainingIn = (balance: Balance, days: ISODate[]): Map<string, number> =>
  new Map(balance.competences.map((competence) => [competence, days.reduce((sum, date) => sum + Math.max(0, balance.get(competence, date).remaining), 0)]))

function useBemanningState({ active, innleid, dates, cols, viewport, scrollRef, focusDate, onFocusDate, projects, planned, phases, chosenProject, unfolded, setUnfolded, onShowDate, blockNames, overtimeLimit }: Omit<Props, 'children'>) {
  const { workspace, updateStaffing, undo } = useWorkspace()
  const ws = workspace!
  const wd = ws.settings.workday
  const { colW } = cols
  const [tool, setTool] = useState<Tool>('select')
  /** The competence in focus, which is also what the brush paints. */
  const [brush, setBrush] = useState<string | null>(null)
  /** The days selected with «Velg», as lines and columns of the people shown, and what was copied from them. */
  const [selection, setSelection] = useState<Rect | null>(null)
  const [clip, setClip] = useState<Clipboard | null>(null)
  // The stroke under way is kept beside the state too, so the button let go right after it went down still ends it.
  const [stroke, setStrokeState] = useState<Stroke | null>(null)
  const strokeRef = useRef<Stroke | null>(null)
  const setStroke = (next: Stroke | null) => {
    strokeRef.current = next
    setStrokeState(next)
  }
  const endStroke = useRef<(() => void) | null>(null)
  /** Where across the window the button went down for the stroke under way. */
  const pressedAt = useRef(0)
  /** Shift is down, as a stroke under way reads it: beside the state, so a stroke answers the key at once. */
  const shiftHeld = useRef(false)
  const panelOpen = useRef(false)
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const [shift, setShift] = useState(false)
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
  const pointer = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    panelOpen.current = panel !== null
  }, [panel])

  // ---- the people and the competences -------------------------------------------------------------
  const persons = useMemo(() => (active ? (ws.persons ?? []).filter((p) => p.active) : []), [active, ws.persons])
  const staffed = useMemo(() => (active ? staffedCompetences(ws) : []), [active, ws])
  const styles = useMemo(() => new Map((active ? competenceStyles(ws) : []).map((style) => [style.key, style])), [active, ws])
  // A brush whose competence nobody has any more is no brush.
  const activeBrush = brush && staffed.some((style) => style.key === brush) ? brush : null
  const activeTool: Tool = tool === 'paint' && !activeBrush ? 'select' : tool
  const keyOf = useMemo(() => new Map(staffed.slice(0, LAST_KEY).map((style, index) => [style.key, index + 1])), [staffed])

  // ---- the balance of the whole period, worked out once per change ---------------------------------
  const balance = useMemo<Balance>(() => buildBalance(planned === ws.allocations ? ws : { ...ws, allocations: planned }, active ? dates : []), [active, ws, planned, dates])
  // ---- what is in view ---------------------------------------------------------------------------------
  // The days that are seen: those the panel does not lie over.
  const room = Math.max(colW, viewport.width - LEFT_W - (panel ? PANEL_W : 0))
  const viewFrom = Math.max(0, Math.floor(viewport.left / colW))
  const viewTo = Math.min(dates.length - 1, Math.floor((viewport.left + room - 1) / colW))
  // The hours that remain are those of the days in view. Summed over the whole period they would count
  // every project that is read in, and say nothing of the days the planner is staffing.
  const viewDates = useMemo(() => (active ? dates.slice(viewFrom, viewTo + 1) : []), [active, dates, viewFrom, viewTo])
  const totals = useMemo<WeekTotals>(() => balanceTotals(balance, viewDates), [balance, viewDates])
  /** Per competence: the hours that remain in the days in view. A competence with neither demand nor assigned hours in the period is not in it. */
  const remainingOf = useMemo(() => remainingIn(balance, viewDates), [balance, viewDates])
  // The demand lists the competences people have, and any other with demand or assigned hours in the period.
  const demandRows = useMemo(() => {
    const held = new Set(staffed.map((style) => style.key))
    return [...styles.values()].filter((style) => held.has(style.key) || remainingOf.has(style.key)).map((style) => ({ style, key: keyOf.get(style.key) ?? 0 }))
  }, [staffed, styles, remainingOf, keyOf])

  const firstWorkday = useMemo(() => {
    for (let col = Math.min(dates.length - 1, Math.ceil(viewport.left / colW)); col < dates.length; col++) if (dayType(dates[col]) === 'arbeidsdag') return dates[col]
    return dates[dates.length - 1]
  }, [dates, viewport.left, colW])
  // The week a person's hours are counted in: that of the day in focus while it is in view, else of the first workday in view.
  const focusInView = focusDate !== undefined && dates.length > 0 && focusDate >= dates[viewFrom] && focusDate <= dates[viewTo]
  const weekStart = active && dates.length ? weekDates(focusInView ? focusDate : firstWorkday)[0] : ''
  const week = useMemo(() => (weekStart ? weekDates(weekStart) : []), [weekStart])

  const uncoverable = useMemo(() => {
    if (!active) return NO_HOURS
    const hours = new Map<string, number>()
    for (const { style } of demandRows) {
      for (const date of cols.dates) {
        if (balance.get(style.key, date).remaining < EPSILON) continue
        const short = uncoverableHours(ws, style.key, date, balance)
        if (short > EPSILON) hours.set(`${style.key}|${date}`, short)
      }
    }
    return hours
  }, [active, ws, balance, demandRows, cols.dates])

  // ---- the lines of the people -----------------------------------------------------------------------
  // Blocks that do not count and still leave a gap. One whose day is covered by others is no longer something to solve.
  const open = useMemo(() => (active ? openUnresolved(ws) : []), [active, ws])
  const openIds = useMemo(() => new Set(open.map((a) => a.id)), [open])
  // A block counts when some of it does: absence for a part of the day takes only the time it covers.
  const ok = useMemo(() => new Set(active ? okAssignments(ws).map((a) => a.id) : []), [active, ws])
  const isOk = useCallback((a: Assignment) => ok.has(a.id), [ok])
  const isOpen = useCallback((a: Assignment) => openIds.has(a.id), [openIds])
  const lines = useMemo<PersonLine[]>(() => {
    const byDay = <T extends { personId: string; date: ISODate }>(list: T[]) => {
      const map = new Map<string, Map<ISODate, T[]>>()
      for (const item of list) {
        let days = map.get(item.personId)
        if (!days) map.set(item.personId, (days = new Map()))
        days.set(item.date, [...(days.get(item.date) ?? []), item])
      }
      return map
    }
    const assignments = byDay(ws.assignments ?? [])
    const absence = byDay(ws.unavailability ?? [])
    const all = persons.map((person) => ({ person, assignments: assignments.get(person.id), absence: absence.get(person.id), week: personWeek(ws, person.id, week), dim: !!activeBrush && !person.competences.includes(activeBrush) }))
    // With a competence in focus, the people who have it come first.
    return activeBrush ? [...all.filter((line) => !line.dim), ...all.filter((line) => line.dim)] : all
  }, [ws, persons, week, activeBrush])
  /** How many of the lines have the competence in focus; the rest follow a divider. */
  const able = activeBrush ? lines.filter((line) => !line.dim).length : lines.length
  const divided = able < lines.length
  // The person whose hours are open is shown above the list, not in it.
  const listed = useMemo(() => lines.filter((line) => line.person.id !== unfolded), [lines, unfolded])
  const listedAble = activeBrush ? listed.filter((line) => !line.dim).length : listed.length

  // R36: the people with a week of the period above the overtime limit. It flags, and stops nothing.
  const breaches = useMemo(() => {
    if (!active || !dates.length) return []
    const first = weekDates(dates[0])[0]
    return overtimeBreaches(ws, overtimeLimit)
      .map((person) => ({ ...person, weeks: person.weeks.filter(({ monday }) => monday >= first && monday <= dates[dates.length - 1]) }))
      .filter((person) => person.weeks.length > 0)
  }, [active, ws, overtimeLimit, dates])
  /** The people whose overtime in the week the lines count is above the limit. */
  const overLimit = useMemo(() => new Set(breaches.filter((person) => person.weeks.some(({ monday }) => monday === weekStart)).map((person) => person.personId)), [breaches, weekStart])

  // ---- where the pointer is --------------------------------------------------------------------------
  /** The line and the day under a point of the window. The pointer is measured against the grid, not the elements, so nothing laid over the grid stops a stroke. */
  const cellAt = (x: number, y: number): { row: number; col: number } | null => {
    const el = scrollRef.current
    const body = bodyRef.current
    if (!el || !body || !listed.length) return null
    const col = Math.floor(daysAcross(el, x, colW))
    const top = y - body.getBoundingClientRect().top
    const gap = divided && listedAble < listed.length ? DIVIDER_H : 0
    const row = top < listedAble * PERSON_H ? Math.floor(top / PERSON_H) : top < listedAble * PERSON_H + gap ? listedAble - 1 : listedAble + Math.floor((top - listedAble * PERSON_H - gap) / PERSON_H)
    return { row: Math.min(listed.length - 1, Math.max(0, row)), col: Math.min(dates.length - 1, Math.max(0, col)) }
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
  const dayAt = (row: number, col: number): Day => ({ personId: listed[row].person.id, date: dates[col] })
  /** The day a selection started in: the person «E» opens, and the day a new absence starts on. */
  const selected: Day | null = selection && selection.row0 < listed.length ? dayAt(selection.row0, selection.col0) : null
  const selectDay = (day: Day | null) => {
    const row = day ? listed.findIndex((line) => line.person.id === day.personId) : -1
    const col = day ? dates.indexOf(day.date) : -1
    setSelection(row >= 0 && col >= 0 ? { row0: row, col0: col, row1: row, col1: col } : null)
  }
  const strokeCells = (s: Stroke): Day[] => {
    const { rowFrom, rowTo, colFrom, colTo } = strokeRange(s)
    const cells: Day[] = []
    for (let row = rowFrom; row <= rowTo && row < listed.length; row++) for (let col = colFrom; col <= colTo; col++) cells.push(dayAt(row, col))
    return cells
  }

  /** The people a paste lands on: the line under the pointer for the first person copied, and the lines under it for the next. */
  const pasteOnto = (copied: Clipboard, row: number) => copied.people.map((_, i) => listed[row + i]?.person.id)

  // ---- what a stroke, or the brush over a day, would do ------------------------------------------------
  const lineOf = useMemo(() => new Map(lines.map((line) => [line.person.id, line])), [lines])
  const blocksOn = (cell: Day): Assignment[] => lineOf.get(cell.personId)?.assignments?.get(cell.date) ?? []
  /** The first and the last of the columns the days are in. */
  const colsOf = (days: ISODate[]) => {
    const at = days.map((date) => dates.indexOf(date))
    return { colFrom: Math.min(...at), colTo: Math.max(...at) }
  }
  /**
   * The days a brush stroke is drawn over. Drawn out, it stops at a time of the day under the pointer, as a pulled end of a run does:
   * the days before it are filled whole and that day no further than the stop, on every line of the stroke. Drawn back over
   * earlier days, the day under the pointer is filled from the stop on. A click fills its day.
   */
  const drawnCells = (s: Stroke): Day[] => {
    const cells = strokeCells(s)
    if (s.at === undefined) return cells
    const back = s.col1 < s.col0
    const far = dates[s.col1]
    const within = back ? { start: s.at, end: wd.dayEnd } : { start: wd.dayStart, end: s.at }
    // Nothing of the day under the pointer is taken where the stop is its near edge; a stroke that has only that day fills it.
    if (within.end <= within.start) return s.col0 === s.col1 ? cells : cells.filter((cell) => cell.date !== far)
    return cells.map((cell) => (cell.date === far && (within.start > wd.dayStart || within.end < wd.dayEnd) ? { ...cell, within } : cell))
  }
  /** The days a brush stroke fills: those it is drawn over, and with Shift held no further than where the demand is met (R47). */
  const paintCells = (s: Stroke): Day[] => {
    const drawn = drawnCells(s)
    return s.toDemand && activeBrush ? cellsToDemand(ws, drawn, activeBrush, balance, s.col1 < s.col0) : drawn
  }
  /** The days the brush stroke under way fills, worked out once for its preview, its outline and the count of the demand. */
  const painted = useMemo(
    () => (stroke?.mode === 'paint' ? paintCells(stroke) : null),
    // `paintCells` reads `listed`, `dates`, the brush and the balance.
    [stroke, ws, listed, dates, activeBrush, balance], // eslint-disable-line react-hooks/exhaustive-deps
  )
  /** R46: what the end of a run that is being pulled does, or `null` while it is where it was. */
  const stretch = useMemo((): StretchPlan | null => {
    if (stroke?.mode !== 'stretch' || stroke.stretch?.at === undefined || stroke.row0 >= listed.length) return null
    const line = listed[stroke.row0]
    const from = dates[stroke.col0]
    const block = line.assignments?.get(from)?.find((a) => a.id === stroke.stretch!.blockId)
    if (!block) return null
    const days: BlocksOn = (date) => line.assignments?.get(date)
    const plan = stretchRun(runDays(days, from, block, wd), stroke.stretch.edge, dates[stroke.col1], stroke.stretch.at, wd)
    const erase = plan.remove.length > 0 || plan.trim !== undefined
    const drawn: Day[] = erase ? plan.remove.map((day) => ({ personId: line.person.id, date: day.date })) : plan.add.map((day) => ({ personId: line.person.id, date: day.date, within: day.within }))
    // With Shift held, an end pulled outward goes no further than where the demand is met (R47).
    const cells = !erase && stroke.toDemand ? cellsToDemand(ws, drawn, block.competence, balance, stroke.stretch.edge === 'start') : drawn
    const changed = erase ? [...plan.remove.map((day) => day.date), ...(plan.trim ? [plan.trim.block.date] : [])] : cells.map((cell) => cell.date)
    if (!changed.length) return null
    return {
      row: stroke.row0,
      ...colsOf(changed),
      competence: block.competence,
      erase,
      cells,
      blockIds: plan.remove.map((day) => day.block.id),
      trim: plan.trim && { blockId: plan.trim.block.id, date: plan.trim.block.date, start: plan.trim.start, end: plan.trim.end },
      own: plan.add.find((day) => day.own)?.date,
    }
    // `colsOf` reads `dates`.
  }, [stroke, listed, dates, ws, wd, balance]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The days a brush stroke that stops where the demand is met reaches, `null` where it lacks nothing; `undefined` for any other stroke. */
  const paintReach = !painted || !stroke?.toDemand ? undefined : painted.length ? colsOf(painted.map((cell) => cell.date)) : null
  /** R46: the assignments as a pulled end of a run leaves them: its days painted as the brush would, or the run's blocks on them removed and the one it stops in cut. */
  const stretched = (w: Workspace, plan: StretchPlan): Assignment[] =>
    plan.erase
      ? (w.assignments ?? []).filter((a) => !plan.blockIds.includes(a.id)).map((a) => (plan.trim && a.id === plan.trim.blockId ? { ...a, start: plan.trim.start, end: plan.trim.end } : a))
      : paintDays(w, plan.cells, plan.competence, 'full')
  const { ghost, info, refused } = useMemo((): { ghost: Ghosts; info: StrokeInfo | null; refused: Day | null } => {
    const none = { ghost: NO_GHOST, info: null, refused: null }
    if (!active) return none
    const lastDate = dates[dates.length - 1]
    const found: Ghosts = new Map()
    const put = (cell: Day, blocks: Piece[]) => {
      if (!blocks.length) return
      if (!found.has(cell.personId)) found.set(cell.personId, new Map())
      found.get(cell.personId)!.set(cell.date, blocks)
    }
    /** What the brush would give the days, drawn across: the time as a preview, and the count of it. A working day it cannot fill is passed over; `own` is none. */
    const brushed = (cells: Day[], competence: string, span: PaintSpan, own?: ISODate) => {
      const count = { days: 0, hours: 0, skipped: 0 }
      const offDays = onlyOffDays(cells)
      for (const cell of cells) {
        const gaps = paintGaps(ws, cell, competence, span, offDays)
        if (gaps.length) {
          put(cell, gaps.map((gap) => ({ ...gap, competence })))
          count.days += 1
          count.hours += paidTotal(gaps, wd)
        } else if (dayType(cell.date) === 'arbeidsdag' && cell.date !== own) count.skipped += 1
      }
      return count
    }
    if (stroke?.mode === 'stretch') {
      if (!stretch) return none
      if (stretch.erase) {
        const gone = stretch.cells.flatMap(blocksOn).filter((a) => stretch.blockIds.includes(a.id))
        const cut = stretch.trim && blocksOn({ personId: listed[stretch.row].person.id, date: stretch.trim.date }).find((a) => a.id === stretch.trim!.blockId)
        const cutHours = cut && stretch.trim ? paidHours(cut, wd) - paidHours(stretch.trim, wd) : 0
        return { ...none, info: { mode: 'erase', half: false, days: gone.length + (cut ? 1 : 0), hours: paidTotal(gone, wd) + cutHours, people: 1, skipped: 0 } }
      }
      // The days the run is to go on over get what the brush would give them.
      const count = brushed(stretch.cells, stretch.competence, 'full', stretch.own)
      return { ghost: found, info: { mode: 'paint', half: false, people: 1, competence: stretch.competence, toDemand: stroke.toDemand, ...count }, refused: null }
    }
    if (stroke?.mode === 'erase') {
      const blocks = strokeCells(stroke).flatMap(blocksOn)
      return { ...none, info: { mode: 'erase', half: false, days: new Set(blocks.map((a) => `${a.personId}|${a.date}`)).size, hours: paidTotal(blocks, wd), people: new Set(blocks.map((a) => a.personId)).size, skipped: 0 } }
    }
    if (stroke?.mode === 'select') {
      const { rowFrom, rowTo, colFrom, colTo } = strokeRange(stroke)
      return { ...none, info: { mode: 'select', half: false, days: colTo - colFrom + 1, hours: 0, people: rowTo - rowFrom + 1, skipped: 0 } }
    }
    if (stroke?.mode === 'move') {
      // The day's blocks on their way to another day or person: where they would land, or that they cannot.
      if (stroke.row0 === stroke.row1 && stroke.col0 === stroke.col1) return none
      const from = dayAt(stroke.row0, stroke.col0)
      const to = dayAt(stroke.row1, stroke.col1)
      const blocks = blocksOn(from)
      if (typeof moveDay(ws, { from, to, blockIds: blocks.map((a) => a.id) }) === 'string') return { ...none, refused: to }
      put(to, blocks.flatMap((block) => landingGaps(ws, to, block).map((gap) => ({ ...gap, competence: block.competence }))))
      return { ...none, ghost: found }
    }
    if (activeTool === 'select') {
      // What was copied, where a paste would put it: for the same people, from the day under the pointer.
      if (!clip || !hover || stroke) return none
      for (const { cell, blocks } of pasteTargets(ws, clip, dates[hover.col], lastDate, pasteOnto(clip, hover.row))) put(cell, blocks)
      return { ...none, ghost: found }
    }
    if (activeTool !== 'paint' || !activeBrush) return none
    const cells = stroke ? (painted ?? []) : hover && hover.row < listed.length ? [dayAt(hover.row, hover.col)] : []
    if (!cells.length) return none
    const half = stroke ? stroke.half : shift
    const count = brushed(cells, activeBrush, half ? 'half' : 'full')
    return { ghost: found, info: stroke ? { mode: 'paint', half, people: found.size, toDemand: stroke.toDemand, ...count } : null, refused: null }
    // `strokeCells`, `dayAt` and `blocksOn` read `lineOf`, `listed` and `dates`.
  }, [active, ws, lineOf, listed, dates, activeTool, activeBrush, stroke, stretch, painted, hover, shift, clip]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- the demand as it would be after the stroke under way ---------------------------------------------
  // What remains is counted while a stroke is drawn, so it can be stopped where the demand is met. The stroke is worked out as
  // it will be when the button is let go, by the same rules, and the balance of its days is built from that.
  const afterStroke = useMemo((): { assignments: Assignment[]; dates: ISODate[] } | null => {
    if (!active || !stroke || stroke.mode === 'select') return null
    const all = ws.assignments ?? []
    const between = dates.slice(Math.min(stroke.col0, stroke.col1), Math.max(stroke.col0, stroke.col1) + 1)
    if (stroke.mode === 'stretch') {
      if (!stretch) return null
      return { assignments: stretched(ws, stretch), dates: dates.slice(stretch.colFrom, stretch.colTo + 1) }
    }
    if (stroke.mode === 'erase') return { assignments: clearDays(all, strokeCells(stroke)), dates: between }
    if (stroke.mode === 'paint') return activeBrush && painted ? { assignments: paintDays(ws, painted, activeBrush, stroke.half ? 'half' : 'full'), dates: between } : null
    const from = dayAt(stroke.row0, stroke.col0)
    const to = dayAt(stroke.row1, stroke.col1)
    const moved = moveDay(ws, { from, to, blockIds: blocksOn(from).map((a) => a.id) })
    return typeof moved === 'string' ? null : { assignments: moved, dates: [from.date, to.date] }
    // `strokeCells`, `dayAt` and `blocksOn` read `lineOf`, `listed` and `dates`.
  }, [active, ws, lineOf, listed, dates, activeBrush, stroke, stretch, painted]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The balance the demand shows: as it is, and on the days of a stroke under way as the stroke would leave it. */
  const shownBalance = useMemo<Balance>(() => {
    if (!afterStroke || afterStroke.assignments === (ws.assignments ?? [])) return balance
    const days = new Set(afterStroke.dates)
    const after = buildBalance({ ...ws, allocations: planned, assignments: afterStroke.assignments }, afterStroke.dates)
    return { get: (competence, date) => (days.has(date) ? after.get(competence, date) : balance.get(competence, date)), competences: [...new Set([...balance.competences, ...after.competences])] }
  }, [afterStroke, balance, ws, planned])
  /** Per competence: the hours that remain in the days in view, as the demand shows them. */
  const shownRemaining = useMemo(() => (shownBalance === balance ? remainingOf : remainingIn(shownBalance, viewDates)), [shownBalance, balance, remainingOf, viewDates])

  // ---- what the tools do ------------------------------------------------------------------------------
  const nameOf = (personId: string) => persons.find((p) => p.id === personId)?.name ?? ''
  const labelOf = (competence: string) => styles.get(competence)?.label ?? competence
  const dayName = (date: ISODate) => WEEKDAYS_LONG[weekdayIndex(date)]

  /** Why a day cannot be painted, for the one day a click hit. */
  const blockText = (cell: Day, competence: string): string => {
    const why = paintBlock(ws, cell, competence, true)
    if (why === 'ineligible') return `${nameOf(cell.personId)} har ikke ${labelOf(competence)}.`
    if (!why) return `${nameOf(cell.personId)} har ingen ledig tid ${dayName(cell.date)}.`
    const away = (ws.unavailability ?? []).find((u) => u.personId === cell.personId && u.date === cell.date)
    const reason = away ? ABSENCE_LABELS[away.kind].toLowerCase() : ''
    return `${nameOf(cell.personId)} er ikke tilgjengelig ${dayName(cell.date)}${reason ? ` (${reason})` : ''}.`
  }

  /** Paints the free time of the days (R6). A paint never replaces what is there. */
  const paint = (cells: Day[], competence: string, half: boolean) => {
    const span = half ? 'half' : 'full'
    if (cells.every((cell) => !paintGaps(ws, cell, competence, span, onlyOffDays(cells)).length)) {
      if (cells.length === 1) toast(blockText(cells[0], competence))
      return
    }
    updateStaffing((w) => ({ ...w, assignments: paintDays(w, cells, competence, span) }))
  }
  const clear = (cells: Day[]) => updateStaffing((w) => ({ ...w, assignments: clearDays(w.assignments ?? [], cells) }))
  const removeOpen = () => updateStaffing((w) => ({ ...w, assignments: removeUnresolved(w, dates) }))

  const cancelStroke = () => {
    endStroke.current?.()
    setStroke(null)
    pointer.current = null
  }
  const finishStroke = (s: Stroke, copy: boolean) => {
    cancelStroke()
    const dragged = s.row0 !== s.row1 || s.col0 !== s.col1
    if (s.mode === 'stretch') {
      // R46: an end of a run let go where it was pulled to. Its days are painted as the brush would, or the run's blocks on them removed.
      if (!stretch || stretched(ws, stretch) === (ws.assignments ?? [])) return
      updateStaffing((w) => ({ ...w, assignments: stretched(w, stretch) }))
    } else if (s.mode === 'erase') clear(strokeCells(s))
    else if (s.mode === 'paint') {
      if (activeBrush) paint(paintCells(s), activeBrush, s.half)
    } else if (!dragged) {
      // A press that goes nowhere is a click: it selects the day, and lets go of it when it was the one selected.
      const same = selection !== null && selection.row0 === s.row0 && selection.col0 === s.col0 && selection.row1 === s.row0 && selection.col1 === s.col0
      setSelection(same ? null : { row0: s.row0, col0: s.col0, row1: s.row0, col1: s.col0 })
      if (!same) onFocusDate(dates[s.col0])
    } else if (s.mode === 'select') setSelection({ row0: s.row0, col0: s.col0, row1: s.row1, col1: s.col1 })
    else moveBlocks(dayAt(s.row0, s.col0), dayAt(s.row1, s.col1), copy)
  }
  /** R38: moves the blocks of a day to another day or person, or copies them there. */
  const moveBlocks = (from: Day, to: Day, copy: boolean) => {
    const move = { from, to, blockIds: blocksOn(from).map((a) => a.id), copy }
    const result = moveDay(ws, move)
    if (result === 'ineligible') return toast(`${nameOf(to.personId)} har ikke kompetansen for arbeidet.`)
    if (result === 'away') return toast(`${nameOf(to.personId)} er borte ${dayName(to.date)}.`)
    if (result === 'overlap') return toast(`${nameOf(to.personId)} har ingen ledig tid da ${dayName(to.date)}.`)
    updateStaffing((w) => {
      const moved = moveDay(w, move)
      return typeof moved === 'string' ? w : { ...w, assignments: moved }
    })
  }
  const selectionCells = (): Day[] => (selection ? strokeCells({ mode: 'select', half: false, ...selection }) : [])
  const copySelection = () => {
    const copied = copyDays(ws, selectionCells())
    if (!copied) return toast(selection ? 'Ingen blokker å kopiere i det som er valgt.' : 'Velg dager med «Velg» for å kopiere dem.')
    setClip(copied)
  }
  /** R34: pastes at the day under the pointer, else at the first selected day. */
  const pasteClip = () => {
    const at = hover ?? (selection ? { row: Math.min(selection.row0, selection.row1), col: Math.min(selection.col0, selection.col1) } : null)
    if (!clip || !at) return
    const anchor = dates[at.col]
    const onto = pasteOnto(clip, at.row)
    const lastDate = dates[dates.length - 1]
    const { pasted, skipped } = pasteDays(ws, clip, anchor, lastDate, onto)
    const skippedText = skipped ? ` · ${skipped} hoppet over` : ''
    if (!pasted) return toast(`Ingenting ble limt inn fra ${fmtDay(anchor)}: dagene er opptatt, eller personen er borte eller har ikke kompetansen.`)
    updateStaffing((w) => ({ ...w, assignments: pasteDays(w, clip, anchor, lastDate, onto).assignments }))
    toast(`Limte inn ${pasted === 1 ? '1 blokk' : `${pasted} blokker`} fra ${fmtDay(anchor)}${skippedText}`, { label: 'Angre', run: undo })
  }

  // A selection is lines of the list as it is, so it is let go of when the list changes.
  const toggleUnfolded = (personId: string) => {
    setSelection(null)
    setUnfolded((current) => (current === personId ? null : personId))
  }
  /** Moves the open hours to the person before or after in the list. */
  const stepUnfolded = (delta: number) => {
    const at = lines.findIndex((line) => line.person.id === unfolded)
    const next = lines[Math.min(Math.max(at + delta, 0), lines.length - 1)]
    setSelection(null)
    if (next) setUnfolded(next.person.id)
  }

  const pickBrush = (competence: string) => {
    setBrush(competence)
    setTool('paint')
    setSelection(null)
  }
  const clearBrush = () => {
    setBrush(null)
    setTool('select')
    setSelection(null)
  }
  const pickTool = (next: Tool) => {
    if (next === 'paint' && !activeBrush) {
      // R14: the competence with the most left to cover on the first workday in view.
      const competence = defaultBrush(ws, firstWorkday, balance)
      if (!competence) return toast('Ingen av de faste har en kompetanse ennå. Legg dem inn på Mannskap › Faste.')
      setBrush(competence)
    }
    setTool(next)
  }
  /** A pick in the demand is a step back to all the people: the open hours fold. */
  const pickFromDemand = (competence: string) => {
    if (competence === activeBrush) return clearBrush()
    pickBrush(competence)
    setUnfolded(null)
  }

  const actions = useStableActions({
    cellDown: (event: React.MouseEvent) => {
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
      pointer.current = { x: event.clientX, y: event.clientY }
      pressedAt.current = event.clientX
      setStroke({ mode, half: mode === 'paint' && event.shiftKey, row0: at.row, col0: at.col, row1: at.row, col1: at.col, stretch: edge ? { edge: edge.dataset.edge === 'start' ? 'start' : 'end', blockId: edge.dataset.block ?? '' } : undefined })
      followStroke()
    },
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
      const at = cellAt(event.clientX, event.clientY)
      if (stroke || !(activeTool === 'paint' || (activeTool === 'select' && clip))) return
      setHover((h) => (at && h && h.row === at.row && h.col === at.col ? h : at))
    },
    bodyLeave: () => setHover(null),
  })

  // A stroke follows the pointer wherever it goes, and ends where the button is let go.
  const strokeEnv = useStableActions({
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
      } else if (s.mode === 'paint' && !s.half && stops) {
        // The brush is drawn to a stop of the day under the pointer too, once the pointer has left where it was pressed.
        const moved = s.at !== undefined || at.row !== s.row0 || at.col !== s.col0 || Math.abs(x - pressedAt.current) > DRAG_FROM
        const stop = moved ? stretchStop(share, at.col < s.col0 ? 'start' : 'end', wd) : undefined
        // A day the stroke has only reached the near edge of is not in it yet: the stroke ends with the day before, whole.
        const short = stop !== undefined && (at.col > s.col0 ? stop <= wd.dayStart : at.col < s.col0 && stop >= wd.dayEnd)
        const col = short ? at.col + (at.col > s.col0 ? -1 : 1) : at.col
        const time = short ? (at.col > s.col0 ? wd.dayEnd : wd.dayStart) : stop
        const toDemand = moved && shiftHeld.current
        if (s.row1 !== at.row || s.col1 !== col || s.at !== time || !s.toDemand !== !toDemand) setStroke({ ...s, row1: at.row, col1: col, at: time, toDemand })
      } else if (s.row1 !== at.row || s.col1 !== at.col) setStroke({ ...s, row1: at.row, col1: at.col })
    },
    finish: (copy: boolean) => strokeRef.current && finishStroke(strokeRef.current, copy),
  })
  /** Listens for the pointer from the moment the button goes down, until it is let go or the stroke is called off. */
  const followStroke = () => {
    endStroke.current?.()
    const onMove = (e: MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY }
      strokeEnv.move(e.clientX, e.clientY)
    }
    const onUp = (e: MouseEvent) => strokeEnv.finish(e.altKey)
    // Near the edges of the days the grid scrolls on under a still pointer.
    const timer = setInterval(() => {
      const el = scrollRef.current
      const at = pointer.current
      if (!el || !at) return
      const box = el.getBoundingClientRect()
      const dx = at.x > box.right - SCROLL_NEAR_RIGHT - (panelOpen.current ? PANEL_W : 0) ? 1 : at.x < box.left + LEFT_W + SCROLL_NEAR_LEFT ? -1 : 0
      const dy = at.y > box.bottom - SCROLL_NEAR_BOTTOM ? 1 : 0
      if (!dx && !dy) return
      el.scrollLeft += dx * 40
      el.scrollTop += dy * 20
      strokeEnv.move(at.x, at.y)
    }, 60)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    endStroke.current = () => {
      clearInterval(timer)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      endStroke.current = null
    }
  }
  useEffect(() => () => endStroke.current?.(), [])

  /** Shift goes down or up: a stroke under way is worked out again where the pointer is. */
  const holdShift = (down: boolean) => {
    setShift(down)
    shiftHeld.current = down
    if (strokeRef.current && pointer.current) strokeEnv.move(pointer.current.x, pointer.current.y)
  }
  const keys = useStableActions({
    down: (e: KeyboardEvent) => {
      if (!active || innleid) return
      if (e.key === 'Shift') holdShift(true)
      if (isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if (e.metaKey || e.ctrlKey) {
        if (key === 'c' && selection) {
          e.preventDefault()
          copySelection()
        } else if (key === 'v' && clip) {
          e.preventDefault()
          pasteClip()
        }
        return
      }
      if (key === 'escape') {
        // A menu or a popover that is open takes the key first, and closes itself.
        if (menu || demandPop) return
        if (stroke) cancelStroke()
        else if (selectedBlock) setSelectedBlock(null)
        else if (selection) setSelection(null)
        else if (activeBrush || tool !== 'select') clearBrush()
        else if (panel) setPanel(null)
        else setUnfolded(null)
      } else if (TOOL_KEYS[key] && !e.altKey) pickTool(TOOL_KEYS[key])
      else if (/^[1-9]$/.test(key) && staffed[Number(key) - 1]) pickBrush(staffed[Number(key) - 1].key)
      else if (key === 'e' && !e.altKey) {
        const personId = selected?.personId ?? unfolded
        if (personId) toggleUnfolded(personId)
      } else if ((key === 'arrowup' || key === 'arrowdown') && unfolded) {
        e.preventDefault()
        stepUnfolded(key === 'arrowup' ? -1 : 1)
      } else if ((key === 'delete' || key === 'backspace') && (selectedBlock || selection)) {
        e.preventDefault()
        if (selectedBlock) {
          updateStaffing((w) => ({ ...w, assignments: deleteBlock(w.assignments ?? [], selectedBlock) }))
          setSelectedBlock(null)
        } else clear(selectionCells())
      }
    },
    up: (e: KeyboardEvent) => {
      if (e.key === 'Shift') holdShift(false)
    },
    /** The window is left: no key is held any more. */
    lost: () => holdShift(false),
  })
  useEffect(() => {
    // In the capture phase, so Escape is seen while a menu that closes on it is still open.
    window.addEventListener('keydown', keys.down, true)
    window.addEventListener('keyup', keys.up)
    window.addEventListener('blur', keys.lost)
    return () => {
      window.removeEventListener('keydown', keys.down, true)
      window.removeEventListener('keyup', keys.up)
      window.removeEventListener('blur', keys.lost)
    }
  }, [keys])

  return {
    ws, dates, cols, room, viewFrom, viewTo, bodyRef, onFocusDate, projects, phases, chosenProject,
    persons, staffed, styles, keyOf, lastKey: Math.min(staffed.length, LAST_KEY),
    tool: activeTool, brush: activeBrush, pickTool, pickBrush, clearBrush, pickFromDemand, shift,
    balance, shownBalance, shownRemaining, totals, remainingOf, demandRows, uncoverable,
    lines, listed, listedAble, able, week, isOk, isOpen, ghost, info, refused, stroke, stretch, paintReach, selected, selection, clip, setClip,
    unfolded, setUnfolded, toggleUnfolded, stepUnfolded, cross, setCross, takeCross, selectedBlock, setSelectedBlock, dateAtX,
    unresolved: open.length, removeOpen, paint, clear,
    menu, setMenu, demandPop, setDemandPop, panel, setPanel, overtimeLimit, breaches, overLimit, blockNames, onShowDate, firstWorkday,
    projectsOpen, setProjectsOpen, projectDensity, setProjectDensity, demandOpen, setDemandOpen, demandDensity, setDemandDensity, idleOpen, setIdleOpen,
    toasts, toast: toast as (text: string, action?: Toast['action']) => void, dismissToast, updateStaffing,
    actions, nameOf, labelOf, dayName,
  }
}

export type BemanningState = ReturnType<typeof useBemanningState>
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
