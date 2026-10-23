import { useCallback, useMemo } from 'react'
import type { ISODate } from '../../domain/dates'
import { openUnresolved } from '../../domain/staffing/balance'
import { okAssignments, overtimeBreaches, personWeek, type PersonWeek } from '../../domain/staffing/time'
import type { Assignment, Person, Unavailability, Workspace } from '../../domain/types'
import { weekDates } from './week'
import { pushTo } from '../../domain/collections'

/** One person's line: who, and what the grid knows about their days. */
export interface PersonLine {
  person: Person
  assignments: Map<ISODate, Assignment[]> | undefined
  absence: Map<ISODate, Unavailability[]> | undefined
  week: PersonWeek
  /** The person lacks the competence in focus. */
  dim: boolean
}

/** A list of things of a person and a day, by the person and then the day. */
const byDay = <T extends { personId: string; date: ISODate }>(list: T[]) => {
  const map = new Map<string, Map<ISODate, T[]>>()
  for (const item of list) {
    let days = map.get(item.personId)
    if (!days) map.set(item.personId, (days = new Map()))
    pushTo(days, item.date, item)
  }
  return map
}

interface Options {
  active: boolean
  ws: Workspace
  dates: ISODate[]
  /** The competence in focus: the people who have it come first. */
  brush: string | null
  /** The week a person's hours are counted in, and its Monday. */
  week: ISODate[]
  weekStart: ISODate
  /** The person whose hours are open, shown above the list and not in it. */
  unfolded: string | null
  overtimeLimit: number
}

/** The lines of the people: who, their blocks and absence by day, the week's hours, which blocks count, and who is over the overtime limit. */
export function usePeopleLines({ active, ws, dates, brush, week, weekStart, unfolded, overtimeLimit }: Options) {
  const persons = useMemo(() => (active ? (ws.persons ?? []) : []), [active, ws.persons])
  // Blocks that do not count and still leave a gap. One whose day is covered by others is no longer something to solve.
  const open = useMemo(() => (active ? openUnresolved(ws) : []), [active, ws])
  const openIds = useMemo(() => new Set(open.map((a) => a.id)), [open])
  // A block counts when some of it does: absence for a part of the day takes only the time it covers.
  const ok = useMemo(() => new Set(active ? okAssignments(ws).map((a) => a.id) : []), [active, ws])
  const isOk = useCallback((a: Assignment) => ok.has(a.id), [ok])
  const isOpen = useCallback((a: Assignment) => openIds.has(a.id), [openIds])
  const lines = useMemo<PersonLine[]>(() => {
    const assignments = byDay(ws.assignments ?? [])
    const absence = byDay(ws.unavailability ?? [])
    const all = persons.map((person) => ({ person, assignments: assignments.get(person.id), absence: absence.get(person.id), week: personWeek(ws, person.id, week), dim: !!brush && !person.competences.includes(brush) }))
    // With a competence in focus, the people who have it come first.
    return brush ? [...all.filter((line) => !line.dim), ...all.filter((line) => line.dim)] : all
  }, [ws, persons, week, brush])
  /** How many of the lines have the competence in focus; the rest follow a divider. */
  const able = brush ? lines.filter((line) => !line.dim).length : lines.length
  const divided = able < lines.length
  // The person whose hours are open is shown above the list, not in it.
  const listed = useMemo(() => lines.filter((line) => line.person.id !== unfolded), [lines, unfolded])
  const listedAble = brush ? listed.filter((line) => !line.dim).length : listed.length
  const lineOf = useMemo(() => new Map(lines.map((line) => [line.person.id, line])), [lines])

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

  return { persons, open, isOk, isOpen, lines, able, divided, listed, listedAble, lineOf, breaches, overLimit }
}
