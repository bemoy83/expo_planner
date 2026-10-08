import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { competenceStyles, staffedCompetences } from '../../domain/competences'
import { addDays, weekdayIndex, type ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { buildBalance, clearDays, defaultBrush, freeCapacity, okAssignments, openUnresolved, paidHours, paintBlock, paintDays, paintGaps, personWeek, removeUnresolved, uncoverable as uncoverableHours, weekTotals, type Balance, type DayCell as Day, type FreeCapacity, type PersonWeek, type WeekTotals } from '../../domain/staffing'
import type { Assignment, CompetenceStyle, Interval, Person, Unavailability, VenuePhase, Workspace } from '../../domain/types'
import { usePref } from '../../store/prefs'
import { useWorkspace } from '../../store/workspaceStore'
import { isTyping } from '../dom'
import type { Columns } from '../kalender/gridTypes'
import { LEFT_W } from '../kalender/layout'
import { useStableActions } from '../kalender/useStableActions'
import { useToasts, type Toast } from '../Toasts'
import { ABSENCE_LABELS } from './dayCell'
import { DIVIDER_H, PERSON_H } from './layout'
import type { ProjectSpan } from './projectsInView'
import { strokeRange, TOOL_KEYS, type Stroke, type Tool } from './tools'
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
  mode: 'paint' | 'erase'
  half: boolean
  /** Person-days that get time, or lose their blocks. */
  days: number
  hours: number
  people: number
  /** Workdays in the stroke that the brush cannot fill. */
  skipped: number
}

const NO_GHOST = new Map<string, Map<ISODate, Interval[]>>()
const NO_PREVIEW = new Map<ISODate, number>()
const NO_HOURS = new Map<string, number>()

function useBemanningState({ active, dates, cols, viewport, scrollRef, focusDate, onFocusDate, projects, phases, chosenProject }: Omit<Props, 'children'>) {
  const { workspace, updateStaffing, undo } = useWorkspace()
  const ws = workspace!
  const { colW } = cols
  const [tool, setTool] = useState<Tool>('select')
  /** The competence in focus, which is also what the brush paints. */
  const [brush, setBrush] = useState<string | null>(null)
  const [selected, setSelected] = useState<Day | null>(null)
  // The stroke under way is kept beside the state too, so the button let go right after it went down still ends it.
  const [stroke, setStrokeState] = useState<Stroke | null>(null)
  const strokeRef = useRef<Stroke | null>(null)
  const setStroke = (next: Stroke | null) => {
    strokeRef.current = next
    setStrokeState(next)
  }
  const endStroke = useRef<(() => void) | null>(null)
  const [hover, setHover] = useState<{ row: number; col: number } | null>(null)
  const [shift, setShift] = useState(false)
  const [menu, setMenu] = useState<{ cell: Day; x: number; y: number } | null>(null)
  const [demandPop, setDemandPop] = useState<{ competence: string; date: ISODate; x: number; y: number } | null>(null)
  const [absenceFor, setAbsenceFor] = useState<Day | null>(null)
  /** The person whose hours are open, pinned above the others. */
  const [unfolded, setUnfolded] = useState<string | null>(null)
  const [projectsOpen, setProjectsOpen] = usePref('showProjects', true)
  const [projectDensity, setProjectDensity] = usePref<Density>('projectDensity', 'detail', cleanDensity)
  const [demandOpen, setDemandOpen] = usePref('showDemand', true)
  const [demandDensity, setDemandDensity] = usePref<Density>('demandDensity', 'detail', cleanDensity)
  const [idleOpen, setIdleOpen] = usePref('bemanningIdleOpen', false)
  const { toasts, show: toast, dismiss: dismissToast } = useToasts()
  const bodyRef = useRef<HTMLDivElement>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)

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
  const room = Math.max(colW, viewport.width - LEFT_W)
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
  const dayAt = (row: number, col: number): Day => ({ personId: listed[row].person.id, date: dates[col] })
  const strokeCells = (s: Stroke): Day[] => {
    const { rowFrom, rowTo, colFrom, colTo } = strokeRange(s)
    const cells: Day[] = []
    for (let row = rowFrom; row <= rowTo && row < listed.length; row++) for (let col = colFrom; col <= colTo; col++) cells.push(dayAt(row, col))
    return cells
  }

  // ---- what a stroke, or the brush over a day, would do ------------------------------------------------
  const { ghost, info } = useMemo((): { ghost: Map<string, Map<ISODate, Interval[]>>; info: StrokeInfo | null } => {
    if (!active) return { ghost: NO_GHOST, info: null }
    if (stroke?.mode === 'erase') {
      const blocks = strokeCells(stroke).flatMap((cell) => lines.find((line) => line.person.id === cell.personId)?.assignments?.get(cell.date) ?? [])
      return { ghost: NO_GHOST, info: { mode: 'erase', half: false, days: new Set(blocks.map((a) => `${a.personId}|${a.date}`)).size, hours: blocks.reduce((sum, a) => sum + paidHours(a, ws.settings.workday), 0), people: new Set(blocks.map((a) => a.personId)).size, skipped: 0 } }
    }
    if (activeTool !== 'paint' || !activeBrush) return { ghost: NO_GHOST, info: null }
    const cells = stroke ? strokeCells(stroke) : hover && hover.row < listed.length ? [dayAt(hover.row, hover.col)] : []
    if (!cells.length) return { ghost: NO_GHOST, info: null }
    const half = stroke ? stroke.half : shift
    const found = new Map<string, Map<ISODate, Interval[]>>()
    const stats: StrokeInfo = { mode: 'paint', half, days: 0, hours: 0, people: 0, skipped: 0 }
    for (const cell of cells) {
      const gaps = paintGaps(ws, cell, activeBrush, half ? 'half' : 'full')
      if (!gaps.length) {
        if (dayType(cell.date) === 'arbeidsdag') stats.skipped += 1
        continue
      }
      if (!found.has(cell.personId)) found.set(cell.personId, new Map())
      found.get(cell.personId)!.set(cell.date, gaps)
      stats.days += 1
      stats.hours += gaps.reduce((sum, gap) => sum + paidHours(gap, ws.settings.workday), 0)
    }
    stats.people = found.size
    return { ghost: found, info: stroke ? stats : null }
    // `strokeCells` and `dayAt` read `listed` and `dates`.
  }, [active, ws, lines, listed, dates, activeTool, activeBrush, stroke, hover, shift]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The hours the stroke would add for the brush, by date: shown in the demand before the button is let go. */
  const preview = useMemo(() => {
    if (!ghost.size) return NO_PREVIEW
    const added = new Map<ISODate, number>()
    for (const days of ghost.values()) for (const [date, gaps] of days) added.set(date, (added.get(date) ?? 0) + gaps.reduce((sum, gap) => sum + paidHours(gap, ws.settings.workday), 0))
    return added
  }, [ghost, ws.settings.workday])

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
  const finishStroke = (s: Stroke) => {
    cancelStroke()
    const cells = strokeCells(s)
    if (s.mode === 'erase') clear(cells)
    else if (activeBrush) paint(cells, activeBrush, s.half)
  }

  const toggleUnfolded = (personId: string) => setUnfolded((current) => (current === personId ? null : personId))
  /** Moves the open hours to the person before or after in the list. */
  const stepUnfolded = (delta: number) => {
    const at = lines.findIndex((line) => line.person.id === unfolded)
    const next = lines[Math.min(Math.max(at + delta, 0), lines.length - 1)]
    if (next) setUnfolded(next.person.id)
  }

  const pickBrush = (competence: string) => {
    setBrush(competence)
    setTool('paint')
    setSelected(null)
  }
  const clearBrush = () => {
    setBrush(null)
    setTool('select')
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
    cellDown: (personId: string, date: ISODate, event: React.MouseEvent) => {
      if (event.button !== 0) return
      const at = cellAt(event.clientX, event.clientY)
      const mode = event.altKey || activeTool === 'erase' ? 'erase' : activeTool === 'paint' ? 'paint' : null
      if (!mode || !at) {
        // With «Velg», a click on the selected day lets go of it.
        const same = selected?.personId === personId && selected.date === date
        setSelected(same ? null : { personId, date })
        if (!same) onFocusDate(date)
        return
      }
      event.preventDefault()
      setSelected(null)
      pointer.current = { x: event.clientX, y: event.clientY }
      setStroke({ mode, half: mode === 'paint' && event.shiftKey, row0: at.row, col0: at.col, row1: at.row, col1: at.col })
      followStroke()
    },
    cellMenu: (personId: string, date: ISODate, event: React.MouseEvent) => {
      event.preventDefault()
      cancelStroke()
      setSelected({ personId, date })
      setMenu({ cell: { personId, date }, x: event.clientX, y: event.clientY })
    },
    unfold: toggleUnfolded,
    /** The pointer moved over the people: the day under it is where the brush would paint. */
    bodyMove: (event: React.MouseEvent) => {
      if (stroke || activeTool !== 'paint') return
      const at = cellAt(event.clientX, event.clientY)
      setHover((h) => (at && h && h.row === at.row && h.col === at.col ? h : at))
    },
    bodyLeave: () => setHover(null),
  })

  // A stroke follows the pointer wherever it goes, and ends where the button is let go.
  const strokeEnv = useStableActions({
    move: (x: number, y: number) => {
      const at = cellAt(x, y)
      const s = strokeRef.current
      if (at && s && (s.row1 !== at.row || s.col1 !== at.col)) setStroke({ ...s, row1: at.row, col1: at.col })
    },
    finish: () => strokeRef.current && finishStroke(strokeRef.current),
  })
  /** Listens for the pointer from the moment the button goes down, until it is let go or the stroke is called off. */
  const followStroke = () => {
    endStroke.current?.()
    const onMove = (e: MouseEvent) => {
      pointer.current = { x: e.clientX, y: e.clientY }
      strokeEnv.move(e.clientX, e.clientY)
    }
    const onUp = () => strokeEnv.finish()
    // Near the edges of the days the grid scrolls on under a still pointer.
    const timer = setInterval(() => {
      const el = scrollRef.current
      const at = pointer.current
      if (!el || !at) return
      const box = el.getBoundingClientRect()
      const dx = at.x > box.right - SCROLL_NEAR_RIGHT ? 1 : at.x < box.left + LEFT_W + SCROLL_NEAR_LEFT ? -1 : 0
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
      if (isTyping(e.target) || e.metaKey || e.ctrlKey) return
      const key = e.key.toLowerCase()
      if (key === 'escape') {
        // A menu or a popover that is open takes the key first, and closes itself.
        if (menu || demandPop || absenceFor) return
        if (stroke) cancelStroke()
        else if (selected) setSelected(null)
        else if (activeBrush || tool !== 'select') clearBrush()
        else setUnfolded(null)
      } else if (TOOL_KEYS[key] && !e.altKey) pickTool(TOOL_KEYS[key])
      else if (/^[1-9]$/.test(key) && staffed[Number(key) - 1]) pickBrush(staffed[Number(key) - 1].key)
      else if (key === 'e' && !e.altKey) {
        const personId = selected?.personId ?? unfolded
        if (personId) toggleUnfolded(personId)
      } else if ((key === 'arrowup' || key === 'arrowdown') && unfolded) {
        e.preventDefault()
        stepUnfolded(key === 'arrowup' ? -1 : 1)
      } else if ((key === 'delete' || key === 'backspace') && selected) {
        e.preventDefault()
        clear([selected])
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
    lines, listed, listedAble, able, divided, week, isOk, isOpen, ghost, info, stroke, hover, selected, setSelected,
    unfolded, setUnfolded, toggleUnfolded, stepUnfolded,
    unresolved: open.length, removeOpen, paint, clear,
    menu, setMenu, demandPop, setDemandPop, absenceFor, setAbsenceFor,
    projectsOpen, setProjectsOpen, projectDensity, setProjectDensity, demandOpen, setDemandOpen, demandDensity, setDemandDensity, idleOpen, setIdleOpen,
    toasts, toast: toast as (text: string, action?: Toast['action']) => void, dismissToast, undo, updateStaffing,
    actions, nameOf, labelOf, dayName,
    nextDay: (date: ISODate) => addDays(date, 1),
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
