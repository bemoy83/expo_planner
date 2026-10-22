import { staffedCompetences } from './competences'
import { addDays, daysBetween, weekdayIndex, type ISODate } from './dates'
import { hireHours, isWaiting } from './hire'
import { dayType, type DayType } from './holidays'
import { PROJECT_HALLS } from './locations'
import { numberKey } from './projects'
import { spread } from './spread'
import { competenceKey, sameProject, sameTag, workOf, workTag, type Assignment, type CapacityLine, type CompetenceKey, type DayValues, type DemandAdjustment, type Interval, type Minute, type Person, type Unavailability, type Work, type WorkdaySettings, type Workspace } from './types'

/**
 * The rules of Bemanning: who can work when, what an assignment counts for, and how far the assigned
 * hours cover the demand the Kalender has planned. See design_docs/bemanning/RULES.md (R1–R15).
 * Everything here returns new lists; the same list comes back when nothing changed.
 */

const MIN_SPLIT_PART: Minute = 30
/** How near the start or end of the normal day a dragged edge has to be to land on it. */
const DAY_EDGE_PULL: Minute = 10
const CLICK_OVERTIME_BLOCK: Minute = 60
/** Hours of demand nearer zero than this are met. */
const MET = 0.01

const length = (iv: Interval): Minute => iv.end - iv.start

const overlap = (a: Interval, b: Interval): Minute => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))

const intersect = (a: Interval, b: Interval): Interval | null => {
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  return end > start ? { start, end } : null
}

/** The intervals with the given stretches cut out, sorted. */
export const subtract = (intervals: Interval[], cuts: Interval[]): Interval[] => {
  let left = intervals
  for (const cut of cuts) {
    left = left.flatMap((iv) => {
      if (cut.end <= iv.start || cut.start >= iv.end) return [iv]
      return [
        ...(cut.start > iv.start ? [{ start: iv.start, end: cut.start }] : []),
        ...(cut.end < iv.end ? [{ start: cut.end, end: iv.end }] : []),
      ]
    })
  }
  return [...left].sort((a, b) => a.start - b.start)
}

const normalDay = (wd: WorkdaySettings): Interval => ({ start: wd.dayStart, end: wd.dayEnd })

/** R1: the hours of an interval that are paid, which is all of it but the lunch break. */
export const paidHours = (iv: Interval, wd: WorkdaySettings): number => (length(iv) - overlap(iv, { start: wd.breakStart, end: wd.breakEnd })) / 60

/** The paid hours of several stretches of time together. */
export const paidTotal = (intervals: Interval[], wd: WorkdaySettings): number => intervals.reduce((sum, iv) => sum + paidHours(iv, wd), 0)

/** R2: the paid hours outside the normal day; on a weekend or a holiday that is all of them. */
export const overtimeHours = (iv: Interval, dayKind: DayType, wd: WorkdaySettings): number => {
  if (dayKind !== 'arbeidsdag') return paidHours(iv, wd)
  const normal = intersect(iv, normalDay(wd))
  return paidHours(iv, wd) - (normal ? paidHours(normal, wd) : 0)
}

const isWholeDay = (u: Unavailability): boolean => u.start === undefined || u.end === undefined

const absenceOf = (unavailability: Unavailability[], personId: string, date: ISODate): Unavailability[] =>
  unavailability.filter((u) => u.personId === personId && u.date === date)

/** R3: the person's normal time that day: the normal day on a workday, less any absence. */
export const normalWindows = (personId: string, date: ISODate, unavailability: Unavailability[], wd: WorkdaySettings): Interval[] =>
  dayType(date) === 'arbeidsdag' ? dayWindows(personId, date, unavailability, wd) : []

/** The hours of the normal day the person is not away for, on any day: where the brush fills a weekend or a holiday that is picked by itself. */
const dayWindows = (personId: string, date: ISODate, unavailability: Unavailability[], wd: WorkdaySettings): Interval[] => {
  const absence = absenceOf(unavailability, personId, date)
  if (absence.some(isWholeDay)) return []
  return subtract([normalDay(wd)], absence.map((u) => ({ start: u.start!, end: u.end! })))
}

/**
 * The normal time the permanent staff are away, as FTE per day, for the Kalender's «Tilgjengelig»: a whole
 * day away is 1, a part of the day is its share of the normal day. Workdays only; days without absence are left out.
 */
export const absenceFte = ({ persons, unavailability, settings }: Pick<Workspace, 'persons' | 'unavailability' | 'settings'>): DayValues => {
  const wd = settings.workday
  const full = paidHours(normalDay(wd), wd)
  const staff = new Set((persons ?? []).map((person) => person.id))
  const days: DayValues = {}
  const seen = new Set<string>()
  for (const u of unavailability ?? []) {
    const key = `${u.personId}|${u.date}`
    if (!staff.has(u.personId) || seen.has(key) || dayType(u.date) !== 'arbeidsdag' || !(full > 0)) continue
    seen.add(key)
    const left = paidTotal(normalWindows(u.personId, u.date, unavailability ?? [], wd), wd)
    const away = Math.round(((full - left) / full) * 100) / 100
    if (away > 0) days[u.date] = Math.round(((days[u.date] ?? 0) + away) * 100) / 100
  }
  return days
}

/** The absence entered in Bemanning as a staffing line of the Kalender. It is worked out, never stored, and cannot be typed in. */
export const ABSENCE_LINE_ID = 'absence:bemanning'
export const absenceLine = (ws: Pick<Workspace, 'persons' | 'unavailability' | 'settings'>): CapacityLine => ({
  id: ABSENCE_LINE_ID,
  label: 'Fravær faste',
  group: 'unavailable',
  values: absenceFte(ws),
})

/** R4: where blocks may be placed by hand. Overtime is open on any day the person is not away for a part or all of. */
export const editableWindows = (personId: string, date: ISODate, unavailability: Unavailability[], wd: WorkdaySettings): Interval[] => {
  const absence = absenceOf(unavailability, personId, date)
  if (absence.some(isWholeDay)) return []
  if (absence.length) return normalWindows(personId, date, unavailability, wd)
  return [{ start: wd.overtimeEarliest, end: wd.overtimeLatest }]
}

/** R5: the windows less the assignments in them. Gaps shorter than `snap` are left out. */
export const freeIntervals = (windows: Interval[], assignments: Interval[], snap: Minute): Interval[] =>
  subtract(windows, assignments).filter((iv) => length(iv) >= snap)

export const freeHours = (windows: Interval[], assignments: Interval[], wd: WorkdaySettings): number =>
  paidTotal(freeIntervals(windows, assignments, wd.snap), wd)

const dayKey = (personId: string, date: ISODate) => `${personId}|${date}`
const keyOf = (a: { personId: string; date: ISODate }) => dayKey(a.personId, a.date)

/**
 * R9: joins a block to the one before it when they touch and are the same work, of one competence for one project in one place; the earlier block's id is kept.
 * With `only`, just those person-days are looked at.
 */
export const mergeAdjacent = (assignments: Assignment[], only?: Set<string>): Assignment[] => {
  const byDay = new Map<string, Assignment[]>()
  for (const a of assignments) {
    if (only && !only.has(keyOf(a))) continue
    byDay.set(keyOf(a), [...(byDay.get(keyOf(a)) ?? []), a])
  }
  const replaced = new Map<string, Assignment | null>()
  for (const blocks of byDay.values()) {
    blocks.sort((a, b) => a.start - b.start)
    let last = blocks[0]
    for (const block of blocks.slice(1)) {
      if (block.start === last.end && block.competence === last.competence && sameTag(block, last)) {
        last = { ...last, end: block.end }
        replaced.set(last.id, last)
        replaced.set(block.id, null)
      } else last = block
    }
  }
  if (!replaced.size) return assignments
  return assignments.flatMap((a) => (replaced.has(a.id) ? (replaced.get(a.id) ?? []) : a))
}

const newId = () => `asg-${crypto.randomUUID()}`

const blocksOf = (assignments: Assignment[], personId: string, date: ISODate): Assignment[] =>
  assignments.filter((a) => a.personId === personId && a.date === date).sort((a, b) => a.start - b.start)

/** R15: only a person who has the competence can be given work of it. */
export const isEligible = (person: Person | undefined, competence: CompetenceKey): boolean => !!person && person.competences.includes(competence)

export interface DayCell {
  personId: string
  date: ISODate
  /** Where only a part of the day is meant: the brush fills free time within it alone, as where an end of a run is pulled to a time of the day. */
  within?: Interval
}

export type PaintBlock = 'ineligible' | 'unavailable'

/**
 * Whether the days are weekends and holidays alone. The brush skips such a day when it is drawn across
 * with working days, and fills it as a working day, from the start to the end of the normal day, when
 * it is picked by itself.
 */
export const onlyOffDays = (cells: DayCell[]): boolean => cells.length > 0 && cells.every((cell) => dayType(cell.date) !== 'arbeidsdag')

/** The time the brush has to fill for a person on a day; with `offDays`, on a weekend or a holiday too. Of a part of a day, that part alone. */
const paintWindows = (ws: Workspace, cell: DayCell, offDays: boolean): Interval[] => {
  const windows = (offDays ? dayWindows : normalWindows)(cell.personId, cell.date, ws.unavailability ?? [], ws.settings.workday)
  return cell.within ? windows.flatMap((iv) => intersect(iv, cell.within!) ?? []) : windows
}

/** Why the brush cannot fill a day for a person, or `null` when it can. */
export const paintBlock = (ws: Workspace, cell: DayCell, competence: CompetenceKey, offDays = false): PaintBlock | null => {
  const person = ws.persons?.find((p) => p.id === cell.personId)
  if (!isEligible(person, competence)) return 'ineligible'
  return paintWindows(ws, cell, offDays).length ? null : 'unavailable'
}

/** A paint fills a whole day, or the first half of it that is free. */
export type PaintSpan = 'full' | 'half'

/**
 * R6: the time a paint would give a person on a day: the free part of their normal day, or of its first
 * free half. Nothing for a person without the competence or a day without normal time. A weekend or a
 * holiday has that time with `offDays` alone, see `onlyOffDays`; all of it is overtime.
 */
export const paintGaps = (ws: Workspace, cell: DayCell, competence: CompetenceKey, span: PaintSpan, offDays = false, assignments: Assignment[] = ws.assignments ?? []): Interval[] => {
  if (paintBlock(ws, cell, competence, offDays)) return []
  const wd = ws.settings.workday
  const normal = paintWindows(ws, cell, offDays)
  const taken = blocksOf(assignments, cell.personId, cell.date)
  // A gap that is all lunch gives no hours, so it is not work to hand out.
  const free = (target: Interval[]) => freeIntervals(target, taken, wd.snap).filter((iv) => paidHours(iv, wd) > 0)
  if (span === 'full') return free(normal)
  const halves = [{ start: wd.dayStart, end: wd.breakStart }, { start: wd.breakEnd, end: wd.dayEnd }].map((half) => normal.flatMap((iv) => intersect(iv, half) ?? []))
  return halves.map(free).find((found) => found.length) ?? []
}

/**
 * R6: gives each cell's person work of the competence in the time `paintGaps` finds, for the project where one is given.
 * Cells that have none are skipped, as weekends and holidays are among working days.
 */
export const paintDays = (ws: Workspace, cells: DayCell[], work: CompetenceKey | Work, span: PaintSpan, makeId: () => string = newId): Assignment[] => {
  const tagged = workOf(work)
  const competence = tagged.competence
  const before = ws.assignments ?? []
  let assignments = before
  const touched = new Set<string>()
  const offDays = onlyOffDays(cells)
  for (const cell of cells) {
    const gaps = paintGaps(ws, cell, competence, span, offDays, assignments)
    if (!gaps.length) continue
    assignments = [...assignments, ...gaps.map((gap): Assignment => ({ id: makeId(), personId: cell.personId, date: cell.date, competence, ...workTag(tagged), start: gap.start, end: gap.end, source: 'manual' }))]
    touched.add(keyOf(cell))
  }
  return touched.size ? mergeAdjacent(assignments, touched) : before
}

/** The eraser: removes every assignment in the cells. */
export const clearDays = (assignments: Assignment[], cells: DayCell[]): Assignment[] => {
  const days = new Set(cells.map(keyOf))
  const kept = assignments.filter((a) => !days.has(keyOf(a)))
  return kept.length === assignments.length ? assignments : kept
}

export type AssignmentStatus = 'ok' | 'unresolved'

/** R7: an assignment is unresolved when its person is away then, or no longer has the competence. */
export const assignmentStatus = (a: Assignment, ws: Workspace): AssignmentStatus =>
  workedParts(a, ws.persons?.find((p) => p.id === a.personId), absenceOf(ws.unavailability ?? [], a.personId, a.date)).length ? 'ok' : 'unresolved'

/**
 * R7: the time of a block that counts. None of it for a person without the competence or away the whole
 * day. Absence for a part of the day takes the time it covers and leaves the rest of the block.
 */
export const workedParts = (a: Assignment, person: Person | undefined, absence: Unavailability[]): Interval[] => {
  if (!isEligible(person, a.competence) || absence.some(isWholeDay)) return []
  return subtract([{ start: a.start, end: a.end }], absence.map((u) => ({ start: u.start!, end: u.end! })))
}

/**
 * The assignments that count, each cut to the time that does: the hours of an unresolved one, and of the
 * part of a block the person is away for, are back in the demand. A block that counts whole is itself.
 */
export const okAssignments = (ws: Workspace): Assignment[] => {
  const persons = new Map((ws.persons ?? []).map((p) => [p.id, p]))
  const absence = new Map<string, Unavailability[]>()
  for (const u of ws.unavailability ?? []) absence.set(keyOf(u), [...(absence.get(keyOf(u)) ?? []), u])
  return (ws.assignments ?? []).flatMap((a) => {
    const parts = workedParts(a, persons.get(a.personId), absence.get(keyOf(a)) ?? NO_ABSENCE)
    return parts.length === 1 && parts[0].start === a.start && parts[0].end === a.end ? [a] : parts.map((part) => ({ ...a, start: part.start, end: part.end }))
  })
}
const NO_ABSENCE: Unavailability[] = []

/**
 * The overtime drawn in Bemanning, as hours per day and the number of people who work it, for the Kalender's
 * «Tilgjengelig». Only assignments that count are included; on a weekend or a holiday all paid hours are overtime.
 */
export const overtimeByDay = (ws: Workspace): Map<ISODate, { hours: number; people: number }> => {
  const wd = ws.settings.workday
  const perPerson = new Map<ISODate, Map<string, number>>()
  for (const a of okAssignments(ws)) {
    const hours = overtimeHours(a, dayType(a.date), wd)
    if (!(hours > 0)) continue
    const day = perPerson.get(a.date) ?? new Map<string, number>()
    day.set(a.personId, (day.get(a.personId) ?? 0) + hours)
    perPerson.set(a.date, day)
  }
  return new Map([...perPerson].map(([date, day]) => [date, { hours: [...day.values()].reduce((sum, h) => sum + h, 0), people: day.size }]))
}

/** The overtime from Bemanning as a staffing line of the Kalender: people and hours per person. Worked out, never stored. */
export const OVERTIME_LINE_ID = 'overtime:bemanning'
export const overtimeLine = (ws: Workspace): CapacityLine => {
  const values: DayValues = {}
  const hours: DayValues = {}
  for (const [date, day] of overtimeByDay(ws)) {
    values[date] = day.people
    hours[date] = day.hours / day.people
  }
  return { id: OVERTIME_LINE_ID, label: 'Overtid faste', group: 'overtime', values, hours }
}

/** The assignments nothing of which counts. */
export const unresolvedAssignments = (ws: Workspace): Assignment[] => {
  const ok = new Set(okAssignments(ws).map((a) => a.id))
  return (ws.assignments ?? []).filter((a) => !ok.has(a.id))
}

export interface EditOptions {
  /** Limits where a block can go, as the row timeline does to the normal day. Without it, the whole editable day is open. */
  bounds?: Interval
  /** Lets an edge near the start or end of the normal day land on it, as in the week editor. */
  pullToDay?: boolean
}

const snapped = (t: Minute, wd: WorkdaySettings, opts: EditOptions): Minute => {
  if (opts.pullToDay) for (const edge of [wd.dayStart, wd.dayEnd]) if (Math.abs(t - edge) <= DAY_EDGE_PULL) return edge
  return Math.round(t / wd.snap) * wd.snap
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max)

/** The stretches of a person's day open to blocks: the editable windows, within the bounds. */
const openWindows = (ws: Workspace, personId: string, date: ISODate, opts: EditOptions): Interval[] => {
  const windows = editableWindows(personId, date, ws.unavailability ?? [], ws.settings.workday)
  return opts.bounds ? windows.flatMap((iv) => intersect(iv, opts.bounds!) ?? []) : windows
}

/** The stretch a block may move and grow in: its window, up to the blocks on either side. */
const roomFor = (ws: Workspace, block: Assignment, opts: EditOptions): Interval | null => {
  const window = openWindows(ws, block.personId, block.date, opts).find((iv) => iv.start <= block.start && block.end <= iv.end)
  if (!window) return null
  const others = blocksOf(ws.assignments ?? [], block.personId, block.date).filter((a) => a.id !== block.id)
  return {
    start: Math.max(window.start, ...others.filter((a) => a.end <= block.start).map((a) => a.end)),
    end: Math.min(window.end, ...others.filter((a) => a.start >= block.end).map((a) => a.start)),
  }
}

const withBlock = (ws: Workspace, block: Assignment, changed: Assignment, merge = true): Assignment[] => {
  const all = ws.assignments ?? []
  if (changed.start === block.start && changed.end === block.end && changed.competence === block.competence && sameTag(changed, block)) return all
  const next = all.map((a) => (a.id === block.id ? changed : a))
  return merge ? mergeAdjacent(next, new Set([keyOf(block)])) : next
}

const blockById = (ws: Workspace, id: string) => (ws.assignments ?? []).find((a) => a.id === id)

/** R8: moves a block to start at `start`, keeping its length, as far as its neighbours and its window allow. */
export const moveBlock = (ws: Workspace, id: string, start: Minute, opts: EditOptions = {}): Assignment[] => {
  const block = blockById(ws, id)
  const room = block && roomFor(ws, block, opts)
  if (!block || !room) return ws.assignments ?? []
  const to = clamp(snapped(start, ws.settings.workday, opts), room.start, room.end - length(block))
  return withBlock(ws, block, { ...block, start: to, end: to + length(block) })
}

/** Why a block cannot be moved to another day or person (R19). */
export type MoveRefusal = 'overlap' | 'away' | 'ineligible'

/**
 * R19: a block as it would be on another day, or with another person, starting at `toStart`: the same
 * length and competence, on the grid, inside the hours overtime can be drawn in. Refused when the person
 * lacks the competence, is away then, or has other work then.
 */
export const moveTarget = (ws: Workspace, id: string, toDate: ISODate, toStart: Minute, toPerson?: string): Assignment | MoveRefusal | null => {
  const wd = ws.settings.workday
  const block = blockById(ws, id)
  if (!block) return null
  const personId = toPerson ?? block.personId
  if (!isEligible(ws.persons?.find((p) => p.id === personId), block.competence)) return 'ineligible'
  const start = clamp(Math.round(toStart / wd.snap) * wd.snap, wd.overtimeEarliest, wd.overtimeLatest - length(block))
  const moved: Assignment = { ...block, personId, date: toDate, start, end: start + length(block) }
  if (absenceOf(ws.unavailability ?? [], personId, toDate).some((u) => isWholeDay(u) || overlap(moved, { start: u.start!, end: u.end! }) > 0)) return 'away'
  if (blocksOf(ws.assignments ?? [], personId, toDate).some((a) => a.id !== id && overlap(a, moved) > 0)) return 'overlap'
  return moved
}

/** R19: moves a block to another day or person, see `moveTarget`. A move that is refused changes nothing. */
export const moveAssignment = (ws: Workspace, id: string, toDate: ISODate, toStart: Minute, toPerson?: string): Assignment[] => {
  const all = ws.assignments ?? []
  const moved = moveTarget(ws, id, toDate, toStart, toPerson)
  if (!moved || typeof moved === 'string') return all
  const block = blockById(ws, id)!
  if (moved.personId === block.personId && moved.date === block.date && moved.start === block.start) return all
  return mergeAdjacent(all.map((a) => (a.id === id ? moved : a)), new Set([keyOf(moved)]))
}

/** A block without its place: what is copied, and what a move carries to another day. */
export interface BlockShape {
  competence: CompetenceKey
  projectNo?: string
  hall?: string
  start: Minute
  end: Minute
}

/** Where a block's time is free on a person's day: inside the hours the person is there, clear of other work. */
export const landingGaps = (ws: Workspace, cell: DayCell, shape: Interval, assignments: Assignment[] = ws.assignments ?? []): Interval[] => {
  const wd = ws.settings.workday
  const open = editableWindows(cell.personId, cell.date, ws.unavailability ?? [], wd).flatMap((iv) => intersect(iv, shape) ?? [])
  return freeIntervals(open, blocksOf(assignments, cell.personId, cell.date), wd.snap)
}

const isAwayAllDay = (ws: Workspace, cell: DayCell): boolean => absenceOf(ws.unavailability ?? [], cell.personId, cell.date).some(isWholeDay)

export interface DayMove {
  from: DayCell
  to: DayCell
  /** The blocks of the day that are moved. */
  blockIds: string[]
  /** Leaves the blocks where they were. */
  copy?: boolean
}

/**
 * R38: moves a day's blocks to another day or person, at the same times. Only free time on the day they
 * come to is filled, and only what found room there leaves the day they came from. Refused when the
 * person they come to lacks a competence of theirs or is away that day, or when nothing found room.
 */
export const moveDay = (ws: Workspace, move: DayMove, makeId: () => string = newId): Assignment[] | MoveRefusal => {
  const all = ws.assignments ?? []
  const blocks = blocksOf(all, move.from.personId, move.from.date).filter((a) => move.blockIds.includes(a.id))
  if (!blocks.length || (move.from.personId === move.to.personId && move.from.date === move.to.date)) return all
  const person = ws.persons?.find((p) => p.id === move.to.personId)
  if (blocks.some((block) => !isEligible(person, block.competence))) return 'ineligible'
  if (isAwayAllDay(ws, move.to)) return 'away'
  let next = all
  let landed = false
  for (const block of blocks) {
    const gaps = landingGaps(ws, move.to, block, next)
    if (!gaps.length) continue
    landed = true
    // What found room leaves the day it came from; the rest of the block stays there.
    const left = move.copy ? [block] : subtract([block], gaps).map((iv, i): Assignment => ({ ...block, id: i === 0 ? block.id : makeId(), start: iv.start, end: iv.end }))
    next = [...next.filter((a) => a.id !== block.id), ...left, ...gaps.map((gap): Assignment => ({ ...block, id: makeId(), personId: move.to.personId, date: move.to.date, start: gap.start, end: gap.end }))]
  }
  if (!landed) return isAwayAt(ws, move.to, blocks) ? 'away' : 'overlap'
  return mergeAdjacent(next, new Set([keyOf(move.from), keyOf(move.to)]))
}

/** Whether the person is away for all the time of the blocks, on a day they are there for a part of. */
const isAwayAt = (ws: Workspace, cell: DayCell, blocks: Interval[]): boolean => {
  const open = editableWindows(cell.personId, cell.date, ws.unavailability ?? [], ws.settings.workday)
  return blocks.every((block) => open.every((iv) => overlap(iv, block) === 0))
}

/** What is copied: the blocks of some days of some people, each day counted from the first day copied and each person from the first one copied. */
export interface Clipboard {
  from: ISODate
  /** The people copied from, in the order of their lines. */
  people: string[]
  items: { personId: string; dayOffset: number; blocks: BlockShape[] }[]
}

/** R34: copies the blocks of the given days. Days without blocks are left out. */
export const copyDays = (ws: Workspace, cells: DayCell[]): Clipboard | null => {
  const from = cells.map((cell) => cell.date).sort()[0]
  const items = cells
    .map((cell) => ({ personId: cell.personId, dayOffset: daysBetween(from, cell.date), blocks: blocksOf(ws.assignments ?? [], cell.personId, cell.date).map((a) => ({ competence: a.competence, ...workTag(a), start: a.start, end: a.end })) }))
    .filter((item) => item.blocks.length > 0)
  return items.length ? { from, people: [...new Set(cells.map((cell) => cell.personId))], items } : null
}

/**
 * Where a paste would put each copied day: the day it lands on, and the time its blocks find free there. A day the person is away
 * has none. `onto` is the people it lands on, one for each of the people copied from, in their order; without it, the same people.
 * What was copied from a person who has none to land on is left out.
 */
export const pasteTargets = (ws: Workspace, clip: Clipboard, anchor: ISODate, lastDate: ISODate, onto: (string | undefined)[] = clip.people): { cell: DayCell; blocks: BlockShape[] }[] => {
  let assignments = ws.assignments ?? []
  return clip.items.flatMap((item) => {
    const personId = onto[clip.people.indexOf(item.personId)]
    if (!personId) return []
    const cell = { personId, date: addDays(anchor, item.dayOffset) }
    if (cell.date > lastDate) return []
    const person = ws.persons?.find((p) => p.id === personId)
    const blocks = isAwayAllDay(ws, cell)
      ? []
      : item.blocks.flatMap((block) => {
          if (!isEligible(person, block.competence)) return []
          const gaps = landingGaps(ws, cell, block, assignments).map((gap) => ({ competence: block.competence, ...workTag(block), start: gap.start, end: gap.end }))
          // What is placed takes its time, so two copied blocks never land on each other.
          assignments = [...assignments, ...gaps.map((gap): Assignment => ({ ...gap, id: '', personId: cell.personId, date: cell.date, source: 'manual' }))]
          return gaps
        })
    return [{ cell, blocks }]
  })
}

/**
 * R34: pastes what was copied with the first copied day on `anchor`, for the people of `onto`, or the same
 * people without it. Only free time is filled, and only work the person has the competence for. Days past
 * the end of the period are left out, and days the person is away are skipped.
 */
export const pasteDays = (ws: Workspace, clip: Clipboard, anchor: ISODate, lastDate: ISODate, onto?: (string | undefined)[], makeId: () => string = newId): { assignments: Assignment[]; pasted: number; skipped: number } => {
  const all = ws.assignments ?? []
  const targets = pasteTargets(ws, clip, anchor, lastDate, onto)
  const added = targets.flatMap(({ cell, blocks }) => blocks.map((block): Assignment => ({ ...block, id: makeId(), personId: cell.personId, date: cell.date, source: 'manual' })))
  if (!added.length) return { assignments: all, pasted: 0, skipped: targets.length }
  return { assignments: mergeAdjacent([...all, ...added], new Set(targets.map(({ cell }) => keyOf(cell)))), pasted: added.length, skipped: targets.filter(({ blocks }) => !blocks.length).length }
}

/** R8: drags one edge of a block to `t`. The block keeps at least the length of `snap`. */
export const resizeBlock = (ws: Workspace, id: string, edge: 'start' | 'end', t: Minute, opts: EditOptions = {}): Assignment[] => {
  const wd = ws.settings.workday
  const block = blockById(ws, id)
  const room = block && roomFor(ws, block, opts)
  if (!block || !room) return ws.assignments ?? []
  const to = snapped(t, wd, opts)
  const changed = edge === 'start' ? { ...block, start: clamp(to, room.start, block.end - wd.snap) } : { ...block, end: clamp(to, block.start + wd.snap, room.end) }
  return withBlock(ws, block, changed)
}

/** R8: cuts a block in two at `t`, if both parts get at least half an hour. The parts are left apart until another edit joins them. */
export const splitBlock = (ws: Workspace, id: string, t: Minute, makeId: () => string = newId): Assignment[] => {
  const all = ws.assignments ?? []
  const block = blockById(ws, id)
  if (!block) return all
  const at = snapped(t, ws.settings.workday, {})
  if (at - block.start < MIN_SPLIT_PART || block.end - at < MIN_SPLIT_PART) return all
  return all.flatMap((a) => (a.id === id ? [{ ...a, end: at }, { ...a, id: makeId(), start: at }] : a))
}

/** R8: changes a block to another competence, if its person has it. */
export const recolourBlock = (ws: Workspace, id: string, competence: CompetenceKey): Assignment[] => {
  const block = blockById(ws, id)
  if (!block || !isEligible(ws.persons?.find((p) => p.id === block.personId), competence)) return ws.assignments ?? []
  return withBlock(ws, block, { ...block, competence })
}

export const deleteBlock = (assignments: Assignment[], id: string): Assignment[] => {
  const kept = assignments.filter((a) => a.id !== id)
  return kept.length === assignments.length ? assignments : kept
}

/** The free stretch around `t` in a person's day, or `null` when `t` is taken or closed. */
const gapAt = (ws: Workspace, personId: string, date: ISODate, t: Minute, opts: EditOptions): Interval | null =>
  subtract(openWindows(ws, personId, date, opts), blocksOf(ws.assignments ?? [], personId, date)).find((iv) => iv.start <= t && t < iv.end) ?? null

const addBlock = (ws: Workspace, cell: DayCell, work: Work, iv: Interval, makeId: () => string): Assignment[] => {
  const wd = ws.settings.workday
  const all = ws.assignments ?? []
  if (length(iv) < wd.snap || paidHours(iv, wd) <= 0) return all
  const block: Assignment = { id: makeId(), personId: cell.personId, date: cell.date, competence: work.competence, ...workTag(work), start: iv.start, end: iv.end, source: 'manual' }
  return mergeAdjacent([...all, block], new Set([keyOf(cell)]))
}

/** R8: draws a block over the dragged span, within the free stretch the drag started in. */
export const drawBlock = (ws: Workspace, cell: DayCell, work: CompetenceKey | Work, from: Minute, to: Minute, opts: EditOptions = {}, makeId: () => string = newId): Assignment[] => {
  const wd = ws.settings.workday
  const all = ws.assignments ?? []
  const gap = gapAt(ws, cell.personId, cell.date, from, opts)
  if (!gap || !isEligible(ws.persons?.find((p) => p.id === cell.personId), workOf(work).competence)) return all
  const start = clamp(snapped(Math.min(from, to), wd, opts), gap.start, gap.end)
  const end = clamp(snapped(Math.max(from, to), wd, opts), gap.start, gap.end)
  return addBlock(ws, cell, workOf(work), { start, end }, makeId)
}

/**
 * R8: a click with the brush on free time. Inside the person's normal time it fills what is free of it around the click;
 * in overtime it makes an hour's block from the full hour clicked.
 */
export const clickBlock = (ws: Workspace, cell: DayCell, work: CompetenceKey | Work, t: Minute, opts: EditOptions = {}, makeId: () => string = newId): Assignment[] => {
  const wd = ws.settings.workday
  const all = ws.assignments ?? []
  const gap = gapAt(ws, cell.personId, cell.date, t, opts)
  if (!gap || !isEligible(ws.persons?.find((p) => p.id === cell.personId), workOf(work).competence)) return all
  const normal = normalWindows(cell.personId, cell.date, ws.unavailability ?? [], wd).find((iv) => iv.start <= t && t < iv.end)
  const hour = Math.floor(t / 60) * 60
  const wanted = normal ?? { start: hour, end: hour + CLICK_OVERTIME_BLOCK }
  const iv = intersect(wanted, gap)
  return iv ? addBlock(ws, cell, workOf(work), iv, makeId) : all
}

/** What must hold for the stored assignments; returns a line per breach. Used by the tests after every kind of edit. */
export const invariantBreaches = (assignments: Assignment[], wd: WorkdaySettings): string[] => {
  const breaches: string[] = []
  const byDay = new Map<string, Assignment[]>()
  for (const a of assignments) {
    byDay.set(keyOf(a), [...(byDay.get(keyOf(a)) ?? []), a])
    if (a.start % wd.snap || a.end % wd.snap) breaches.push(`${a.id}: off the ${wd.snap} minute grid`)
    if (a.end - a.start < wd.snap) breaches.push(`${a.id}: shorter than ${wd.snap} minutes`)
    if (a.start < wd.overtimeEarliest || a.end > wd.overtimeLatest) breaches.push(`${a.id}: outside the day`)
  }
  for (const blocks of byDay.values()) {
    blocks.sort((a, b) => a.start - b.start)
    for (let i = 1; i < blocks.length; i++) if (blocks[i].start < blocks[i - 1].end) breaches.push(`${blocks[i].id}: overlaps ${blocks[i - 1].id}`)
  }
  return breaches
}

/** How far the assigned hours cover the demand for one competence on one day. */
export interface DayBalance {
  /** The hours the Kalender plans, plus the hours moved to the day. */
  demand: number
  /** The part of the demand that was moved here from another day. */
  carried: number
  assigned: number
  assignedOT: number
  /** Negative when more is assigned than is needed. */
  remaining: number
  covered: number
}

const NO_BALANCE: DayBalance = { demand: 0, carried: 0, assigned: 0, assignedOT: 0, remaining: 0, covered: 0 }

export interface Balance {
  get: (competence: CompetenceKey, date: ISODate) => DayBalance
  /** Every competence with demand or assigned hours on the dates. */
  competences: CompetenceKey[]
}

/** R10: demand, assigned hours and what remains, per competence and day, for the given dates. */
export const buildBalance = (ws: Workspace, dates: ISODate[]): Balance => {
  const wd = ws.settings.workday
  const wanted = new Set(dates)
  const cells = new Map<string, DayBalance>()
  const cell = (competence: CompetenceKey, date: ISODate) => {
    const key = `${competence}|${date}`
    if (!cells.has(key)) cells.set(key, { ...NO_BALANCE })
    return cells.get(key)!
  }
  for (const row of ws.allocations) {
    const competence = competenceKey(row.competence)
    if (!competence) continue
    // A row has FTE on a few days and the period has hundreds: the row's own days are gone through, not the period's.
    for (const date in row.fte) if (row.fte[date] && wanted.has(date)) cell(competence, date).demand += row.fte[date] * ws.settings.hoursPerDay
  }
  for (const adjustment of ws.demandAdjustments ?? []) {
    if (!wanted.has(adjustment.date)) continue
    const c = cell(adjustment.competence, adjustment.date)
    c.demand += adjustment.hours
    c.carried += adjustment.hours
  }
  for (const a of okAssignments(ws)) {
    if (!wanted.has(a.date)) continue
    const c = cell(a.competence, a.date)
    c.assigned += paidHours(a, wd)
    c.assignedOT += overtimeHours(a, dayType(a.date), wd)
  }
  for (const c of cells.values()) {
    c.remaining = c.demand - c.assigned
    c.covered = Math.min(c.demand, c.assigned)
  }
  return {
    get: (competence, date) => cells.get(`${competence}|${date}`) ?? NO_BALANCE,
    competences: [...new Set([...cells.keys()].map((key) => key.slice(0, key.lastIndexOf('|'))))].sort(),
  }
}

export const dayBalance = (ws: Workspace, competence: CompetenceKey, date: ISODate): DayBalance => buildBalance(ws, [date]).get(competence, date)

/** The recipient of the hours that are for no project: demand on Kalender rows without a number, and hours moved without a project. */
export const NO_PROJECT = ''

/** How a project is looked up in the balance: by its number, as Resultat finds it; `NO_PROJECT` where it has none. */
const projectKey = (projectNo: string | undefined): string => numberKey(projectNo ?? NO_PROJECT)

/** One project's part of a competence on a day. */
export interface ProjectDay {
  /** The number as the first row or block that has the project writes it; `NO_PROJECT` for the demand without one. */
  projectNo: string
  /** The hours the Kalender plans for the project, plus the hours moved to the day for it. */
  demand: number
  /** The part of the demand that was moved here from another day. */
  carried: number
  /** The hours of blocks, and in `withHired` of confirmed orders, that are for the project. */
  tagged: number
  /** The project's share of the hours that are for no project in particular. */
  shared: number
  /** `demand − tagged − shared`: negative when the project is tagged with more than it needs. */
  remaining: number
  /** The project's part shared out on its places, by `placeKey`, as the project's part is on the projects: `PROJECT_PLACE` for the demand on rows of all its halls. */
  places: Map<string, PlaceDay>
  /** The project's hours for no place in particular more than all its places lack together, which go to none of them. */
  unplaced: number
}

/** One place's part of a project's competence on a day. */
export interface PlaceDay {
  /** The place as the first row or block that has it writes it; `PROJECT_PLACE` for the project's halls. */
  hall: string
  /** The hours the project's rows of the place plan, plus, for `PROJECT_PLACE`, the hours moved to the day for the project. */
  demand: number
  /** The hours of blocks painted on the place's line. */
  tagged: number
  /** The place's share of the project's hours that are for no place in particular: its blocks without one, its confirmed orders and its share of the untagged hours. */
  shared: number
  /** `demand − tagged − shared`. */
  remaining: number
}

/** The place of the demand on a row for all of a project's halls, for none of them, or «Ufordelt»: the halls the project has booked that day (`bookedPlaces`). */
export const PROJECT_PLACE = ''

/** How a place is looked up in the balance: by its name as it is compared, `PROJECT_PLACE` for a row of all the project's halls. */
export const placeKey = (hall: string | undefined): string => {
  const name = (hall ?? '').trim().toLowerCase()
  return name === PROJECT_HALLS.toLowerCase() ? PROJECT_PLACE : name
}

/** A competence on a day, shared out on its projects. */
export interface ProjectDayBalance {
  /** By the project's `numberKey`, with `NO_PROJECT` for the demand that has none. */
  projects: Map<string, ProjectDay>
  /** The hours assigned for no project, before they are shared out. */
  untagged: number
  /** The untagged hours more than all the projects lack together, which go to none: «Ikke fordelt». */
  unshared: number
}

export interface ProjectBalance {
  get: (competence: CompetenceKey, date: ISODate) => ProjectDayBalance
  /** One project's part, nothing where it has none. */
  of: (competence: CompetenceKey, date: ISODate, projectNo: string | undefined) => ProjectDay
  /** Every competence with demand or assigned hours on the dates. */
  competences: CompetenceKey[]
}

const NO_PROJECT_DAY: ProjectDay = { projectNo: NO_PROJECT, demand: 0, carried: 0, tagged: 0, shared: 0, remaining: 0, places: new Map(), unplaced: 0 }
const NO_PROJECT_BALANCE: ProjectDayBalance = { projects: new Map(), untagged: 0, unshared: 0 }

/**
 * Shares `untagged` hours out on the recipients by what each lacks after its tagged hours, as `spreadOpen` shares by
 * hours: where one alone lacks hours, it gets them all. Sets each one's `shared` and `remaining`, and returns the
 * hours more than all lack together, which go to none.
 */
const shareOut = (recipients: { demand: number; tagged: number; shared: number; remaining: number }[], untagged: number): number => {
  const lacking = recipients.map((r) => Math.max(0, r.demand - r.tagged))
  const lack = lacking.reduce((sum, hours) => sum + hours, 0)
  const share = Math.min(untagged, lack)
  recipients.forEach((r, i) => {
    r.shared = lack > 0 ? (share * lacking[i]) / lack : 0
    r.remaining = r.demand - r.tagged - r.shared
  })
  return Math.max(0, untagged - lack)
}

/**
 * The balance of `buildBalance` per project, over the whole workspace: what is hidden in the Kalender does not change it.
 * A project gets the hours tagged with it, and a share of the untagged hours by what it still lacks after them, as
 * `spreadOpen` shares by hours: where one project alone lacks hours, it gets them all. Untagged hours more than all
 * lack together go to none. The demand without a project is a recipient of its own, `NO_PROJECT`. Nothing of this
 * is stored. Bemanning counts the permanent staff alone, whose rest is what Innleid orders for; `withHired` counts
 * the confirmed orders too, as Resultat does. Shared by what is lacking, the two give each project the same.
 * Each project's part is shared on its places one step further: the place of a block painted on a place's line is
 * tagged, and the project's other hours go to its places by what each lacks (`places`, `PROJECT_PLACE`).
 */
export const buildProjectBalance = (ws: Workspace, dates: ISODate[], withHired = false): ProjectBalance => {
  const wd = ws.settings.workday
  const wanted = new Set(dates)
  const cells = new Map<string, { projects: Map<string, ProjectDay>; untagged: number; unshared: number }>()
  const cell = (competence: CompetenceKey, date: ISODate) => {
    const key = `${competence}|${date}`
    if (!cells.has(key)) cells.set(key, { projects: new Map(), untagged: 0, unshared: 0 })
    return cells.get(key)!
  }
  const part = (competence: CompetenceKey, date: ISODate, projectNo: string | undefined) => {
    const projects = cell(competence, date).projects
    const key = projectKey(projectNo)
    if (!projects.has(key)) projects.set(key, { ...NO_PROJECT_DAY, projectNo: key ? projectNo!.trim() : NO_PROJECT, places: new Map() })
    return projects.get(key)!
  }
  const place = (p: ProjectDay, hall: string | undefined) => {
    const key = placeKey(hall)
    if (!p.places.has(key)) p.places.set(key, { hall: key ? hall!.trim() : PROJECT_PLACE, demand: 0, tagged: 0, shared: 0, remaining: 0 })
    return p.places.get(key)!
  }
  const assigned = (competence: CompetenceKey, date: ISODate, work: { projectNo?: string; hall?: string }, hours: number) => {
    if (!projectKey(work.projectNo)) {
      cell(competence, date).untagged += hours
      return
    }
    const p = part(competence, date, work.projectNo)
    p.tagged += hours
    if (work.hall?.trim()) place(p, work.hall).tagged += hours
  }
  for (const row of ws.allocations) {
    const competence = competenceKey(row.competence)
    if (!competence) continue
    for (const date in row.fte) {
      if (!row.fte[date] || !wanted.has(date)) continue
      const p = part(competence, date, row.projectNo)
      const hours = row.fte[date] * ws.settings.hoursPerDay
      p.demand += hours
      place(p, row.hall).demand += hours
    }
  }
  for (const adjustment of ws.demandAdjustments ?? []) {
    if (!wanted.has(adjustment.date)) continue
    const p = part(adjustment.competence, adjustment.date, adjustment.projectNo)
    p.demand += adjustment.hours
    p.carried += adjustment.hours
    place(p, PROJECT_PLACE).demand += adjustment.hours
  }
  for (const a of okAssignments(ws)) if (wanted.has(a.date)) assigned(a.competence, a.date, a, paidHours(a, wd))
  if (withHired) for (const order of ws.hireOrders ?? []) if (wanted.has(order.date) && !isWaiting(order)) assigned(order.competence, order.date, order, order.fte * hireHours(order, wd))
  for (const c of cells.values()) {
    const projects = [...c.projects.values()]
    c.unshared = shareOut(projects, c.untagged)
    // A project's hours for no place in particular are shared on its places the same way.
    for (const p of projects) {
      const places = [...p.places.values()]
      const placed = places.reduce((sum, at) => sum + at.tagged, 0)
      p.unplaced = shareOut(places, p.tagged - placed + p.shared)
    }
  }
  const get = (competence: CompetenceKey, date: ISODate) => cells.get(`${competence}|${date}`) ?? NO_PROJECT_BALANCE
  return {
    get,
    of: (competence, date, projectNo) => get(competence, date).projects.get(projectKey(projectNo)) ?? NO_PROJECT_DAY,
    competences: [...new Set([...cells.keys()].map((key) => key.slice(0, key.lastIndexOf('|'))))].sort(),
  }
}

/** A project over a period: what the Kalender plans for it, what is staffed, and what remains. */
export interface ProjectTotal {
  planned: number
  tagged: number
  shared: number
  /** `planned − tagged − shared`. Hours moved from one day to the next are demand on both, so the days' own remaining would count them twice. */
  remaining: number
}

/** The totals per project, by its `numberKey`, of the competences and dates given, and the hours that went to none. */
export const projectTotals = (balance: ProjectBalance, dates: ISODate[], competences: CompetenceKey[] = balance.competences): { projects: Map<string, ProjectTotal>; unshared: number } => {
  const projects = new Map<string, ProjectTotal>()
  let unshared = 0
  for (const competence of competences) {
    for (const date of dates) {
      const day = balance.get(competence, date)
      unshared += day.unshared
      for (const [key, p] of day.projects) {
        const total = projects.get(key) ?? { planned: 0, tagged: 0, shared: 0, remaining: 0 }
        total.planned += p.demand - p.carried
        total.tagged += p.tagged
        total.shared += p.shared
        total.remaining = total.planned - total.tagged - total.shared
        projects.set(key, total)
      }
    }
  }
  return { projects, unshared }
}

export interface FreeCapacity {
  hours: number
  /** How many people have free normal time. */
  people: number
}

/**
 * R11: the free normal time of the permanent staff, or of those who have the competence.
 * Free time is shared between a person's competences, so the figures of two competences must not be added up.
 */
export const freeCapacity = (ws: Workspace, date: ISODate, competence?: CompetenceKey): FreeCapacity => {
  const wd = ws.settings.workday
  let hours = 0
  let people = 0
  for (const person of ws.persons ?? []) {
    if (competence !== undefined && !person.competences.includes(competence)) continue
    const free = freeHours(normalWindows(person.id, date, ws.unavailability ?? [], wd), blocksOf(ws.assignments ?? [], person.id, date), wd)
    hours += free
    if (free > 0) people += 1
  }
  return { hours, people }
}

/**
 * The unresolved assignments that still leave a gap: those on a day where hours of their competence remain.
 * Once others cover the day's demand, the assignment is replaced: it still does not count, but there is nothing left to solve.
 */
export const openUnresolved = (ws: Workspace): Assignment[] => {
  const unresolved = unresolvedAssignments(ws)
  if (!unresolved.length) return unresolved
  const balance = buildBalance(ws, [...new Set(unresolved.map((a) => a.date))])
  return unresolved.filter((a) => balance.get(a.competence, a.date).remaining > MET)
}

/** «Fjern uløste»: the assignments without the open unresolved ones on the given dates. Those whose day others cover are left as they are. */
export const removeUnresolved = (ws: Workspace, dates: ISODate[]): Assignment[] => {
  const all = ws.assignments ?? []
  const wanted = new Set(dates)
  const gone = new Set(openUnresolved(ws).filter((a) => wanted.has(a.date)))
  return gone.size ? all.filter((a) => !gone.has(a)) : all
}

/**
 * R47: a stroke of the brush cut to where the demand is met. The days run from where the stroke began to its
 * far end, `back` when that is towards earlier days. The stroke ends on the last of its days that still lacks
 * hours of the competence: the days before it are left as they are, the days past it are dropped, and that
 * day is filled no further than its remaining hours ask, to the quarter of an hour, by all the people of the
 * stroke together. Where they have too little free time for that, they get what the stroke gave them. Nothing
 * is left of a stroke over days that lack no hours. Work for a project goes as far as the project lacks hours, by `projects`.
 */
export const cellsToDemand = (ws: Workspace, cells: DayCell[], work: CompetenceKey | Work, balance: Balance, back = false, projects?: ProjectBalance): DayCell[] => {
  const wd = ws.settings.workday
  const { competence, projectNo } = workOf(work)
  const remaining = (date: ISODate) => (projectNo && projects ? projects.of(competence, date, projectNo).remaining : balance.get(competence, date).remaining)
  const offDays = onlyOffDays(cells)
  const outward = [...new Set(cells.map((cell) => cell.date))].sort((a, b) => (back ? b.localeCompare(a) : a.localeCompare(b)))
  const last = outward.findLastIndex((date) => (offDays || dayType(date) === 'arbeidsdag') && remaining(date) > MET)
  if (last < 0) return []
  const far = outward[last]
  const kept = new Set(outward.slice(0, last + 1))
  const ends = cells.filter((cell) => cell.date === far)
  const need = remaining(far)
  const given = (within: Interval) => ends.reduce((sum, cell) => sum + paidTotal(paintGaps(ws, { ...cell, within }, competence, 'full', offDays), wd), 0)
  // Every end of the stroke on that day has the same bounds: the normal day, or the part of it the stroke was drawn to.
  const bounds = ends[0].within ?? normalDay(wd)
  let within = bounds
  for (let t = wd.snap; t < length(bounds); t += wd.snap) {
    const tried = back ? { start: bounds.end - t, end: bounds.end } : { start: bounds.start, end: bounds.start + t }
    if (given(tried) < need - MET) continue
    within = tried
    break
  }
  const whole = within.start <= wd.dayStart && within.end >= wd.dayEnd
  return cells.filter((cell) => kept.has(cell.date)).map((cell) => (cell.date !== far || (whole && !cell.within) ? cell : { ...cell, within }))
}

/** R11: the remaining hours that the people with the competence have no free normal time for. Workdays only. */
export const uncoverable = (ws: Workspace, competence: CompetenceKey, date: ISODate, balance: Balance = buildBalance(ws, [date])): number =>
  dayType(date) === 'arbeidsdag' ? Math.max(0, balance.get(competence, date).remaining - freeCapacity(ws, date, competence).hours) : 0

/**
 * R12: moves unfinished hours to the next day as added demand. The day they come from keeps its demand and its assignments.
 * Moved for a project, the hours are for it. Moved for the competence alone, they are shared on what each project and
 * the demand without one still lack that day, among the permanent staff, so no hours moved are left without a recipient;
 * where none lacks any, they are for no project.
 */
export const carry = (ws: Workspace, work: CompetenceKey | Work, fromDate: ISODate, hours: number, makeId: () => string = () => `adj-${crypto.randomUUID()}`): DemandAdjustment[] => {
  const all = ws.demandAdjustments ?? []
  if (!(hours > 0)) return all
  const { competence, projectNo } = workOf(work)
  const moved = (part: number, to: string | undefined): DemandAdjustment => ({ id: makeId(), competence, ...(to && { projectNo: to }), date: addDays(fromDate, 1), hours: part, reason: 'carry', fromDate, createdAt: new Date().toISOString() })
  if (projectNo) return [...all, moved(hours, projectNo)]
  const lacking = [...buildProjectBalance(ws, [fromDate]).get(competence, fromDate).projects.values()].filter((p) => p.remaining > MET)
  if (!lacking.length) return [...all, moved(hours, undefined)]
  const parts = spread(hours, lacking.map((p) => p.remaining))
  return [...all, ...lacking.flatMap((p, i) => (parts[i] > 0 ? [moved(parts[i], p.projectNo || undefined)] : []))]
}

export interface WeekTotals {
  /** Covered share of the demand on workdays, 0–1; `null` without demand. */
  coveredShare: number | null
  /** Hours still open on workdays. */
  remaining: number
  overtime: number
  /** Hours still open on weekends and holidays. */
  weekendOpen: number
}

/** R13: the totals of the page header, over the given dates. */
export const weekTotals = (ws: Workspace, dates: ISODate[]): WeekTotals => balanceTotals(buildBalance(ws, dates), dates)

/** The totals of some of the days of a balance that is already worked out, such as the days in view. */
export const balanceTotals = (balance: Balance, dates: ISODate[]): WeekTotals => {
  let demand = 0
  let covered = 0
  let remaining = 0
  let overtime = 0
  let weekendOpen = 0
  for (const date of dates) {
    const workday = dayType(date) === 'arbeidsdag'
    for (const competence of balance.competences) {
      const cell = balance.get(competence, date)
      overtime += cell.assignedOT
      if (workday) {
        demand += cell.demand
        covered += cell.covered
        remaining += Math.max(0, cell.remaining)
      } else weekendOpen += Math.max(0, cell.remaining)
    }
  }
  return { coveredShare: demand > 0 ? covered / demand : null, remaining, overtime, weekendOpen }
}

export interface PersonWeek {
  /** Hours assigned in normal time. */
  normal: number
  /** The normal hours the person has in the week. */
  capacity: number
  overtime: number
}

/** R13: a person's assigned normal hours against their normal time, and their overtime, over the given dates. */
export const personWeek = (ws: Workspace, personId: string, dates: ISODate[]): PersonWeek => {
  const wd = ws.settings.workday
  const wanted = new Set(dates)
  const total: PersonWeek = { normal: 0, capacity: 0, overtime: 0 }
  for (const date of dates) total.capacity += paidTotal(normalWindows(personId, date, ws.unavailability ?? [], wd), wd)
  for (const a of okAssignments(ws)) {
    if (a.personId !== personId || !wanted.has(a.date)) continue
    const overtime = overtimeHours(a, dayType(a.date), wd)
    total.overtime += overtime
    total.normal += paidHours(a, wd) - overtime
  }
  return total
}

/** R14: the competence the brush starts with: of those people have, the one with the most hours remaining on the day; the first of them when nothing remains. */
export const defaultBrush = (ws: Workspace, date: ISODate, balance: Balance = buildBalance(ws, [date])): CompetenceKey | null => {
  let best: CompetenceKey | null = null
  for (const { key } of staffedCompetences(ws)) if (best === null || balance.get(key, date).remaining > balance.get(best, date).remaining) best = key
  return best
}

export interface AbsenceInput {
  personId: string
  from: ISODate
  to: ISODate
  /** Both unset: whole days. */
  start?: Minute
  end?: Minute
}

/**
 * Marks a person away on every day from `from` to `to`, one record per day. What was noted for the person on those days is replaced.
 * Assignments on the days are kept; they turn unresolved by themselves (R7).
 */
export const addAbsence = (unavailability: Unavailability[], input: AbsenceInput, makeId: () => string = () => `abs-${crypto.randomUUID()}`): Unavailability[] => {
  if (input.to < input.from) return unavailability
  const partial = input.start !== undefined && input.end !== undefined && input.end > input.start
  const days: Unavailability[] = []
  for (let date = input.from; date <= input.to; date = addDays(date, 1)) {
    days.push({ id: makeId(), personId: input.personId, date, ...(partial ? { start: input.start, end: input.end } : {}) })
  }
  return [...unavailability.filter((u) => u.personId !== input.personId || u.date < input.from || u.date > input.to), ...days]
}

/** The person is away the whole day. */
export const isAway = (unavailability: Unavailability[], personId: string, date: ISODate): boolean => absenceOf(unavailability, personId, date).some(isWholeDay)

/** A person's absence as stretches of days that follow each other and are alike, newest last. */
export interface AbsenceSpan {
  ids: string[]
  from: ISODate
  to: ISODate
  start?: Minute
  end?: Minute
}

export const absenceSpans = (unavailability: Unavailability[], personId: string): AbsenceSpan[] => {
  const spans: AbsenceSpan[] = []
  for (const u of unavailability.filter((x) => x.personId === personId).sort((a, b) => a.date.localeCompare(b.date))) {
    const last = spans[spans.length - 1]
    if (last && addDays(last.to, 1) === u.date && last.start === u.start && last.end === u.end) {
      last.ids.push(u.id)
      last.to = u.date
    } else spans.push({ ids: [u.id], from: u.date, to: u.date, start: u.start, end: u.end })
  }
  return spans
}

/**
 * R35: changes a stretch of absence: its days are replaced by the days of `input`. A stretch made shorter
 * loses the days that are left out.
 */
export const editAbsence = (unavailability: Unavailability[], span: AbsenceSpan, input: AbsenceInput, makeId?: () => string): Unavailability[] => {
  if (input.to < input.from) return unavailability
  const old = new Set(span.ids)
  return addAbsence(unavailability.filter((u) => !old.has(u.id)), input, makeId)
}

/** R35 «Tilbake fra» (once «Friskmeld fra»): ends the absence a day is in on the day before: that day and the days of it that follow are taken back. */
export const backFrom = (unavailability: Unavailability[], personId: string, date: ISODate): Unavailability[] => {
  const span = absenceSpans(unavailability, personId).find((s) => s.from <= date && date <= s.to)
  if (!span) return unavailability
  const ids = new Set(span.ids)
  return unavailability.filter((u) => !(ids.has(u.id) && u.date >= date))
}

/**
 * R36: a person's overtime per ISO week, keyed by the week's Monday: the hours outside the normal day and
 * all paid hours of a weekend or holiday, of the blocks that count. Weeks without overtime are left out.
 */
export const overtimeByWeek = (ws: Workspace, personId: string): Map<ISODate, number> => {
  const wd = ws.settings.workday
  const weeks = new Map<ISODate, number>()
  for (const a of okAssignments(ws)) {
    if (a.personId !== personId) continue
    const hours = overtimeHours(a, dayType(a.date), wd)
    if (hours <= 0) continue
    const monday = addDays(a.date, -weekdayIndex(a.date))
    weeks.set(monday, (weeks.get(monday) ?? 0) + hours)
  }
  return new Map([...weeks].sort((a, b) => a[0].localeCompare(b[0])))
}

/** R36: the people with a week above the limit, each with those weeks. The limit flags; it never stops an edit. */
export const overtimeBreaches = (ws: Workspace, limit: number): { personId: string; weeks: { monday: ISODate; hours: number }[] }[] =>
  (ws.persons ?? [])
    .map((p) => ({ personId: p.id, weeks: [...overtimeByWeek(ws, p.id)].filter(([, hours]) => hours > limit).map(([monday, hours]) => ({ monday, hours })) }))
    .filter((person) => person.weeks.length > 0)

/**
 * The carried hours taken back: the adjustments for the competence on the date are removed. For a project, only those for
 * it; for the competence alone, all of them, so every part a move was shared in goes.
 */
export const removeCarried = (adjustments: DemandAdjustment[], work: CompetenceKey | Work, date: ISODate): DemandAdjustment[] => {
  const { competence, projectNo } = workOf(work)
  const kept = adjustments.filter((a) => !(a.competence === competence && a.date === date && (!projectNo || sameProject(a, { projectNo }))))
  return kept.length === adjustments.length ? adjustments : kept
}
