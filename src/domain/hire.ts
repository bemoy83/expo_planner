import { dayText, type ISODate } from './dates'
import { projectTag, sameProject, SHIFT_IDS, type CapacityLine, type CompetenceKey, type DayValues, type HireOrder, type Interval, type Minute, type ShiftId, type Supplier, type WorkdaySettings, type Workspace } from './types'
import { pushTo } from './collections'
import { dayType } from './holidays'
import type { NeedLabelParts, NeedSegment } from './needLabel'

/**
 * The rules of Innleid: orders of people from suppliers against the hours of a competence that remain on a day
 * after the permanent staff are assigned. Everything is counted in hours; people are only on the orders.
 * The rule numbers are those of `design_docs/innleid/RULES.md`.
 */

const DAY: Minute = 1440

/** A difference in hours this small is rounding. */
export const HOURS_NOISE = 0.01

export const SHIFT_LABELS: Record<ShiftId, string> = { dag: 'Dag', kveld: 'Kveld', natt: 'Natt' }

/**
 * When a shift is worked. «Dag» is the normal day of Innstillinger, «Kveld» the same number of hours after it,
 * and «Natt» from there to the start of the next day: with a normal day of eight hours they go round the clock.
 */
export const shiftTimes = (shift: ShiftId, wd: WorkdaySettings): Interval => {
  const evening = (wd.dayEnd + (wd.dayEnd - wd.dayStart)) % DAY
  if (shift === 'dag') return { start: wd.dayStart, end: wd.dayEnd }
  if (shift === 'kveld') return { start: wd.dayEnd, end: evening }
  return { start: evening, end: wd.dayStart }
}

/** The shift an order's times are, or `null` for times of its own. */
export const shiftOf = (times: Interval, wd: WorkdaySettings): ShiftId | null => SHIFT_IDS.find((shift) => shiftTimes(shift, wd).start === times.start && shiftTimes(shift, wd).end === times.end) ?? null

const clock = (minute: Minute) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

/** A stretch of time as it is written on an order: «07:00–15:00». */
export const timesText = (times: Interval): string => `${clock(times.start)}–${clock(times.end)}`

/** When an order is worked: its shift, with its own times beside it where they are not the shift's. */
export const shiftText = (order: Interval & { shift: ShiftId }, wd: WorkdaySettings): string => {
  const times = shiftTimes(order.shift, wd)
  return times.start === order.start && times.end === order.end ? SHIFT_LABELS[order.shift] : `${SHIFT_LABELS[order.shift]} ${timesText(order)}`
}

/** The length of an order's time, which goes through the night where its end is not after its start. */
const hireMinutes = ({ start, end }: Interval): Minute => (end > start ? end - start : end + DAY - start)

/** The paid hours one person has in an order: its length, less a lunch break as long as the normal day's when it lasts six hours or more. */
export const hireHours = (times: Interval, wd: WorkdaySettings): number => {
  const minutes = hireMinutes(times)
  return (minutes - (minutes >= 360 ? wd.breakEnd - wd.breakStart : 0)) / 60
}

export const isWaiting = (order: HireOrder): boolean => order.conf === null

type CoverState = 'none' | 'short' | 'ok' | 'over'

/** How far the orders cover what remains of one competence on one day. */
export interface Coverage {
  /** The hours that remain after the permanent staff. */
  rest: number
  /** The hours ordered, answered or not. */
  planned: number
  confirmed: number
  /** Positive while hours are missing, negative when more is ordered than remains. */
  remaining: number
  state: CoverState
  /** As `remaining`, by the confirmed orders alone: what the Avvik of the day counts. */
  left: number
  /** As `state`, by the confirmed orders alone. */
  firm: CoverState
  /** What Innleid shows (2026-10-27): the whole people of a normal day the hours that remain ask for, rounded up, and the people ordered, answered or not. */
  need: number
  people: number
}

/** Hours over what remains are a deviation only from one person of the shortest order: less than that is what a whole person gives. */
const coverState = (need: number, ordered: number, any: boolean, least: number): CoverState =>
  need <= 0 && !any ? 'none' : need - ordered > HOURS_NOISE ? 'short' : ordered - need < Math.max(HOURS_NOISE, least - 1e-6) ? 'ok' : 'over'

/**
 * I1: the cover of one competence on one day. For ordering, an order that waits for an answer counts as ordered (`state`);
 * for the Avvik only the confirmed count (`firm`), as they do in the Kalender.
 */
export const coverage = (rest: number, orders: HireOrder[], wd: WorkdaySettings): Coverage => {
  const need = Math.max(0, rest)
  let planned = 0
  let confirmed = 0
  let least = Infinity
  let leastConfirmed = Infinity
  let anyConfirmed = false
  let people = 0
  for (const order of orders) {
    const hours = hireHours(order, wd)
    planned += order.fte * hours
    people += order.fte
    least = Math.min(least, hours)
    if (isWaiting(order)) continue
    confirmed += order.fte * hours
    leastConfirmed = Math.min(leastConfirmed, hours)
    anyConfirmed = true
  }
  return {
    rest: need,
    planned,
    confirmed,
    remaining: need - planned,
    state: coverState(need, planned, orders.length > 0, least),
    left: need - confirmed,
    firm: coverState(need, confirmed, anyConfirmed, leastConfirmed),
    need: need > HOURS_NOISE ? Math.ceil(need / personDay(wd) - HOURS_NOISE) : 0,
    people,
  }
}

/** The hours a person gives on a normal day, the shift «Dag»: what Innleid counts the hours that remain in. */
export const personDay = (wd: WorkdaySettings): number => hireHours(shiftTimes('dag', wd), wd)

/** The figure a cover is shown with: the people missing as a negative number, those over as a positive one, `null` where neither. */
export const coverFigure = (cover: Coverage): number | null => (cover.people !== cover.need ? cover.people - cover.need : null)

/** The people missing over some days, where a day with more ordered than it needs makes up for none of another: what a line of Innleid shows in its label column. */
export const missingIn = (cover: (date: ISODate) => Coverage, days: ISODate[]): number => days.reduce((sum, date) => sum + Math.max(0, cover(date).need - cover(date).people), 0)

/** A rule between two orders is dropped where any order is this thin a share of the label: it would hide it. */
const THIN_SHARE = 0.04

/**
 * Innleid's label (`needLabel.ts`): the pieces it is filled with from the left, the rules between its orders, and
 * the figure. The label is what remains or what is ordered, whichever is more. Confirmed orders come first and
 * those that wait after them, whenever they were made, each supplier in the suppliers' order; what passes what
 * remains is the tail of over, and the figure is then on it. The figures are people (`Coverage.need`), the fill hours.
 */
export const orderedLabel = (cover: Coverage, orders: HireOrder[], wd: WorkdaySettings, suppliers: Supplier[] = []): NeedLabelParts => {
  const place = (id: string) => suppliers.findIndex((supplier) => supplier.id === id)
  const sorted = [...orders].sort((a, b) => Number(isWaiting(a)) - Number(isWaiting(b)) || place(a.supplierId) - place(b.supplierId))
  const hours = sorted.map((order) => order.fte * hireHours(order, wd))
  const base = Math.max(cover.rest, cover.planned) || 1
  const thin = sorted.length > 1 && Math.min(...hours) / base < THIN_SHARE
  const segs: NeedSegment[] = []
  const rules: number[] = []
  let at = 0
  sorted.forEach((order, i) => {
    const end = at + hours[i]
    const waits = isWaiting(order)
    const within = Math.min(end, cover.rest)
    if (within > at) segs.push({ kind: waits ? 'waiting' : 'covered', from: at / base, width: (within - at) / base })
    if (end > cover.rest + HOURS_NOISE) {
      const start = Math.max(at, cover.rest)
      segs.push({ kind: waits ? 'surplusWaiting' : 'surplus', from: start / base, width: (end - start) / base })
    }
    at = end
    if (i < sorted.length - 1 && !thin) rules.push(at / base)
  })
  const figure = coverFigure(cover)
  return { segs, rules, figure, alert: figure !== null && figure > 0, of: cover.need > 0 ? { done: cover.people, need: cover.need } : null }
}

type DeviationState = 'none' | 'under' | 'ok' | 'over'

interface Deviation {
  state: DeviationState
  /** Negative: the hours missing. Positive: the hours confirmed over what remains. */
  value: number
  /** The hours ordered that wait for an answer. */
  pending: number
}

/**
 * I2: a day's Avvik over its competences, after the permanent staff and the confirmed orders: what Faste and Innleid both
 * show. Hours missing in one competence are not made up for by hours over in another. Orders that wait count nowhere, and are given apart.
 */
export const deviation = (covers: Coverage[]): Deviation => {
  const pending = covers.reduce((sum, cover) => sum + cover.planned - cover.confirmed, 0)
  if (covers.every((cover) => cover.firm === 'none')) return { state: 'none', value: 0, pending }
  const short = covers.reduce((sum, cover) => sum + (cover.firm === 'short' ? cover.left : 0), 0)
  if (short > HOURS_NOISE) return { state: 'under', value: -short, pending }
  const over = covers.reduce((sum, cover) => sum + Math.max(0, -cover.left), 0)
  return { state: covers.some((cover) => cover.firm === 'over') ? 'over' : 'ok', value: over > HOURS_NOISE ? over : 0, pending }
}

const newId = () => `hire-${crypto.randomUUID()}`

/** What tells orders apart: a supplier's line (its shift), a competence, a project and a day. Times are not part of it, so new times leave an order on its line. */
type OrderKey = Pick<HireOrder, 'supplierId' | 'shift' | 'competence' | 'date' | 'projectNo'>
const sameOrder = (a: OrderKey, b: OrderKey) => a.supplierId === b.supplierId && a.shift === b.shift && a.competence === b.competence && a.date === b.date && sameProject(a, b)

/** I5: orders of the same supplier, shift, competence, project and day are one: their people add up, and it waits while one of them does. The first one's times stand. */
export const mergeOrders = (orders: HireOrder[]): HireOrder[] => {
  const merged: HireOrder[] = []
  for (const order of orders) {
    const index = merged.findIndex((other) => sameOrder(other, order))
    if (index < 0) merged.push(order)
    else {
      const first = merged[index]
      const asked = first.asked !== undefined || order.asked !== undefined ? (first.asked ?? first.fte) + (order.asked ?? order.fte) : undefined
      const { asked: _asked, ...rest } = first
      merged[index] = { ...rest, fte: first.fte + order.fte, conf: isWaiting(first) || isWaiting(order) ? null : first.fte + order.fte, ...(asked === undefined ? {} : { asked }) }
    }
  }
  return merged.length === orders.length ? orders : merged
}

/** A line of a competence that orders are made for: a project, or with no project the hours that are on none of the project lines. */
export interface HireLine {
  projectNo?: string
  /** The hours of the competence that remain on the line on a day after the permanent staff. */
  restOf: (date: ISODate) => number
  /** Whether an order of the competence covers the line. */
  holds: (order: HireOrder) => boolean
}

/** The orders with `change` made to those with the ids, merged again where two have become the same. */
const patch = (orders: HireOrder[], ids: string[], change: (order: HireOrder) => HireOrder): HireOrder[] => {
  const picked = new Set(ids)
  return mergeOrders(orders.map((order) => (picked.has(order.id) ? change(order) : order)))
}

const withoutAsked = ({ asked: _asked, ...order }: HireOrder): HireOrder => order

/** I6: the supplier has not answered. */
export const setWaiting = (orders: HireOrder[], ids: string[]): HireOrder[] => patch(orders, ids, (order) => (isWaiting(order) ? order : { ...order, conf: null }))

/** I6: the supplier sends the people asked for. */
export const confirmOrders = (orders: HireOrder[], ids: string[]): HireOrder[] => patch(orders, ids, (order) => (order.conf === order.fte ? order : { ...order, conf: order.fte }))

/**
 * I6: the supplier sends `people`, at most what was asked for. The order is confirmed with that many, what was asked
 * is kept beside it, and the hours of the rest are missing again. There is no half answer.
 */
export const confirmFewer = (orders: HireOrder[], ids: string[], people: number): HireOrder[] =>
  patch(orders, ids, (order) => {
    const asked = order.asked ?? order.fte
    const fte = Math.min(asked, Math.max(1, Math.round(people)))
    return fte === asked ? { ...withoutAsked(order), fte, conf: fte } : { ...order, asked, fte, conf: fte }
  })

/** I7: more or fewer people. More is a new question to the supplier, so the order waits again; fewer keeps a confirmed order confirmed. */
export const changeCount = (orders: HireOrder[], ids: string[], by: number): HireOrder[] =>
  patch(orders, ids, (order) => {
    const fte = Math.max(1, order.fte + by)
    if (fte === order.fte) return order
    return by > 0 ? { ...withoutAsked(order), fte, conf: null } : { ...order, fte, conf: isWaiting(order) ? null : fte }
  })

/** Another supplier, or other times, for some orders. They wait for an answer again: it is another question. */
export const changeOrders = (orders: HireOrder[], ids: string[], to: Partial<Pick<HireOrder, 'supplierId' | 'start' | 'end'>>): HireOrder[] =>
  patch(orders, ids, (order) => {
    const next = { ...order, ...to }
    return next.supplierId === order.supplierId && next.start === order.start && next.end === order.end ? order : { ...withoutAsked(next), conf: null }
  })

/** Other work for some orders: the project they are for, or none. The supplier's answer stands: the people are the same. */
export const tagOrders = (orders: HireOrder[], ids: string[], projectNo: string | null): HireOrder[] =>
  patch(orders, ids, (order) => {
    if (sameProject(order, { projectNo: projectNo ?? undefined })) return order
    const { projectNo: _was, ...rest } = order
    return projectNo ? { ...rest, projectNo } : rest
  })

export const removeOrders = (orders: HireOrder[], ids: string[]): HireOrder[] => {
  const picked = new Set(ids)
  return orders.some((order) => picked.has(order.id)) ? orders.filter((order) => !picked.has(order.id)) : orders
}

/** How late in the working day a time is, counted from six in the morning, so that a night shift comes last. */
const fromMorning = (minute: Minute) => (minute - 360 + DAY) % DAY

/** A supplier's orders as they are listed: by day, then in the planner's order of the competences, then by time. */
export const supplierOrders = (supplier: Supplier, orders: HireOrder[], competences: { key: CompetenceKey }[]): HireOrder[] => {
  const place = (key: CompetenceKey) => competences.findIndex((competence) => competence.key === key)
  return orders.filter((order) => order.supplierId === supplier.id).sort((a, b) => a.date.localeCompare(b.date) || place(a.competence) - place(b.competence) || fromMorning(a.start) - fromMorning(b.start))
}

/**
 * I9: a supplier's order as text, to send: a heading per day, and under it a line per competence and time, with the
 * project the people are for, which tells the supplier where they meet. `competences` are the competences in the
 * planner's order, with their names; `projectName` names a project by its number.
 */
export const orderText = (supplier: Supplier, orders: HireOrder[], competences: { key: CompetenceKey; label: string }[], projectName: (projectNo: string) => string = (projectNo) => projectNo): string => {
  const lines = [`Bestilling – ${supplier.name}`]
  let day = ''
  for (const order of supplierOrders(supplier, orders, competences)) {
    if (order.date !== day) lines.push(dayText(order.date))
    day = order.date
    const label = competences.find((competence) => competence.key === order.competence)?.label ?? order.competence
    lines.push(`  ${label}${order.projectNo ? ` · ${projectName(order.projectNo)}` : ''}: ${order.fte} pers. ${SHIFT_LABELS[order.shift]} ${timesText(order)}`)
  }
  return lines.join('\n')
}

/** A supplier as the control panel of Innleid lists it: its orders, those that wait among them, and the first day one of them waits. */
export interface SupplierReview {
  supplier: Supplier
  orders: HireOrder[]
  waiting: HireOrder[]
  firstWaiting: ISODate | null
}

/**
 * The suppliers to look over and confirm, each with its orders in order (`supplierOrders`): those with orders that wait first,
 * the one that waits soonest at the top, then those that are all confirmed, in the suppliers' order. Suppliers with no orders are left out.
 */
export const supplierReview = (suppliers: Supplier[], orders: HireOrder[], competences: { key: CompetenceKey }[]): SupplierReview[] =>
  suppliers
    .map((supplier) => {
      const own = supplierOrders(supplier, orders, competences)
      const waiting = own.filter(isWaiting)
      return { supplier, orders: own, waiting, firstWaiting: waiting[0]?.date ?? null }
    })
    .filter((review) => review.orders.length)
    .sort((a, b) => (a.firstWaiting && b.firstWaiting ? a.firstWaiting.localeCompare(b.firstWaiting) : a.firstWaiting ? -1 : b.firstWaiting ? 1 : 0))

/**
 * What a change of the orders (a stroke, a move, a pulled end) does to the hours ordered: those of the orders it adds or
 * changes less those of the orders it takes away or changes, waiting or not. The pill over a stroke shows it.
 */
export const hoursChange = (before: HireOrder[], after: HireOrder[], wd: WorkdaySettings): number => {
  const was = new Set(before)
  const is = new Set(after)
  const hours = (list: HireOrder[], skip: Set<HireOrder>) => list.reduce((sum, order) => sum + (skip.has(order) ? 0 : order.fte * hireHours(order, wd)), 0)
  return hours(after, was) - hours(before, is)
}

/** I10: the hours ordered that wait for an answer. */
export const waitingHours = (orders: HireOrder[], wd: WorkdaySettings): number => orders.reduce((sum, order) => sum + (isWaiting(order) ? order.fte * hireHours(order, wd) : 0), 0)

/** Innleid over a period: the cover of each competence on each day, and each day's Avvik. */
export interface HireBoard {
  /** The competences with hours that remain or with orders somewhere in the period, in the order given. */
  competences: CompetenceKey[]
  /** The cover of a competence on a day; a day with neither hours that remain nor orders is `none`. */
  cover: (competence: CompetenceKey, date: ISODate) => Coverage
  /** The days with hours that remain or with orders. */
  deviations: Map<ISODate, Deviation>
  /** The days where hours are missing that nothing is ordered for, waiting or confirmed, in order. */
  underDays: ISODate[]
}

/** The key of a competence on a day, in the maps of the board. */
export const dayKey = (competence: CompetenceKey, date: ISODate): string => `${competence}|${date}`

/** The orders per competence and day, by `dayKey`. */
export const ordersByDay = (orders: HireOrder[]): Map<string, HireOrder[]> => {
  const map = new Map<string, HireOrder[]>()
  for (const order of orders) pushTo(map, dayKey(order.competence, order.date), order)
  return map
}

const NO_COVER: Coverage = { rest: 0, planned: 0, confirmed: 0, remaining: 0, state: 'none', left: 0, firm: 'none', need: 0, people: 0 }

/**
 * The board of Innleid. `restOf` gives the hours of a competence that remain on a day after the permanent staff:
 * the demand of the plan less what they are assigned, never less than nothing.
 */
export const hireBoard = (competences: CompetenceKey[], dates: ISODate[], restOf: (competence: CompetenceKey, date: ISODate) => number, orders: HireOrder[], wd: WorkdaySettings): HireBoard => {
  const ordered = ordersByDay(orders)
  const covers = new Map<string, Coverage>()
  const active = new Set<CompetenceKey>()
  const perDay = new Map<ISODate, Coverage[]>()
  for (const competence of competences) {
    for (const date of dates) {
      const key = dayKey(competence, date)
      const rest = restOf(competence, date)
      const list = ordered.get(key)
      if (rest <= HOURS_NOISE && !list) continue
      const cover = coverage(rest, list ?? [], wd)
      covers.set(key, cover)
      active.add(competence)
      pushTo(perDay, date, cover)
    }
  }
  const deviations = new Map([...perDay].map(([date, list]) => [date, deviation(list)]))
  return {
    competences: competences.filter((competence) => active.has(competence)),
    cover: (competence, date) => covers.get(dayKey(competence, date)) ?? NO_COVER,
    deviations,
    underDays: dates.filter((date) => perDay.get(date)?.some((cover) => cover.state === 'short')),
  }
}

/**
 * The people ordered as FTE per day, for the Kalender's «Tilgjengelig»: the paid hours of the orders over the hours of an
 * FTE-day, summed over the competences. Confirmed orders count; those that wait are given apart, and count nowhere.
 * An order through the night counts on the day it starts.
 */
export const hiredFte = ({ hireOrders, settings }: Pick<Workspace, 'hireOrders' | 'settings'>): { confirmed: DayValues; waiting: DayValues } => {
  const confirmed: DayValues = {}
  const waiting: DayValues = {}
  for (const order of hireOrders ?? []) {
    const days = isWaiting(order) ? waiting : confirmed
    days[order.date] = (days[order.date] ?? 0) + (order.fte * hireHours(order, settings.workday)) / settings.hoursPerDay
  }
  for (const days of [confirmed, waiting]) for (const date in days) days[date] = Math.round(days[date] * 100) / 100
  return { confirmed, waiting }
}

/** The confirmed orders as a staffing line of the Kalender, added to «Tilgjengelig». It is worked out, never stored, and cannot be typed in. */
const HIRED_LINE_ID = 'hired:innleid'
export const hiredLine = (confirmed: DayValues): CapacityLine => ({ id: HIRED_LINE_ID, label: 'Innleid', group: 'added', values: confirmed })

/** What a supplier is ordered for, together: for the head of its order. */
interface SupplierTotals {
  /** People, a person counted once per day. */
  people: number
  hours: number
  /** The hours at the supplier's rate, in kroner; `null` where it has no rate. */
  cost: number | null
  /** Orders confirmed, and orders that wait. */
  confirmed: number
  waiting: number
}

export const supplierTotals = (supplier: Supplier, orders: HireOrder[], wd: WorkdaySettings): SupplierTotals => {
  const own = orders.filter((order) => order.supplierId === supplier.id)
  const hours = own.reduce((sum, order) => sum + order.fte * hireHours(order, wd), 0)
  const waiting = own.filter(isWaiting).length
  return { people: own.reduce((sum, order) => sum + order.fte, 0), hours, cost: supplier.rate ? hours * supplier.rate : null, confirmed: own.length - waiting, waiting }
}

/*
 * Orders painted on the suppliers' lines, as Faste paints blocks on people (the Claude Doc «Innleid på leverandørlinjer:
 * byggeplan», 2026-10-26): a line per supplier and shift, the brush a competence and maybe a project with a count of people.
 */

/** Of what a supplier is ordered for on a day, the people of one competence, and of them those that wait for an answer. */
export interface SupplierPart {
  competence: string
  people: number
  waiting: number
}

/** What a supplier is ordered for on a day, over its shifts and competences: people and paid hours, in all, and of them what waits for an answer; and the people per competence, in the order they were first ordered. */
export interface SupplierDay {
  people: number
  waiting: number
  hours: number
  waitingHours: number
  parts: SupplierPart[]
}

/** What each supplier is ordered for per day, for its name line and its week: by supplier, then by date. */
export const supplierDays = (orders: HireOrder[], wd: WorkdaySettings): Map<string, Map<ISODate, SupplierDay>> => {
  const map = new Map<string, Map<ISODate, SupplierDay>>()
  for (const order of orders) {
    const days = map.get(order.supplierId) ?? new Map<ISODate, SupplierDay>()
    const day = days.get(order.date) ?? { people: 0, waiting: 0, hours: 0, waitingHours: 0, parts: [] }
    const hours = order.fte * hireHours(order, wd)
    const waiting = isWaiting(order) ? order.fte : 0
    const part = day.parts.find((one) => one.competence === order.competence)
    const parts = part ? day.parts.map((one) => (one === part ? { ...one, people: one.people + order.fte, waiting: one.waiting + waiting } : one)) : [...day.parts, { competence: order.competence, people: order.fte, waiting }]
    days.set(order.date, { people: day.people + order.fte, waiting: day.waiting + waiting, hours: day.hours + hours, waitingHours: day.waitingHours + (waiting ? hours : 0), parts })
    map.set(order.supplierId, days)
  }
  return map
}

/** A line of a supplier: one of its shifts. */
export interface SupplierLine {
  /** `lineKey`. */
  key: string
  supplierId: string
  shift: ShiftId
  /** The supplier offers the shift. A shift it no longer offers keeps its line while it has orders. */
  offered: boolean
  /** The competences ordered on the line that the supplier no longer offers. */
  stale: CompetenceKey[]
}

/** Where on the suppliers' lines: a supplier's shift. */
export type LineRef = Pick<SupplierLine, 'supplierId' | 'shift'>
/** A day on a supplier's line. */
export type LineDay = LineRef & { date: ISODate }

export const lineKey = (supplierId: string, shift: ShiftId): string => `${supplierId}|${shift}`

/** A supplier's lines: the shifts it offers in the order of the day, and one it no longer offers while that has orders. */
export const supplierLines = (supplier: Supplier, orders: HireOrder[]): SupplierLine[] => {
  const own = orders.filter((order) => order.supplierId === supplier.id)
  return SHIFT_IDS.filter((shift) => supplier.shifts.includes(shift) || own.some((order) => order.shift === shift)).map((shift) => ({
    key: lineKey(supplier.id, shift),
    supplierId: supplier.id,
    shift,
    offered: supplier.shifts.includes(shift),
    stale: [...new Set(own.filter((order) => order.shift === shift && !supplier.competences.includes(order.competence)).map((order) => order.competence))],
  }))
}

/** The days a stroke fills: its working days, or every one of them where it has none, as Faste's brush (`onlyOffDays`). */
export const strokeDays = (dates: ISODate[]): ISODate[] => {
  const work = dates.filter((date) => dayType(date) === 'arbeidsdag')
  return work.length ? work : dates
}

/** I7 for a count set anew: more people is a new question, so the order waits again; fewer keeps a confirmed order confirmed. What was asked is forgotten. */
const recount = (order: HireOrder, fte: number): HireOrder => {
  if (fte === order.fte) return order
  return fte > order.fte ? { ...withoutAsked(order), fte, conf: null } : { ...withoutAsked(order), fte, conf: isWaiting(order) ? null : fte }
}

/** What a stroke of the brush orders: its competence, for its project or none, on the lines and the days it goes over. */
export interface Paint {
  lines: LineRef[]
  competence: CompetenceKey
  projectNo?: string
  dates: ISODate[]
  /** The people on the brush, or `'auto'`: on each day as many whole people of the line's shift as cover what is still missing (2026-10-27). */
  count: number | 'auto'
  /** With `'auto'`: the hours of the competence (of the project, where one is given) that remain on a day after the permanent staff. */
  need?: (date: ISODate) => number
}

/**
 * The brush's count on every day of the stroke and every line it goes over, at the shift's times, or with Auto the people
 * each day lacks (`Paint.count`), and nothing on a day that lacks none. An order that is there on the same key gets the
 * count (`recount`), so a second stroke corrects the first. A line of a supplier that does not
 * offer the competence is skipped, and counted.
 */
export const paintOrders = (orders: HireOrder[], paint: Paint, suppliers: Supplier[], wd: WorkdaySettings, makeId: () => string = newId): { orders: HireOrder[]; skipped: number } => {
  const days = strokeDays(paint.dates)
  const fixed = paint.count === 'auto' ? 0 : Math.max(1, Math.round(paint.count))
  // Auto: what is missing on the day after every other order of the competence (and the project), waiting or not, in the people
  // of the line's shift, rounded up; lines painted before in the stroke count, so the first takes what is missing and the rest none.
  const peopleFor = (key: OrderKey, next: HireOrder[]) => {
    if (paint.count !== 'auto') return fixed
    const others = next.filter((order) => order.competence === key.competence && order.date === key.date && (!paint.projectNo || sameProject(order, paint)) && !sameOrder(order, key))
    const left = (paint.need?.(key.date) ?? 0) - others.reduce((sum, order) => sum + order.fte * hireHours(order, wd), 0)
    return left > HOURS_NOISE ? Math.ceil(left / hireHours(shiftTimes(key.shift, wd), wd) - HOURS_NOISE) : 0
  }
  const next = [...orders]
  let changed = false
  let skipped = 0
  for (const line of paint.lines) {
    if (!suppliers.find((supplier) => supplier.id === line.supplierId)?.competences.includes(paint.competence)) {
      skipped++
      continue
    }
    for (const date of days) {
      const key: OrderKey = { supplierId: line.supplierId, shift: line.shift, competence: paint.competence, date, ...projectTag(paint) }
      const fte = peopleFor(key, next)
      if (!fte) continue
      const at = next.findIndex((order) => sameOrder(order, key))
      if (at < 0) next.push({ id: makeId(), ...key, fte, ...shiftTimes(line.shift, wd), conf: null })
      else if (recount(next[at], fte) !== next[at]) next[at] = recount(next[at], fte)
      else continue
      changed = true
    }
  }
  return { orders: changed ? next : orders, skipped }
}

/**
 * The orders without those on the days of the lines: with `only`, of that competence and project alone, as a stroke of
 * Tøm that starts on its lane and Delete on a chosen run take; without, all of them, as a stroke with Shift, one from an
 * empty place, and Alt take, which empty the days as Faste's do (`clearDays`).
 */
export const clearOrders = (orders: HireOrder[], cells: LineDay[], only?: Pick<HireOrder, 'competence' | 'projectNo'>): HireOrder[] => {
  const keys = new Set(cells.map((cell) => `${lineKey(cell.supplierId, cell.shift)}|${cell.date}`))
  const gone = (order: HireOrder) =>
    keys.has(`${lineKey(order.supplierId, order.shift)}|${order.date}`) && (!only || (order.competence === only.competence && sameProject(order, only)))
  return orders.some(gone) ? orders.filter((order) => !gone(order)) : orders
}

/** An order to put somewhere: what it is, without the answer, which a placed order waits for. */
type Placing = Omit<HireOrder, 'id' | 'conf' | 'asked' | 'engine'>

/**
 * Orders put on lines by a paste or a move: each takes the place of what is on its key, and waits. One for a competence
 * its supplier does not offer is skipped. Returns which were placed, by their place in `items`.
 */
const placeOrders = (orders: HireOrder[], items: Placing[], suppliers: Supplier[], makeId: () => string): { orders: HireOrder[]; placed: boolean[] } => {
  const placed = items.map((item) => !!suppliers.find((supplier) => supplier.id === item.supplierId)?.competences.includes(item.competence))
  const put = items.filter((_, i) => placed[i])
  if (!put.length) return { orders, placed }
  const kept = orders.filter((order) => !put.some((item) => sameOrder(order, item)))
  return { orders: [...kept, ...put.map((item) => ({ id: makeId(), ...item, conf: null }))], placed }
}

/**
 * An order on another line: the line's shift, with the order's own times where the shift is the same and the shift's
 * where it is not. It is a new question, for as many as were asked the first time («2/3» asks for 3).
 */
const onLine = (order: HireOrder, to: LineDay, wd: WorkdaySettings): Placing => {
  const { id: _id, conf: _conf, asked, engine: _engine, ...rest } = order
  return { ...rest, fte: asked ?? order.fte, supplierId: to.supplierId, shift: to.shift, date: to.date, ...(to.shift === order.shift ? {} : shiftTimes(to.shift, wd)) }
}

/** Orders copied from days on lines, each with how far its line and day are from the first of them. */
export interface OrderClip {
  items: { line: number; day: number; order: HireOrder }[]
}

/** The orders on some lines over some days, to paste: `null` where there are none. */
export const copyOrders = (orders: HireOrder[], lines: LineRef[], dates: ISODate[]): OrderClip | null => {
  const items: OrderClip['items'] = []
  for (const order of orders) {
    const line = lines.findIndex((one) => one.supplierId === order.supplierId && one.shift === order.shift)
    const day = dates.indexOf(order.date)
    if (line >= 0 && day >= 0) items.push({ line, day, order })
  }
  return items.length ? { items } : null
}

/**
 * The orders copied, pasted on `lines` (from the line under the pointer down) over `dates` (from the day under it on).
 * What lands past the last line or day, or on a supplier that does not offer the competence, is skipped.
 */
export const pasteOrders = (orders: HireOrder[], clip: OrderClip, lines: LineRef[], dates: ISODate[], suppliers: Supplier[], wd: WorkdaySettings, makeId: () => string = newId): { orders: HireOrder[]; pasted: number; skipped: number } => {
  const landing = clip.items.filter((item) => lines[item.line] && dates[item.day])
  const placing = landing.map((item) => onLine(item.order, { ...lines[item.line], date: dates[item.day] }, wd))
  const result = placeOrders(orders, placing, suppliers, makeId)
  const pasted = result.placed.filter(Boolean).length
  return { orders: result.orders, pasted, skipped: clip.items.length - pasted }
}

/** A day's orders on a line moved to another day or line, or copied with `copy`, as Faste moves a day's blocks (`moveDay`). An order that cannot go stays. */
export const moveOrders = (orders: HireOrder[], from: LineDay, to: LineDay, copy: boolean, suppliers: Supplier[], wd: WorkdaySettings, makeId: () => string = newId): { orders: HireOrder[]; moved: number; skipped: number } => {
  const same = from.supplierId === to.supplierId && from.shift === to.shift && from.date === to.date
  const moving = orders.filter((order) => order.supplierId === from.supplierId && order.shift === from.shift && order.date === from.date)
  if (same || !moving.length) return { orders, moved: 0, skipped: 0 }
  const left = copy ? orders : orders.filter((order) => !moving.includes(order))
  const result = placeOrders(left, moving.map((order) => onLine(order, to, wd)), suppliers, makeId)
  const stays = moving.filter((_, i) => !result.placed[i])
  const moved = moving.length - stays.length
  return { orders: copy || !stays.length ? result.orders : [...result.orders, ...stays], moved, skipped: stays.length }
}

/** The lane of a run on a shift line, as text for a mark on the page: its competence and project. */
export const laneOf = (order: Pick<HireOrder, 'competence' | 'projectNo'>): string => `${order.competence}|${order.projectNo?.trim() ?? ''}`
/** A lane's competence and project again, from `laneOf`. */
export const laneFrom = (lane: string): Pick<HireOrder, 'competence' | 'projectNo'> => {
  const [competence, projectNo] = lane.split('|')
  return { competence, ...(projectNo && { projectNo }) }
}

/** Days in a row on a line with one order of the same competence, project, people, times and answer: drawn as one, «Snekker · 3 pers. · 4 d». */
export interface OrderRun {
  /** The run's lane on its line, from the top: one per competence and project ordered on the line. */
  lane: number
  competence: CompetenceKey
  projectNo?: string
  fte: number
  start: Minute
  end: Minute
  waits: boolean
  from: ISODate
  to: ISODate
  /** The orders of the run, a day each, in order. */
  orders: HireOrder[]
}

/** A line's orders as runs, each in its lane. */
export interface LineRuns {
  /** The lanes from the top: competences in the planner's order, then projects. */
  lanes: { competence: CompetenceKey; projectNo?: string }[]
  /** The runs as they are drawn: an empty day breaks one, a weekend too. */
  runs: OrderRun[]
  /** The runs as an end is taken hold of and pulled: only an empty working day breaks one (`overOffDays` in Faste). */
  grips: OrderRun[]
}

const laneKey = (order: Pick<HireOrder, 'competence' | 'projectNo'>) => `${order.competence}|${(order.projectNo ?? '').trim().toLowerCase()}`
const sameRun = (a: HireOrder, b: HireOrder) => a.fte === b.fte && a.start === b.start && a.end === b.end && isWaiting(a) === isWaiting(b) && a.asked === b.asked

/**
 * The orders of one line over the days, as runs in lanes. `rank` places a competence in the planner's order, so that
 * a run keeps its lane from day to day and two competences on a day lie one above the other.
 */
export const orderRuns = (lineOrders: HireOrder[], dates: ISODate[], rank: (competence: CompetenceKey) => number): LineRuns => {
  const inView = new Set(dates)
  const byLane = new Map<string, Map<ISODate, HireOrder>>()
  const lanes: LineRuns['lanes'] = []
  for (const order of lineOrders) {
    if (!inView.has(order.date)) continue
    const key = laneKey(order)
    if (!byLane.has(key)) {
      byLane.set(key, new Map())
      lanes.push({ competence: order.competence, ...projectTag(order) })
    }
    byLane.get(key)!.set(order.date, order)
  }
  lanes.sort((a, b) => rank(a.competence) - rank(b.competence) || (a.projectNo ?? '').localeCompare(b.projectNo ?? ''))
  const walk = (overOffDays: boolean): OrderRun[] => {
    const runs: OrderRun[] = []
    lanes.forEach((lane, at) => {
      const days = byLane.get(laneKey(lane))!
      let run: OrderRun | null = null
      for (const date of dates) {
        const order = days.get(date)
        if (!order) {
          if (!(overOffDays && dayType(date) !== 'arbeidsdag')) run = null
          continue
        }
        if (run && sameRun(run.orders[0], order)) {
          run.orders.push(order)
          run.to = date
          continue
        }
        run = { lane: at, competence: order.competence, ...projectTag(order), fte: order.fte, start: order.start, end: order.end, waits: isWaiting(order), from: date, to: date, orders: [order] }
        runs.push(run)
      }
    })
    return runs
  }
  return { lanes, runs: walk(false), grips: walk(true) }
}

/**
 * A run pulled by an end to `to` (`grips` of `orderRuns`): outward, its order on the new days as a stroke has them
 * (`strokeDays`), waiting, as it is a new question; inward, its orders past `to` removed. The day at the other end always stays.
 */
export const stretchOrders = (orders: HireOrder[], run: OrderRun, edge: 'start' | 'end', to: ISODate, dates: ISODate[], suppliers: Supplier[], makeId: () => string = newId): HireOrder[] => {
  const outward = edge === 'end' ? to > run.to : to < run.from
  if (outward) {
    const added = dates.filter((date) => (edge === 'end' ? date > run.to && date <= to : date >= to && date < run.from))
    const template = run.orders[0]
    const { id: _id, conf: _conf, asked: _asked, engine: _engine, ...rest } = template
    return placeOrders(orders, strokeDays(added).map((date) => ({ ...rest, date })), suppliers, makeId).orders
  }
  const keep = (order: HireOrder) => (edge === 'end' ? order.date <= (to < run.from ? run.from : to) : order.date >= (to > run.to ? run.to : to))
  const gone = new Set(run.orders.filter((order) => !keep(order)).map((order) => order.id))
  return gone.size ? orders.filter((order) => !gone.has(order.id)) : orders
}

/** A line of a competence's demand in Innleid: a project, or with none the hours on none of them, which comes last. */
export interface ShareLine {
  /** The hours of the competence that remain on the line on the day after the permanent staff. */
  rest: number
  /** An order for a project is the line's own. */
  own: (order: HireOrder) => boolean
}

/**
 * The orders of a competence on a day as its lines count them, as Faste shares its blocks (`buildProjectBalance`): each
 * line its own orders, and those for no project a person at a time to the line that lacks the most after what it has,
 * the confirmed before the waiting, as `shareOverDays` gives whole people first. What none of the lines lacks goes to
 * the last. A share is the order with some of its people, so the label and the cover are worked out as for any.
 */
export const shareOrders = (lines: ShareLine[], orders: HireOrder[], wd: WorkdaySettings): HireOrder[][] => {
  const tagged = (order: HireOrder) => !!order.projectNo?.trim()
  const shares = lines.map((line) => orders.filter((order) => tagged(order) && line.own(order)))
  const untagged = orders.filter((order) => !tagged(order))
  if (!untagged.length || !lines.length) return shares
  const lacking = lines.map((line, i) => line.rest - shares[i].reduce((sum, order) => sum + order.fte * hireHours(order, wd), 0))
  const given = lines.map(() => new Map<HireOrder, number>())
  for (const order of [...untagged.filter((one) => !isWaiting(one)), ...untagged.filter(isWaiting)]) {
    const hours = hireHours(order, wd)
    for (let left = order.fte; left > 1e-9; left -= 1) {
      const people = Math.min(1, left)
      const most = lacking.reduce((best, lack, i) => (lack > lacking[best] ? i : best), 0)
      const to = lacking[most] > 1e-9 ? most : lines.length - 1
      lacking[to] -= people * hours
      given[to].set(order, (given[to].get(order) ?? 0) + people)
    }
  }
  return shares.map((list, i) => [...list, ...[...given[i]].map(([order, fte]) => (fte === order.fte ? order : { ...order, fte }))])
}
