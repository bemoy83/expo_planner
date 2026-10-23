import { useMemo } from 'react'
import type { ISODate } from '../../domain/dates'
import { dayType } from '../../domain/holidays'
import { buildBalance, type Balance } from '../../domain/staffing/balance'
import { clearDays, landingGaps, moveDay, onlyOffDays, paintDays, paintGaps, pasteTargets, type Clipboard, type DayCell as Day, type PaintSpan } from '../../domain/staffing/edit'
import { paidHours, paidTotal } from '../../domain/staffing/intervals'
import { buildProjectBalance, cellsToDemand, type ProjectBalance } from '../../domain/staffing/projectBalance'
import { workTag, type AllocationRow, type Assignment, type Work, type Workspace } from '../../domain/types'
import type { DayGrid } from './dayGrid'
import { hasHours, leftIn, placeDays, projectDays, remainingIn, restDays, type PlaceLine, type ProjectLine } from './lineBalances'
import { runDays, stretchRun, type BlocksOn, type Piece } from './runs'
import { strokeRange, type Stroke, type Tool } from './tools'
import type { PersonLine } from './usePeopleLines'

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
  /** The project of the run, and its place, which the days it goes on over get too. */
  projectNo?: string
  hall?: string
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

/** R46: the assignments as a pulled end of a run leaves them: its days painted as the brush would, or the run's blocks on them removed and the one it stops in cut. */
export const stretched = (w: Workspace, plan: StretchPlan): Assignment[] =>
  plan.erase
    ? (w.assignments ?? []).filter((a) => !plan.blockIds.includes(a.id)).map((a) => (plan.trim && a.id === plan.trim.blockId ? { ...a, start: plan.trim.start, end: plan.trim.end } : a))
    : paintDays(w, plan.cells, { competence: plan.competence, ...workTag(plan) }, 'full')

interface Options {
  active: boolean
  ws: Workspace
  dates: ISODate[]
  /** The stroke under way. */
  stroke: Stroke | null
  grid: DayGrid
  listed: PersonLine[]
  activeTool: Tool
  brush: string | null
  brushWork: Work | null
  /** The project and the places whose lines are shown under the competence in focus. */
  activeProject: string | null
  projectLines: ProjectLine[]
  placeLines: PlaceLine[]
  balance: Balance
  projectBalance: ProjectBalance
  planned: AllocationRow[]
  viewDates: ISODate[]
  remainingOf: Map<string, number>
  /** The day under the pointer, where the brush or a paste would put time; Shift held, for half days; and what was copied. */
  hover: { row: number; col: number } | null
  shift: boolean
  clip: Clipboard | null
}

/**
 * What the stroke under way would do, worked out as it will be when the button is let go, by the same rules: the days the brush fills,
 * what a pulled end of a run does, the time it would give each day as a preview and the count of it, and the demand as it would be
 * after it, so a stroke can be stopped where the demand is met.
 */
export function useStrokePreview({ active, ws, dates, stroke, grid, listed, activeTool, brush, brushWork, activeProject, projectLines, placeLines, balance, projectBalance, planned, viewDates, remainingOf, hover, shift, clip }: Options) {
  const wd = ws.settings.workday
  const { dayAt, strokeCells, blocksOn, colsOf, pasteOnto } = grid

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
    return s.toDemand && brushWork ? cellsToDemand(ws, drawn, brushWork, balance, s.col1 < s.col0, projectBalance) : drawn
  }
  /** The days the brush stroke under way fills, worked out once for its preview, its outline and the count of the demand. */
  const painted = useMemo(
    () => (stroke?.mode === 'paint' ? paintCells(stroke) : null),
    // `paintCells` reads the grid, `dates`, the brush and the balance.
    [stroke, ws, grid, dates, brushWork, balance, projectBalance], // eslint-disable-line react-hooks/exhaustive-deps
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
    const cells = !erase && stroke.toDemand ? cellsToDemand(ws, drawn, { competence: block.competence, ...workTag(block) }, balance, stroke.stretch.edge === 'start', projectBalance) : drawn
    const changed = erase ? [...plan.remove.map((day) => day.date), ...(plan.trim ? [plan.trim.block.date] : [])] : cells.map((cell) => cell.date)
    if (!changed.length) return null
    return {
      row: stroke.row0,
      ...colsOf(changed),
      competence: block.competence,
      ...workTag(block),
      erase,
      cells,
      blockIds: plan.remove.map((day) => day.block.id),
      trim: plan.trim && { blockId: plan.trim.block.id, date: plan.trim.block.date, start: plan.trim.start, end: plan.trim.end },
      own: plan.add.find((day) => day.own)?.date,
    }
    // `colsOf` reads `dates`.
  }, [stroke, listed, dates, ws, wd, balance, projectBalance]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The days a brush stroke that stops where the demand is met reaches, `null` where it lacks nothing; `undefined` for any other stroke. */
  const paintReach = !painted || !stroke?.toDemand ? undefined : painted.length ? colsOf(painted.map((cell) => cell.date)) : null

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
    const brushed = (cells: Day[], competence: string, span: PaintSpan, own?: ISODate, tag: { projectNo?: string; hall?: string } = {}) => {
      const count = { days: 0, hours: 0, skipped: 0 }
      const offDays = onlyOffDays(cells)
      for (const cell of cells) {
        const gaps = paintGaps(ws, cell, competence, span, offDays)
        if (gaps.length) {
          put(cell, gaps.map((gap) => ({ ...gap, competence, ...workTag(tag) })))
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
      const count = brushed(stretch.cells, stretch.competence, 'full', stretch.own, stretch)
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
    if (activeTool !== 'paint' || !brush) return none
    const cells = stroke ? (painted ?? []) : hover && hover.row < listed.length ? [dayAt(hover.row, hover.col)] : []
    if (!cells.length) return none
    const half = stroke ? stroke.half : shift
    const count = brushed(cells, brush, half ? 'half' : 'full', undefined, brushWork ?? undefined)
    return { ghost: found, info: stroke ? { mode: 'paint', half, people: found.size, toDemand: stroke.toDemand, ...count } : null, refused: null }
    // The grid's helpers read the lines and `dates`.
  }, [active, ws, grid, listed, dates, activeTool, brush, brushWork, stroke, stretch, painted, hover, shift, clip]) // eslint-disable-line react-hooks/exhaustive-deps

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
    if (stroke.mode === 'paint') return brushWork && painted ? { assignments: paintDays(ws, painted, brushWork, stroke.half ? 'half' : 'full'), dates: between } : null
    const from = dayAt(stroke.row0, stroke.col0)
    const to = dayAt(stroke.row1, stroke.col1)
    const moved = moveDay(ws, { from, to, blockIds: blocksOn(from).map((a) => a.id) })
    return typeof moved === 'string' ? null : { assignments: moved, dates: [from.date, to.date] }
    // The grid's helpers read the lines and `dates`.
  }, [active, ws, grid, dates, brushWork, stroke, stretch, painted]) // eslint-disable-line react-hooks/exhaustive-deps
  /** The balance the demand shows: as it is, and on the days of a stroke under way as the stroke would leave it. */
  const shownBalance = useMemo<Balance>(() => {
    if (!afterStroke || afterStroke.assignments === (ws.assignments ?? [])) return balance
    const days = new Set(afterStroke.dates)
    const after = buildBalance({ ...ws, allocations: planned, assignments: afterStroke.assignments }, afterStroke.dates)
    return { get: (competence, date) => (days.has(date) ? after.get(competence, date) : balance.get(competence, date)), competences: [...new Set([...balance.competences, ...after.competences])] }
  }, [afterStroke, balance, ws, planned])
  /** Per competence: the hours that remain in the days in view, as the demand shows them. */
  const shownRemaining = useMemo(() => (shownBalance === balance ? remainingOf : remainingIn(shownBalance, viewDates)), [shownBalance, balance, remainingOf, viewDates])
  /** The balance per project as the lines of the projects show it: on the days of a stroke under way as the stroke would leave it. */
  const shownProjects = useMemo<ProjectBalance>(() => {
    if (!brush || !afterStroke || afterStroke.assignments === (ws.assignments ?? [])) return projectBalance
    const days = new Set(afterStroke.dates)
    const after = buildProjectBalance({ ...ws, assignments: afterStroke.assignments }, afterStroke.dates)
    const pick = (date: ISODate) => (days.has(date) ? after : projectBalance)
    return { get: (competence, date) => pick(date).get(competence, date), of: (competence, date, projectNo) => pick(date).of(competence, date, projectNo), competences: projectBalance.competences }
  }, [brush, afterStroke, projectBalance, ws])
  /** Per project line: its days as a line of the demand shows them, and the hours it lacks in the days in view. */
  const projectShown = useMemo(
    () =>
      new Map(
        projectLines.map((line) => {
          const days = projectDays(shownProjects, line.projectNo)
          return [line.projectNo, { balance: days, remaining: brush ? leftIn(days, brush, viewDates) : 0 }] as const
        }),
      ),
    [projectLines, shownProjects, brush, viewDates],
  )
  /** Per place line: its days as a line of the demand shows them, and the hours it lacks in the days in view. */
  const placeShown = useMemo(
    () =>
      new Map(
        placeLines.map((line) => {
          const days = placeDays(shownProjects, activeProject ?? '', line.hall)
          return [line.hall, { balance: days, remaining: brush ? leftIn(days, brush, viewDates) : 0 }] as const
        }),
      ),
    [placeLines, shownProjects, activeProject, brush, viewDates],
  )

  /** What of the competence in focus is on none of its project lines, as a line under them where there is some in the days in view. */
  const restShown = useMemo(() => {
    if (!brush || !projectLines.length) return null
    const days = restDays(shownBalance, [...projectShown.values()].map((shown) => shown.balance))
    return hasHours(days, brush, viewDates) ? { balance: days, remaining: leftIn(days, brush, viewDates) } : null
  }, [brush, projectLines, shownBalance, projectShown, viewDates])

  return { paintCells, stretch, paintReach, ghost, info, refused, shownBalance, shownRemaining, projectShown, placeShown, restShown }
}
