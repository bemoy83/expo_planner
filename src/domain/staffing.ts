import { staffedCompetences } from './competences'
import { addDays, type ISODate } from './dates'
import { dayType, type DayType } from './holidays'
import { competenceKey, type Assignment, type CapacityLine, type CompetenceKey, type DayValues, type DemandAdjustment, type Interval, type Minute, type Person, type Unavailability, type WorkdaySettings, type Workspace } from './types'

/**
 * The rules of Bemanning: who can work when, what an assignment counts for, and how far the assigned
 * hours cover the demand the Kalender has planned. See design_docs/bemanning/RULES.md (R1–R15).
 * Everything here returns new lists; the same list comes back when nothing changed.
 */

const MIN_SPLIT_PART: Minute = 30
/** How near the start or end of the normal day a dragged edge has to be to land on it. */
const DAY_EDGE_PULL: Minute = 10
const CLICK_OVERTIME_BLOCK: Minute = 60

const length = (iv: Interval): Minute => iv.end - iv.start

const overlap = (a: Interval, b: Interval): Minute => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start))

const intersect = (a: Interval, b: Interval): Interval | null => {
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  return end > start ? { start, end } : null
}

/** The intervals with the given stretches cut out, sorted. */
const subtract = (intervals: Interval[], cuts: Interval[]): Interval[] => {
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
export const normalWindows = (personId: string, date: ISODate, unavailability: Unavailability[], wd: WorkdaySettings): Interval[] => {
  if (dayType(date) !== 'arbeidsdag') return []
  const absence = absenceOf(unavailability, personId, date)
  if (absence.some(isWholeDay)) return []
  return subtract([normalDay(wd)], absence.map((u) => ({ start: u.start!, end: u.end! })))
}

/**
 * The normal time the active people are away, as FTE per day, for the Kalender's «Tilgjengelig»: a whole
 * day away is 1, a part of the day is its share of the normal day. Workdays only; days without absence are left out.
 */
export const absenceFte = ({ persons, unavailability, settings }: Pick<Workspace, 'persons' | 'unavailability' | 'settings'>): DayValues => {
  const wd = settings.workday
  const full = paidHours(normalDay(wd), wd)
  const active = new Set((persons ?? []).filter((person) => person.active).map((person) => person.id))
  const days: DayValues = {}
  const seen = new Set<string>()
  for (const u of unavailability ?? []) {
    const key = `${u.personId}|${u.date}`
    if (!active.has(u.personId) || seen.has(key) || dayType(u.date) !== 'arbeidsdag' || !(full > 0)) continue
    seen.add(key)
    const left = normalWindows(u.personId, u.date, unavailability ?? [], wd).reduce((sum, iv) => sum + paidHours(iv, wd), 0)
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
  freeIntervals(windows, assignments, wd.snap).reduce((sum, iv) => sum + paidHours(iv, wd), 0)

const dayKey = (personId: string, date: ISODate) => `${personId}|${date}`
const keyOf = (a: { personId: string; date: ISODate }) => dayKey(a.personId, a.date)

/**
 * R9: joins a block to the one before it when they touch and have the same competence; the earlier block's id is kept.
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
      if (block.start === last.end && block.competence === last.competence) {
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

/** R15: only an active person who has the competence can be given work of it. */
export const isEligible = (person: Person | undefined, competence: CompetenceKey): boolean => !!person?.active && person.competences.includes(competence)

export interface DayCell {
  personId: string
  date: ISODate
}

export type PaintBlock = 'ineligible' | 'unavailable'

/** Why the brush cannot fill a day for a person, or `null` when it can. */
export const paintBlock = (ws: Workspace, cell: DayCell, competence: CompetenceKey): PaintBlock | null => {
  const person = ws.persons?.find((p) => p.id === cell.personId)
  if (!isEligible(person, competence)) return 'ineligible'
  return normalWindows(cell.personId, cell.date, ws.unavailability ?? [], ws.settings.workday).length ? null : 'unavailable'
}

/** The cells a full-day paint would have to ask about: those that can be painted and hold work of another competence. */
export const paintConflicts = (ws: Workspace, cells: DayCell[], competence: CompetenceKey): DayCell[] =>
  cells.filter((cell) => !paintBlock(ws, cell, competence) && blocksOf(ws.assignments ?? [], cell.personId, cell.date).some((a) => a.competence !== competence))

export interface PaintOptions {
  span: 'full' | 'half'
  mode: 'fill' | 'replace'
}

/**
 * R6: the time a paint would give a person on a day: the free part of their normal day, or of its first
 * free half. Nothing for a person without the competence or a day without normal time: painting never makes overtime.
 */
export const paintGaps = (ws: Workspace, cell: DayCell, competence: CompetenceKey, span: PaintOptions['span'], assignments: Assignment[] = ws.assignments ?? []): Interval[] => {
  if (paintBlock(ws, cell, competence)) return []
  const wd = ws.settings.workday
  const normal = normalWindows(cell.personId, cell.date, ws.unavailability ?? [], wd)
  const taken = blocksOf(assignments, cell.personId, cell.date)
  // A gap that is all lunch gives no hours, so it is not work to hand out.
  const free = (target: Interval[]) => freeIntervals(target, taken, wd.snap).filter((iv) => paidHours(iv, wd) > 0)
  if (span === 'full') return free(normal)
  const halves = [{ start: wd.dayStart, end: wd.breakStart }, { start: wd.breakEnd, end: wd.dayEnd }].map((half) => normal.flatMap((iv) => intersect(iv, half) ?? []))
  return halves.map(free).find((found) => found.length) ?? []
}

/** R6: gives each cell's person work of the competence in the time `paintGaps` finds. Cells that have none are skipped. */
export const paintDays = (ws: Workspace, cells: DayCell[], competence: CompetenceKey, opts: PaintOptions, makeId: () => string = newId): Assignment[] => {
  const before = ws.assignments ?? []
  let assignments = before
  const touched = new Set<string>()
  for (const cell of cells) {
    if (paintBlock(ws, cell, competence)) continue
    if (opts.mode === 'replace' && blocksOf(assignments, cell.personId, cell.date).length) {
      assignments = assignments.filter((a) => keyOf(a) !== keyOf(cell))
      touched.add(keyOf(cell))
    }
    const gaps = paintGaps(ws, cell, competence, opts.span, assignments)
    if (!gaps.length) continue
    assignments = [...assignments, ...gaps.map((gap): Assignment => ({ id: makeId(), personId: cell.personId, date: cell.date, competence, start: gap.start, end: gap.end, source: 'manual' }))]
    touched.add(keyOf(cell))
  }
  if (!touched.size) return before
  const merged = mergeAdjacent(assignments, touched)
  // A replace that puts back what was there is no change.
  return sameBlocks(before, merged, touched) ? before : merged
}

const sameBlocks = (a: Assignment[], b: Assignment[], days: Set<string>): boolean => {
  const shape = (list: Assignment[]) =>
    list
      .filter((x) => days.has(keyOf(x)))
      .map((x) => `${keyOf(x)}|${x.start}|${x.end}|${x.competence}`)
      .sort()
      .join(';')
  return shape(a) === shape(b)
}

/** The eraser: removes every assignment in the cells. */
export const clearDays = (assignments: Assignment[], cells: DayCell[]): Assignment[] => {
  const days = new Set(cells.map(keyOf))
  const kept = assignments.filter((a) => !days.has(keyOf(a)))
  return kept.length === assignments.length ? assignments : kept
}

export type AssignmentStatus = 'ok' | 'unresolved'

/** R7: an assignment is unresolved when its person is away then, no longer has the competence, or is inactive. */
export const assignmentStatus = (a: Assignment, ws: Workspace): AssignmentStatus => {
  const person = ws.persons?.find((p) => p.id === a.personId)
  if (!isEligible(person, a.competence)) return 'unresolved'
  const away = absenceOf(ws.unavailability ?? [], a.personId, a.date).some((u) => isWholeDay(u) || overlap(a, { start: u.start!, end: u.end! }) > 0)
  return away ? 'unresolved' : 'ok'
}

/** The assignments that count: the hours of an unresolved one are back in the demand. */
export const okAssignments = (ws: Workspace): Assignment[] => {
  const persons = new Map((ws.persons ?? []).map((p) => [p.id, p]))
  const absence = new Map<string, Unavailability[]>()
  for (const u of ws.unavailability ?? []) absence.set(keyOf(u), [...(absence.get(keyOf(u)) ?? []), u])
  return (ws.assignments ?? []).filter(
    (a) => isEligible(persons.get(a.personId), a.competence) && !(absence.get(keyOf(a)) ?? []).some((u) => isWholeDay(u) || overlap(a, { start: u.start!, end: u.end! }) > 0),
  )
}

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

export const unresolvedAssignments = (ws: Workspace): Assignment[] => {
  const ok = new Set(okAssignments(ws))
  return (ws.assignments ?? []).filter((a) => !ok.has(a))
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
  if (changed.start === block.start && changed.end === block.end && changed.competence === block.competence) return all
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

const addBlock = (ws: Workspace, cell: DayCell, competence: CompetenceKey, iv: Interval, makeId: () => string): Assignment[] => {
  const wd = ws.settings.workday
  const all = ws.assignments ?? []
  if (length(iv) < wd.snap || paidHours(iv, wd) <= 0) return all
  const block: Assignment = { id: makeId(), personId: cell.personId, date: cell.date, competence, start: iv.start, end: iv.end, source: 'manual' }
  return mergeAdjacent([...all, block], new Set([keyOf(cell)]))
}

/** R8: draws a block over the dragged span, within the free stretch the drag started in. */
export const drawBlock = (ws: Workspace, cell: DayCell, competence: CompetenceKey, from: Minute, to: Minute, opts: EditOptions = {}, makeId: () => string = newId): Assignment[] => {
  const wd = ws.settings.workday
  const all = ws.assignments ?? []
  const gap = gapAt(ws, cell.personId, cell.date, from, opts)
  if (!gap || !isEligible(ws.persons?.find((p) => p.id === cell.personId), competence)) return all
  const start = clamp(snapped(Math.min(from, to), wd, opts), gap.start, gap.end)
  const end = clamp(snapped(Math.max(from, to), wd, opts), gap.start, gap.end)
  return addBlock(ws, cell, competence, { start, end }, makeId)
}

/**
 * R8: a click with the brush on free time. Inside the person's normal time it fills what is free of it around the click;
 * in overtime it makes an hour's block from the full hour clicked.
 */
export const clickBlock = (ws: Workspace, cell: DayCell, competence: CompetenceKey, t: Minute, opts: EditOptions = {}, makeId: () => string = newId): Assignment[] => {
  const wd = ws.settings.workday
  const all = ws.assignments ?? []
  const gap = gapAt(ws, cell.personId, cell.date, t, opts)
  if (!gap || !isEligible(ws.persons?.find((p) => p.id === cell.personId), competence)) return all
  const normal = normalWindows(cell.personId, cell.date, ws.unavailability ?? [], wd).find((iv) => iv.start <= t && t < iv.end)
  const hour = Math.floor(t / 60) * 60
  const wanted = normal ?? { start: hour, end: hour + CLICK_OVERTIME_BLOCK }
  const iv = intersect(wanted, gap)
  return iv ? addBlock(ws, cell, competence, iv, makeId) : all
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
    for (const date of dates) if (row.fte[date]) cell(competence, date).demand += row.fte[date] * ws.settings.hoursPerDay
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

export interface FreeCapacity {
  hours: number
  /** How many people have free normal time. */
  people: number
}

/**
 * R11: the free normal time of the active people, or of those who have the competence.
 * Free time is shared between a person's competences, so the figures of two competences must not be added up.
 */
export const freeCapacity = (ws: Workspace, date: ISODate, competence?: CompetenceKey): FreeCapacity => {
  const wd = ws.settings.workday
  let hours = 0
  let people = 0
  for (const person of ws.persons ?? []) {
    if (!person.active || (competence !== undefined && !person.competences.includes(competence))) continue
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
  return unresolved.filter((a) => balance.get(a.competence, a.date).remaining > 0.01)
}

/** «Fjern uløste»: the assignments without the open unresolved ones on the given dates. Those whose day others cover are left as they are. */
export const removeUnresolved = (ws: Workspace, dates: ISODate[]): Assignment[] => {
  const all = ws.assignments ?? []
  const wanted = new Set(dates)
  const gone = new Set(openUnresolved(ws).filter((a) => wanted.has(a.date)))
  return gone.size ? all.filter((a) => !gone.has(a)) : all
}

/** R11: the remaining hours that the people with the competence have no free normal time for. Workdays only. */
export const uncoverable = (ws: Workspace, competence: CompetenceKey, date: ISODate, balance: Balance = buildBalance(ws, [date])): number =>
  dayType(date) === 'arbeidsdag' ? Math.max(0, balance.get(competence, date).remaining - freeCapacity(ws, date, competence).hours) : 0

/** R12: moves unfinished hours to the next day as added demand. The day they come from keeps its demand and its assignments. */
export const carry = (ws: Workspace, competence: CompetenceKey, fromDate: ISODate, hours: number, makeId: () => string = () => `adj-${crypto.randomUUID()}`): DemandAdjustment[] => {
  const all = ws.demandAdjustments ?? []
  if (!(hours > 0)) return all
  return [...all, { id: makeId(), competence, date: addDays(fromDate, 1), hours, reason: 'carry', fromDate, createdAt: new Date().toISOString() }]
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
export const weekTotals = (ws: Workspace, dates: ISODate[]): WeekTotals => {
  const balance = buildBalance(ws, dates)
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
  for (const date of dates) total.capacity += normalWindows(personId, date, ws.unavailability ?? [], wd).reduce((sum, iv) => sum + paidHours(iv, wd), 0)
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
  kind: Unavailability['kind']
  /** Both unset: whole days. */
  start?: Minute
  end?: Minute
  note?: string
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
    days.push({ id: makeId(), personId: input.personId, date, kind: input.kind, ...(partial ? { start: input.start, end: input.end } : {}), ...(input.note ? { note: input.note } : {}) })
  }
  return [...unavailability.filter((u) => u.personId !== input.personId || u.date < input.from || u.date > input.to), ...days]
}

/** Marks a person sick on the given days. Days off, and days the person is already away, are left as they are. */
export const markSick = (unavailability: Unavailability[], personId: string, dates: ISODate[], makeId?: () => string): Unavailability[] => {
  let next = unavailability
  for (const date of dates) {
    if (dayType(date) !== 'arbeidsdag' || absenceOf(next, personId, date).some(isWholeDay)) continue
    next = addAbsence(next, { personId, from: date, to: date, kind: 'syk' }, makeId)
  }
  return next
}

/** Takes sickness back for the given days. Assignments on them count again by themselves. */
export const clearSick = (unavailability: Unavailability[], personId: string, dates: ISODate[]): Unavailability[] => {
  const days = new Set(dates)
  const kept = unavailability.filter((u) => !(u.personId === personId && u.kind === 'syk' && days.has(u.date)))
  return kept.length === unavailability.length ? unavailability : kept
}

export const isSick = (unavailability: Unavailability[], personId: string, date: ISODate): boolean => absenceOf(unavailability, personId, date).some((u) => u.kind === 'syk' && isWholeDay(u))

/** A person's absence as stretches of days that follow each other and are alike, newest last. */
export interface AbsenceSpan {
  ids: string[]
  from: ISODate
  to: ISODate
  kind: Unavailability['kind']
  start?: Minute
  end?: Minute
  note?: string
}

export const absenceSpans = (unavailability: Unavailability[], personId: string): AbsenceSpan[] => {
  const spans: AbsenceSpan[] = []
  for (const u of unavailability.filter((x) => x.personId === personId).sort((a, b) => a.date.localeCompare(b.date))) {
    const last = spans[spans.length - 1]
    if (last && addDays(last.to, 1) === u.date && last.kind === u.kind && last.start === u.start && last.end === u.end && (last.note ?? '') === (u.note ?? '')) {
      last.ids.push(u.id)
      last.to = u.date
    } else spans.push({ ids: [u.id], from: u.date, to: u.date, kind: u.kind, start: u.start, end: u.end, note: u.note })
  }
  return spans
}

/** The carried hours taken back: the adjustments for the competence on the date are removed. */
export const removeCarried = (adjustments: DemandAdjustment[], competence: CompetenceKey, date: ISODate): DemandAdjustment[] => {
  const kept = adjustments.filter((a) => !(a.competence === competence && a.date === date))
  return kept.length === adjustments.length ? adjustments : kept
}
