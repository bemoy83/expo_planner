import { addDays, weekdayIndex, type ISODate } from '../dates'
import { dayType } from '../holidays'
import { type Assignment, type CapacityLine, type CompetenceKey, type DayValues, type Interval, type Minute, type Person, type Unavailability, type WorkdaySettings, type Workspace } from '../types'
import { normalDay, normalDayHours, overtimeHours, paidHours, paidTotal, subtract } from './intervals'

/**
 * A person's time in Bemanning: when they can work, which blocks count and for how much (R7), absence as days and periods (R35), and overtime per day and week (R13, R36), with the Kalender's staffing lines for absence and overtime.
 * See design_docs/bemanning/RULES.md.
 */

export const isWholeDay = (u: Unavailability): boolean => u.start === undefined || u.end === undefined

const dayKey = (personId: string, date: ISODate) => `${personId}|${date}`

export const keyOf = (a: { personId: string; date: ISODate }) => dayKey(a.personId, a.date)

/**
 * The records of a list by person and day, in the order of the list, built once per list: a stroke previews its
 * days and the people lines count their weeks one person and day at a time, over the same lists.
 */
const dayIndexes = new WeakMap<readonly { personId: string; date: ISODate }[], Map<string, unknown[]>>()

const byPersonDay = <T extends { personId: string; date: ISODate }>(list: readonly T[]): Map<string, T[]> => {
  let index = dayIndexes.get(list) as Map<string, T[]> | undefined
  if (!index) {
    index = new Map()
    for (const item of list) {
      const day = index.get(keyOf(item))
      if (day) day.push(item)
      else index.set(keyOf(item), [item])
    }
    dayIndexes.set(list, index)
  }
  return index
}

const NONE: never[] = []

export const absenceOf = (unavailability: Unavailability[], personId: string, date: ISODate): Unavailability[] => byPersonDay(unavailability).get(dayKey(personId, date)) ?? NONE

/** R3: the person's normal time that day: the normal day on a workday, less any absence. */
export const normalWindows = (personId: string, date: ISODate, unavailability: Unavailability[], wd: WorkdaySettings): Interval[] =>
  dayType(date) === 'arbeidsdag' ? dayWindows(personId, date, unavailability, wd) : []

/** The hours of the normal day the person is not away for, on any day: where the brush fills a weekend or a holiday that is picked by itself. */
export const dayWindows = (personId: string, date: ISODate, unavailability: Unavailability[], wd: WorkdaySettings): Interval[] => {
  const absence = absenceOf(unavailability, personId, date)
  if (absence.some(isWholeDay)) return []
  return subtract([normalDay(wd)], absence.map((u) => ({ start: u.start!, end: u.end! })))
}

/** The hours the permanent staff can work on a day in their normal time: each one's normal day less absence, on workdays. */
export const staffHours = ({ persons, unavailability, settings }: Pick<Workspace, 'persons' | 'unavailability' | 'settings'>, date: ISODate): number =>
  (persons ?? []).reduce((sum, person) => sum + paidTotal(normalWindows(person.id, date, unavailability ?? [], settings.workday), settings.workday), 0)

/**
 * The normal time the permanent staff are away, as FTE per day, for the Kalender's «Tilgjengelig»: a whole
 * day away is 1, a part of the day is its share of the normal day. Workdays only; days without absence are left out.
 */
export const absenceFte = ({ persons, unavailability, settings }: Pick<Workspace, 'persons' | 'unavailability' | 'settings'>): DayValues => {
  const wd = settings.workday
  const full = normalDayHours(wd)
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

export const blocksOf = (assignments: Assignment[], personId: string, date: ISODate): Assignment[] =>
  [...(byPersonDay(assignments).get(dayKey(personId, date)) ?? NONE)].sort((a, b) => a.start - b.start)

/** R15: only a person who has the competence can be given work of it. */
export const isEligible = (person: Person | undefined, competence: CompetenceKey): boolean => !!person && person.competences.includes(competence)

type AssignmentStatus = 'ok' | 'unresolved'

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
export const okAssignments = (ws: Pick<Workspace, 'persons' | 'unavailability' | 'assignments'>): readonly Assignment[] => {
  const assignments = ws.assignments ?? NONE
  const cached = okCache.get(assignments)
  if (cached && cached.persons === ws.persons && cached.unavailability === ws.unavailability) return cached.ok
  const persons = new Map((ws.persons ?? []).map((p) => [p.id, p]))
  const absence = byPersonDay(ws.unavailability ?? NONE)
  const ok = assignments.flatMap((a) => {
    const parts = workedParts(a, persons.get(a.personId), absence.get(keyOf(a)) ?? NONE)
    return parts.length === 1 && parts[0].start === a.start && parts[0].end === a.end ? [a] : parts.map((part) => ({ ...a, start: part.start, end: part.end }))
  })
  okCache.set(assignments, { persons: ws.persons, unavailability: ws.unavailability, ok })
  return ok
}

/** What counts is worked out once per workspace: Bemanning asks for it once per person, and every balance asks again. */
const okCache = new WeakMap<readonly Assignment[], { persons: Workspace['persons']; unavailability: Workspace['unavailability']; ok: readonly Assignment[] }>()

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
