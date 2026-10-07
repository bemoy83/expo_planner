import { dayType } from '../../domain/holidays'
import type { ISODate } from '../../domain/dates'
import { overtimeHours, paidHours } from '../../domain/staffing'
import type { Assignment, Minute, Unavailability, UnavailabilityKind, WorkdaySettings } from '../../domain/types'
import { clock } from './week'

/** How much of a block's name fits: the whole name with «hel dag», the name, the short name, or nothing. */
export type BlockLabel = 'full' | 'name' | 'short' | 'none'

/** A stretch of the normal day, as a share of its width. */
export interface Span {
  left: number
  width: number
}

export interface CellBlock extends Span {
  id: string
  competence: string
  start: Minute
  end: Minute
  hours: number
  unresolved: boolean
  label: BlockLabel
}

export const ABSENCE_LABELS: Record<UnavailabilityKind, string> = { syk: 'Syk', ferie: 'Ferie', kurs: 'Kurs', annet: 'Fravær' }

/** What a person's day shows when it is folded: a small timeline of the normal day. */
export interface DayCell {
  /** A weekend or a holiday: no normal time, only overtime. */
  offDay: boolean
  /** Away the whole day, and why. */
  away: UnavailabilityKind | null
  /** The parts of the normal day the person is away for. */
  hatches: Span[]
  /** «Går 12:00», or the note written on the absence. */
  note: string
  /** The blocks, cut to the normal day. On an off day they are kept whole. */
  blocks: CellBlock[]
  unresolved: number
  overtime: number
}

const NAME_MIN_WIDTH = 44
const SHORT_MIN_WIDTH = 20

/** Builds the folded view of one person's day from their assignments and absence that day. */
export const dayCell = (date: ISODate, assignments: Assignment[], absence: Unavailability[], ok: (a: Assignment) => boolean, wd: WorkdaySettings): DayCell => {
  const kind = dayType(date)
  const offDay = kind !== 'arbeidsdag'
  const span = (start: Minute, end: Minute): Span => ({ left: ((start - wd.dayStart) / (wd.dayEnd - wd.dayStart)) * 100, width: ((end - start) / (wd.dayEnd - wd.dayStart)) * 100 })
  const whole = absence.find((u) => u.start === undefined || u.end === undefined)
  const partial = whole ? [] : absence
  const sorted = [...assignments].sort((a, b) => a.start - b.start)
  const present = partial.length ? { start: Math.max(wd.dayStart, ...partial.filter((u) => u.start! <= wd.dayStart).map((u) => u.end!)), end: Math.min(wd.dayEnd, ...partial.filter((u) => u.end! >= wd.dayEnd).map((u) => u.start!)) } : null
  const blocks = sorted.flatMap((a): CellBlock[] => {
    const start = offDay ? a.start : Math.max(a.start, wd.dayStart)
    const end = offDay ? a.end : Math.min(a.end, wd.dayEnd)
    if (end <= start) return []
    const shape = span(start, end)
    const covers = !offDay && sorted.length === 1 && !whole && start <= (present?.start ?? wd.dayStart) && end >= (present?.end ?? wd.dayEnd)
    return [{ id: a.id, competence: a.competence, start: a.start, end: a.end, hours: paidHours(a, wd), unresolved: !ok(a), label: covers ? 'full' : shape.width >= NAME_MIN_WIDTH ? 'name' : shape.width >= SHORT_MIN_WIDTH ? 'short' : 'none', ...shape }]
  })
  const first = partial[0]
  const derivedNote = !first ? '' : first.end! >= wd.dayEnd ? `Går ${clock(first.start!)}` : first.start! <= wd.dayStart ? `Fra ${clock(first.end!)}` : `Borte ${clock(first.start!)}–${clock(first.end!)}`
  return {
    offDay,
    away: whole ? whole.kind : null,
    hatches: offDay ? [] : partial.map((u) => span(Math.max(u.start!, wd.dayStart), Math.min(u.end!, wd.dayEnd))).filter((s) => s.width > 0),
    note: (whole ?? first)?.note || derivedNote,
    blocks,
    unresolved: assignments.filter((a) => !ok(a)).length,
    overtime: assignments.filter(ok).reduce((sum, a) => sum + overtimeHours(a, kind, wd), 0),
  }
}
