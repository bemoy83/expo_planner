import { dayType } from '../../domain/holidays'
import type { ISODate } from '../../domain/dates'
import { overtimeHours, paidTotal, subtract } from '../../domain/staffing/intervals'
import { workTag, type Assignment, type Interval, type Minute, type Unavailability, type WorkdaySettings } from '../../domain/types'
import { clock } from './week'

/** What a block says: the name with its hours, the name, the short name, or nothing. */
type BlockLabel = 'hours' | 'name' | 'short' | 'none'
/** The setting «Navn på blokker»: the whole name where it fits, the hours too where there is room, or always the short name. */
export type BlockNames = 'full' | 'auto' | 'short'
export const cleanBlockNames = (stored: unknown): BlockNames => (stored === 'auto' || stored === 'short' ? stored : 'full')

/** Roughly the width of a letter of a block's name, of its short name and of its hours, and the room its padding takes. */
const NAME_CHAR_W = 6.7
const SHORT_CHAR_W = 7
const HOURS_CHAR_W = 6
const BLOCK_PAD = 13

/**
 * R24: what a block `width` pixels wide has room to say: the competence's whole name, else its short name,
 * else nothing. The hours («7,5») show only with the setting «Auto», where they fit after the name.
 */
export const blockLabel = (width: number, name: string, shortName: string, names: BlockNames = 'full', hours = ''): BlockLabel => {
  const room = width - BLOCK_PAD
  const short = room >= shortName.length * SHORT_CHAR_W ? 'short' : 'none'
  if (names === 'short' || room < name.length * NAME_CHAR_W) return short
  return names === 'auto' && room >= name.length * NAME_CHAR_W + hours.length * HOURS_CHAR_W + 6 ? 'hours' : 'name'
}

/**
 * R24: what a run of days `width` pixels wide says: its name as a block would, and the days it lasts where
 * they fit after the name («Vegger · 5 d»).
 */
export const runLabel = (width: number, name: string, shortName: string, names: BlockNames, days: number): string => {
  const label = blockLabel(width, name, shortName, names)
  if (label === 'none') return ''
  const said = label === 'short' ? shortName : name
  const count = ` · ${days} d`
  return width - BLOCK_PAD >= said.length * NAME_CHAR_W + count.length * HOURS_CHAR_W ? said + count : said
}

/** A stretch of the normal day, or of a block, as a share of its width. */
export interface Span {
  left: number
  width: number
}

/** Where the part of `whole` that `part` covers lies in it. */
export const spanOf = (part: Interval, whole: Interval): Span => {
  const start = Math.max(part.start, whole.start)
  return { left: ((start - whole.start) / (whole.end - whole.start)) * 100, width: ((Math.min(part.end, whole.end) - start) / (whole.end - whole.start)) * 100 }
}

interface CellBlock extends Span {
  id: string
  competence: string
  /** The project it is for, where it is tagged with one, and the place, where it is painted on one. */
  projectNo?: string
  hall?: string
  start: Minute
  end: Minute
  /** The hours of it that count; of a block that does not count, its own. */
  hours: number
  /** The time of it that count, as it is said: «12:00–15:00». */
  times: string
  /** Its hours do not count: the person is away, or lacks the competence. */
  unresolved: boolean
  /** Unresolved, but others cover the day's demand, so nothing is left to solve. */
  replaced: boolean
  /** The stretches of a block that counts which the person is away for, as shares of the block's width. Their hours are back in the demand. */
  away: Span[]
}

/** What a day says of absence for a part of it: when the person leaves, comes, or is gone between. */
export const absenceNote = (u: Unavailability, wd: WorkdaySettings): string =>
  u.end! >= wd.dayEnd ? `Går ${clock(u.start!)}` : u.start! <= wd.dayStart ? `Kommer ${clock(u.end!)}` : `Borte ${clock(u.start!)}–${clock(u.end!)}`

/** What a day away the whole of it says: away, and no more. */
export const AWAY_LABEL = 'Borte'

/** What a person's day shows when it is folded: a small timeline of the normal day. */
export interface DayCell {
  /** A weekend or a holiday: no normal time, only overtime. Its blocks are drawn as a working day's; absence shows only where it has blocks. */
  offDay: boolean
  /** Away the whole day. */
  away: boolean
  /** The parts of the normal day the person is away for and has nothing planned in. What is planned there is hatched itself. */
  hatches: Span[]
  /** «Går 12:00», for absence for a part of the day. */
  note: string
  /** The blocks, cut to the normal day. */
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
  const day = { start: wd.dayStart, end: wd.dayEnd }
  const whole = absence.find((u) => u.start === undefined || u.end === undefined)
  const partial = whole ? [] : absence
  const sorted = [...assignments].sort((a, b) => a.start - b.start)
  const awayFor = (whole ? [day] : partial.map((u) => ({ start: Math.max(u.start!, wd.dayStart), end: Math.min(u.end!, wd.dayEnd) }))).filter((iv) => iv.end > iv.start)
  const blocks = sorted.flatMap((a): CellBlock[] => {
    const drawn = { start: Math.max(a.start, wd.dayStart), end: Math.min(a.end, wd.dayEnd) }
    if (drawn.end <= drawn.start) return []
    // Of a block that counts, the time the person is away for: what the block loses when the time they are there for is taken out of it.
    const here = subtract([drawn], awayFor)
    const away = ok(a) ? subtract([drawn], here).map((iv) => spanOf(iv, drawn)) : []
    const counted = ok(a) ? subtract([{ start: a.start, end: a.end }], partial.map((u) => ({ start: u.start!, end: u.end! }))) : [a]
    const hours = paidTotal(counted, wd)
    const times = counted.map((part) => `${clock(part.start)}–${clock(part.end)}`).join(' · ')
    return [{ id: a.id, competence: a.competence, ...workTag(a), start: a.start, end: a.end, hours, times, unresolved: !ok(a), replaced: !ok(a) && !open(a), away, ...spanOf(drawn, day) }]
  })
  const first = partial[0]
  return {
    offDay,
    away: !!whole,
    hatches: subtract(awayFor, sorted).map((iv) => spanOf(iv, day)),
    note: first ? absenceNote(first, wd) : '',
    blocks,
    unresolved: assignments.filter((a) => !ok(a) && open(a)).length,
    overtime: assignments.filter(ok).reduce((sum, a) => sum + overtimeHours(a, kind, wd), 0),
  }
}
