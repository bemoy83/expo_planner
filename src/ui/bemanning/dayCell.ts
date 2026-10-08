import { dayType } from '../../domain/holidays'
import type { ISODate } from '../../domain/dates'
import { overtimeHours, paidHours } from '../../domain/staffing'
import type { Assignment, Minute, Unavailability, UnavailabilityKind, WorkdaySettings } from '../../domain/types'
import { clock } from './week'

/** How much of a block's name fits: the name, the short name, or nothing. */
export type BlockLabel = 'name' | 'short' | 'none'

/** Roughly the width of a letter of a block's name and of its short name, and the room its padding takes. */
const NAME_CHAR_W = 6.7
const SHORT_CHAR_W = 7
const BLOCK_PAD = 13

/** R24: what a block `width` pixels wide has room to say: the competence's whole name, else its short name, else nothing. Never the hours. */
export const blockLabel = (width: number, name: string, shortName: string): BlockLabel =>
  width - BLOCK_PAD >= name.length * NAME_CHAR_W ? 'name' : width - BLOCK_PAD >= shortName.length * SHORT_CHAR_W ? 'short' : 'none'

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
  /** Its hours do not count: the person is away, or lacks the competence. */
  unresolved: boolean
  /** Unresolved, but others cover the day's demand, so nothing is left to solve. */
  replaced: boolean
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
  /** How many blocks are unresolved and still leave a gap. */
  unresolved: number
  overtime: number
}

/**
 * Builds the folded view of one person's day from their assignments and absence that day.
 * `ok` tells whether an assignment counts; `open` whether one that does not still leaves a gap.
 */
export const dayCell = (date: ISODate, assignments: Assignment[], absence: Unavailability[], ok: (a: Assignment) => boolean, wd: WorkdaySettings, open: (a: Assignment) => boolean = (a) => !ok(a)): DayCell => {
  const kind = dayType(date)
  const offDay = kind !== 'arbeidsdag'
  const span = (start: Minute, end: Minute): Span => ({ left: ((start - wd.dayStart) / (wd.dayEnd - wd.dayStart)) * 100, width: ((end - start) / (wd.dayEnd - wd.dayStart)) * 100 })
  const whole = absence.find((u) => u.start === undefined || u.end === undefined)
  const partial = whole ? [] : absence
  const sorted = [...assignments].sort((a, b) => a.start - b.start)
  const blocks = sorted.flatMap((a): CellBlock[] => {
    const start = offDay ? a.start : Math.max(a.start, wd.dayStart)
    const end = offDay ? a.end : Math.min(a.end, wd.dayEnd)
    if (end <= start) return []
    return [{ id: a.id, competence: a.competence, start: a.start, end: a.end, hours: paidHours(a, wd), unresolved: !ok(a), replaced: !ok(a) && !open(a), ...span(start, end) }]
  })
  const first = partial[0]
  const derivedNote = !first ? '' : first.end! >= wd.dayEnd ? `Går ${clock(first.start!)}` : first.start! <= wd.dayStart ? `Fra ${clock(first.end!)}` : `Borte ${clock(first.start!)}–${clock(first.end!)}`
  return {
    offDay,
    away: whole ? whole.kind : null,
    hatches: offDay ? [] : partial.map((u) => span(Math.max(u.start!, wd.dayStart), Math.min(u.end!, wd.dayEnd))).filter((s) => s.width > 0),
    note: (whole ?? first)?.note || derivedNote,
    blocks,
    unresolved: assignments.filter((a) => !ok(a) && open(a)).length,
    overtime: assignments.filter(ok).reduce((sum, a) => sum + overtimeHours(a, kind, wd), 0),
  }
}
