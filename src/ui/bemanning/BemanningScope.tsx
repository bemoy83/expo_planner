import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { competenceStyles, staffedCompetences } from '../../domain/competences'
import { weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { buildBalance, clearDays, copyDays, overtimeBreaches, defaultBrush, deleteBlock, landingGaps, moveDay, pasteDays, pasteTargets, freeCapacity, okAssignments, openUnresolved, paidHours, paintBlock, paintDays, paintGaps, personWeek, removeUnresolved, uncoverable as uncoverableHours, weekTotals, type Balance, type Clipboard, type DayCell as Day, type FreeCapacity, type PersonWeek, type WeekTotals } from '../../domain/staffing'
import type { Assignment, CompetenceStyle, Interval, Person, Unavailability, VenuePhase, Workspace } from '../../domain/types'
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
import { strokeRange, TOOL_KEYS, type Rect, type Stroke, type Tool } from './tools'
import { EPSILON, weekDates, WEEKDAYS_LONG } from './week'

/** The highest number a competence can be picked with on the keyboard. */
const LAST_KEY = 9
/** How near the edges of the days the pointer makes a stroke scroll the grid: the right edge, the label column, the bottom. */
const SCROLL_NEAR_RIGHT = 40
const SCROLL_NEAR_LEFT = 16
const SCROLL_NEAR_BOTTOM = 30

export type Density = 'detail' | 'compact'
const cleanDensity = (stored: unknown): Density => (stored === 'compact' ? 'compact' : 'detail')

interface Props {
  /** Bemanning is what the rows of the Kalender show. Nothing is worked out otherwise. */
  active: boolean
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
}

/** Time a stroke would give a day; with the competence it is of when that is not the brush. */
export type GhostBlock = Interval & { competence?: string }
type Ghosts = Map<string, Map<ISODate, GhostBlock[]>>
const NO_GHOST: Ghosts = new Map()
const NO_PREVIEW = new Map<ISODate, number>()
const NO_HOURS = new Map<string, number>()

function useBemanningState({ active, dates, cols, viewport, scrollRef, focusDate, onFocusDate, projects, phases, chosenProject, unfolded, setUnfolded, onShowDate, blockNames, overtimeLimit }: Omit<Props, 'children'>) {
  const { workspace, updateStaffing, undo } = useWorkspace()
  const ws = workspace!
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
  const balance = useMemo<Balance>(() => buildBalance(ws, active ? dates : []), [active, ws, dates])
  const totals = useMemo<WeekTotals>(() => (active ? weekTotals(ws, dates) : { coveredShare: null, remaining: 0, overtime: 0, weekendOpen: 0 }), [active, ws, dates])
  /** Per competence: the hours that remain in the period. A competence with neither demand nor assigned hours is not in it. */
  const remainingOf = useMemo(() => {
    const remaining = new Map<string, number>()
    for (const competence of balance.competences) remaining.set(competence, dates.reduce((sum, date) => sum + Math.max(0, balance.get(competence, date).remaining), 0))
    return remaining
  }, [balance, dates])
  // The demand lists the competences people have, and any other with demand or assigned hours in the period.
  const demandRows = useMemo(() => {
    const held = new Set(staffed.map((style) => style.key))
    return [...styles.values()].filter((style) => held.has(style.key) || remainingOf.has(style.key)).map((style) => ({ style, key: keyOf.get(style.key) ?? 0 }))
  }, [staffed, styles, remainingOf, keyOf])

  // ---- what is in view ---------------------------------------------------------------------------------
  // The days that are seen: those the panel does not lie over.
  const room = Math.max(colW, viewport.width - LEFT_W - (panel ? PANEL_W : 0))
  const viewFrom = Math.max(0, Math.floor(viewport.left / colW))
  const viewTo = Math.min(dates.length - 1, Math.floor((viewport.left + room - 1) / colW))
  const firstWorkday = useMemo(() => {
    for (let col = Math.min(dates.length - 1, Math.ceil(viewport.left / colW)); col < dates.length; col++) if (dayType(dates[col]) === 'arbeidsdag') return dates[col]
    return dates[dates.length - 1]
  }, [dates, viewport.left, colW])
  // The week a person's hours are counted in: that of the day in focus while it is in view, else of the first workday in view.
  const focusInView = focusDate !== undefined && dates.length > 0 && focusDate >= dates[viewFrom] && focusDate <= dates[viewTo]
  const weekStart = active && dates.length ? weekDates(focusInView ? focusDate : firstWorkday)[0] : ''
  const week = useMemo(() => (weekStart ? weekDates(weekStart) : []), [weekStart])

  const capacity = useMemo(() => new Map<ISODate, FreeCapacity>(active ? cols.dates.map((date) => [date, freeCapacity(ws, date, activeBrush ?? undefined)]) : []), [active, ws, cols.dates, activeBrush])
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
  const ok = useMemo(() => new Set(active ? okAssignments(ws) : []), [active, ws])
  const isOk = useCallback((a: Assignment) => ok.has(a), [ok])
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
    const col = Math.floor((x - el.getBoundingClientRect().left - LEFT_W + el.scrollLeft) / colW)
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
      const col = Math.floor((x - el.getBoundingClientRect().left - LEFT_W + el.scrollLeft) / colW)
      return x < el.getBoundingClientRect().left + LEFT_W ? null : (dates[col] ?? null)
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

  // ---- what a stroke, or the brush over a day, would do ------------------------------------------------
  const blocksOn = (cell: Day): Assignment[] => lines.find((line) => line.person.id === cell.personId)?.assignments?.get(cell.date) ?? []
  const { ghost, info, refused } = useMemo((): { ghost: Ghosts; info: StrokeInfo | null; refused: Day | null } => {
    const none = { ghost: NO_GHOST, info: null, refused: null }
    if (!active) return none
    const lastDate = dates[dates.length - 1]
    const found: Ghosts = new Map()
    const put = (cell: Day, blocks: GhostBlock[]) => {
      if (!blocks.length) return
      if (!found.has(cell.personId)) found.set(cell.personId, new Map())
      found.get(cell.personId)!.set(cell.date, blocks)
    }
    if (stroke?.mode === 'erase') {
      const blocks = strokeCells(stroke).flatMap(blocksOn)
      return { ...none, info: { mode: 'erase', half: false, days: new Set(blocks.map((a) => `${a.personId}|${a.date}`)).size, hours: blocks.reduce((sum, a) => sum + paidHours(a, ws.settings.workday), 0), people: new Set(blocks.map((a) => a.personId)).size, skipped: 0 } }
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
      for (const { cell, blocks } of pasteTargets(ws, clip, dates[hover.col], lastDate)) put(cell, blocks)
      return { ...none, ghost: found }
    }
    if (activeTool !== 'paint' || !activeBrush) return none
    const cells = stroke ? strokeCells(stroke) : hover && hover.row < listed.length ? [dayAt(hover.row, hover.col)] : []
    if (!cells.length) return none
    const half = stroke ? stroke.half : shift
    const stats: StrokeInfo = { mode: 'paint', half, days: 0, hours: 0, people: 0, skipped: 0 }
    for (const cell of cells) {
      const gaps = paintGaps(ws, cell, activeBrush, half ? 'half' : 'full')
      if (!gaps.length) {
        if (dayType(cell.date) === 'arbeidsdag') stats.skipped += 1
        continue
      }
      put(cell, gaps)
      stats.days += 1
      stats.hours += gaps.reduce((sum, gap) => sum + paidHours(gap, ws.settings.workday), 0)
    }
    stats.people = found.size
    return { ghost: found, info: stroke ? stats : null, refused: null }
    // `strokeCells`, `dayAt` and `blocksOn` read `lines`, `listed` and `dates`.
  }, [active, ws, lines, listed, dates, activeTool, activeBrush, stroke, hover, shift, clip]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The hours the stroke would add for the brush, by date: shown in the demand before the button is let go. */
  const preview = useMemo(() => {
    if (!ghost.size || activeTool !== 'paint') return NO_PREVIEW
    const added = new Map<ISODate, number>()
    for (const days of ghost.values()) for (const [date, gaps] of days) added.set(date, (added.get(date) ?? 0) + gaps.reduce((sum, gap) => sum + paidHours(gap, ws.settings.workday), 0))
    return added
  }, [ghost, activeTool, ws.settings.workday])

  // ---- what the tools do ------------------------------------------------------------------------------
  const nameOf = (personId: string) => persons.find((p) => p.id === personId)?.name ?? ''
  const labelOf = (competence: string) => styles.get(competence)?.label ?? competence
  const dayName = (date: ISODate) => WEEKDAYS_LONG[weekdayIndex(date)]

  /** Why a day cannot be painted, for the one day a click hit. */
  const blockText = (cell: Day, competence: string): string => {
    const why = paintBlock(ws, cell, competence)
    if (why === 'ineligible') return `${nameOf(cell.personId)} har ikke ${labelOf(competence)}.`
    if (!why) return `${nameOf(cell.personId)} har ingen ledig tid ${dayName(cell.date)}.`
    const kind = dayType(cell.date)
    const away = (ws.unavailability ?? []).find((u) => u.personId === cell.personId && u.date === cell.date)
    const reason = kind !== 'arbeidsdag' ? `${kind}. Overtid legges inn når timene er brettet ut` : away ? ABSENCE_LABELS[away.kind].toLowerCase() : ''
    return `${nameOf(cell.personId)} er ikke tilgjengelig ${dayName(cell.date)}${reason ? ` (${reason})` : ''}.`
  }

  /** Paints the free time of the days (R6). A paint never replaces what is there. */
  const paint = (cells: Day[], competence: string, half: boolean) => {
    const span = half ? 'half' : 'full'
    if (cells.every((cell) => !paintGaps(ws, cell, competence, span).length)) {
      if (cells.length === 1) toast(blockText(cells[0], competence))
      return
    }
    updateStaffing((w) => ({ ...w, assignments: paintDays(w, cells, competence, { span, mode: 'fill' }) }))
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
    if (s.mode === 'erase') clear(strokeCells(s))
    else if (s.mode === 'paint') {
      if (activeBrush) paint(strokeCells(s), activeBrush, s.half)
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
    const anchor = hover ? dates[hover.col] : selection ? dates[Math.min(selection.col0, selection.col1)] : undefined
    if (!clip || !anchor) return
    const lastDate = dates[dates.length - 1]
    const { pasted, skipped } = pasteDays(ws, clip, anchor, lastDate)
    const skippedText = skipped ? ` · ${skipped} hoppet over` : ''
    if (!pasted) return toast(`Ingenting ble limt inn fra ${fmtDay(anchor)}: dagene er opptatt eller personen er borte.`)
    updateStaffing((w) => ({ ...w, assignments: pasteDays(w, clip, anchor, lastDate).assignments }))
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
      if (!competence) return toast('Ingen av de faste har en kompetanse ennå. Legg dem inn på Personell.')
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
      const onBlock = event.target instanceof Element && event.target.closest('.bm-block, .bm-off-blocks > i') !== null
      const mode = event.altKey || activeTool === 'erase' ? 'erase' : activeTool === 'paint' ? 'paint' : onBlock ? 'move' : 'select'
      event.preventDefault()
      if (mode === 'paint' || mode === 'erase') setSelection(null)
      pointer.current = { x: event.clientX, y: event.clientY }
      setStroke({ mode, half: mode === 'paint' && event.shiftKey, row0: at.row, col0: at.col, row1: at.row, col1: at.col })
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
      // The crosshair: the date and the demand of the day under the pointer are tinted. A style variable on the
      // grid moves it, so nothing is drawn again for it.
      const el = scrollRef.current
      if (el && at) {
        el.style.setProperty('--cross-x', `${LEFT_W + at.col * colW}px`)
        el.style.setProperty('--cross-w', `${colW}px`)
        el.classList.add('crossing')
      }
      if (stroke || !(activeTool === 'paint' || (activeTool === 'select' && clip))) return
      setHover((h) => (at && h && h.row === at.row && h.col === at.col ? h : at))
    },
    bodyLeave: () => {
      scrollRef.current?.classList.remove('crossing')
      setHover(null)
    },
  })

  // A stroke follows the pointer wherever it goes, and ends where the button is let go.
  const strokeEnv = useStableActions({
    move: (x: number, y: number) => {
      const at = cellAt(x, y)
      const s = strokeRef.current
      if (at && s && (s.row1 !== at.row || s.col1 !== at.col)) setStroke({ ...s, row1: at.row, col1: at.col })
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

  const keys = useStableActions({
    down: (e: KeyboardEvent) => {
      if (!active) return
      if (e.key === 'Shift') setShift(true)
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
      if (e.key === 'Shift') setShift(false)
    },
  })
  useEffect(() => {
    const lost = () => setShift(false)
    // In the capture phase, so Escape is seen while a menu that closes on it is still open.
    window.addEventListener('keydown', keys.down, true)
    window.addEventListener('keyup', keys.up)
    window.addEventListener('blur', lost)
    return () => {
      window.removeEventListener('keydown', keys.down, true)
      window.removeEventListener('keyup', keys.up)
      window.removeEventListener('blur', lost)
    }
  }, [keys])

  return {
    ws, dates, cols, room, viewFrom, viewTo, bodyRef, focusDate, onFocusDate, projects, phases, chosenProject,
    persons, staffed, styles, keyOf, lastKey: Math.min(staffed.length, LAST_KEY),
    tool: activeTool, brush: activeBrush, pickTool, pickBrush, clearBrush, pickFromDemand, shift,
    balance, totals, remainingOf, demandRows, capacity, uncoverable, preview,
    lines, listed, listedAble, able, divided, week, isOk, isOpen, ghost, info, refused, stroke, hover, selected, selection, clip, setClip,
    unfolded, setUnfolded, toggleUnfolded, stepUnfolded, cross, setCross, takeCross, selectedBlock, setSelectedBlock, dateAtX,
    unresolved: open.length, removeOpen, paint, clear,
    menu, setMenu, demandPop, setDemandPop, panel, setPanel, overtimeLimit, breaches, overLimit, blockNames, onShowDate, firstWorkday,
    projectsOpen, setProjectsOpen, projectDensity, setProjectDensity, demandOpen, setDemandOpen, demandDensity, setDemandDensity, idleOpen, setIdleOpen,
    toasts, toast: toast as (text: string, action?: Toast['action']) => void, dismissToast, undo, updateStaffing,
    actions, nameOf, labelOf, dayName,
  }
}

export type BemanningState = ReturnType<typeof useBemanningState>
/** What the days of a person's line tell the grid; the handlers keep their identity (see `useStableActions`). */
export type PersonActions = BemanningState['actions']
export type DemandRow = { style: CompetenceStyle; key: number }
export type { Workspace }

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
