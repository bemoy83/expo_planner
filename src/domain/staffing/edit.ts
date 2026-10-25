import { addDays, daysBetween, type ISODate } from '../dates'
import { dayType } from '../holidays'
import { sameTag, workOf, workTag, type Assignment, type CompetenceKey, type Interval, type Minute, type Work, type WorkdaySettings, type Workspace } from '../types'
import { clamp } from '../numbers'
import { freeIntervals, intersect, length, overlap, paidHours, subtract } from './intervals'
import { absenceOf, blocksOf, dayWindows, editableWindows, isEligible, isWholeDay, keyOf, normalWindows } from './time'
import { pushTo } from '../collections'

/**
 * Painting and editing assignments in Bemanning: the brush and the eraser (R6), blocks moved, resized, split and recoloured, days moved, copied and pasted (R19, R34, R38). Everything returns new lists; the same list comes back when nothing changed.
 * See design_docs/bemanning/RULES.md.
 */

const MIN_SPLIT_PART: Minute = 30

/** How near the start or end of the normal day a dragged edge has to be to land on it. */
const DAY_EDGE_PULL: Minute = 10

const CLICK_OVERTIME_BLOCK: Minute = 60

/**
 * R9: joins a block to the one before it when they touch and are the same work, of one competence for one project in one place; the earlier block's id is kept.
 * With `only`, just those person-days are looked at.
 */
export const mergeAdjacent = (assignments: Assignment[], only?: Set<string>): Assignment[] => {
  const byDay = new Map<string, Assignment[]>()
  for (const a of assignments) {
    if (only && !only.has(keyOf(a))) continue
    pushTo(byDay, keyOf(a), a)
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

export interface DayCell {
  personId: string
  date: ISODate
  /** Where only a part of the day is meant: the brush fills free time within it alone, as where an end of a run is pulled to a time of the day. */
  within?: Interval
}

type PaintBlock = 'ineligible' | 'unavailable'

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
type MoveRefusal = 'overlap' | 'away' | 'ineligible'

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
interface BlockShape {
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

interface DayMove {
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
    pushTo(byDay, keyOf(a), a)
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

/**
 * Blocks the planning engine painted become the planner's own once he changes them, so that the next run of the engine
 * leaves them where he put them. `after` is the list as an edit leaves it; the list itself where no such block changed.
 */
export const ownChanged = (before: Assignment[] | undefined, after: Assignment[] | undefined): Assignment[] | undefined => {
  if (!before || !after || before === after) return after
  const was = new Map(before.map((a) => [a.id, a]))
  let changed = false
  const next = after.map((a) => {
    const old = was.get(a.id)
    if (a.source !== 'suggested' || !old || old === a) return a
    changed = true
    return { ...a, source: 'manual' as const }
  })
  return changed ? next : after
}
