import { dayOfMonth, monthShort, weekdayIndex, WEEKDAYS_NB, type ISODate } from './dates'
import { SHIFT_IDS, type CapacityLine, type CompetenceKey, type DayValues, type HireOrder, type Interval, type Minute, type ShiftId, type Supplier, type WorkdaySettings, type Workspace } from './types'

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

/** When an order is worked, as a line of the editor names it: its shift, or its own times. */
export const shiftText = (times: Interval, wd: WorkdaySettings): string => {
  const shift = shiftOf(times, wd)
  return shift ? SHIFT_LABELS[shift] : timesText(times)
}

/** The length of an order's time, which goes through the night where its end is not after its start. */
const hireMinutes = ({ start, end }: Interval): Minute => (end > start ? end - start : end + DAY - start)

/** The paid hours one person has in an order: its length, less a lunch break as long as the normal day's when it lasts six hours or more. */
export const hireHours = (times: Interval, wd: WorkdaySettings): number => {
  const minutes = hireMinutes(times)
  return (minutes - (minutes >= 360 ? wd.breakEnd - wd.breakStart : 0)) / 60
}

export const isWaiting = (order: HireOrder): boolean => order.conf === null

export type CoverState = 'none' | 'short' | 'ok' | 'over'

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
}

/**
 * I1: the cover of one competence on one day. An order that waits for an answer counts as ordered. Hours over
 * what remains are a deviation only from one person of the shortest order: less than that is what a whole person gives.
 */
export const coverage = (rest: number, orders: HireOrder[], wd: WorkdaySettings): Coverage => {
  const need = Math.max(0, rest)
  let planned = 0
  let confirmed = 0
  let least = Infinity
  for (const order of orders) {
    const hours = hireHours(order, wd)
    planned += order.fte * hours
    if (!isWaiting(order)) confirmed += order.fte * hours
    least = Math.min(least, hours)
  }
  const remaining = need - planned
  const state: CoverState = need <= 0 && !orders.length ? 'none' : remaining > HOURS_NOISE ? 'short' : -remaining < Math.max(HOURS_NOISE, least - 1e-6) ? 'ok' : 'over'
  return { rest: need, planned, confirmed, remaining, state }
}

/** I1: how much of what remains is confirmed, and how much waits for an answer, as shares of it that together are at most the whole. */
export const coverShares = (cover: Coverage): { confirmed: number; waiting: number } => {
  if (!(cover.rest > 0)) return { confirmed: 0, waiting: 0 }
  const confirmed = Math.min(1, cover.confirmed / cover.rest)
  return { confirmed, waiting: Math.min(1 - confirmed, (cover.planned - cover.confirmed) / cover.rest) }
}

/** The figure a cover is shown with: the hours missing as a negative number, the hours over as a positive one, `null` where neither. */
export const coverFigure = (cover: Coverage): number | null => (Math.abs(cover.remaining) > HOURS_NOISE ? -cover.remaining : null)

export type DeviationState = 'none' | 'under' | 'ok' | 'over'

export interface Deviation {
  state: DeviationState
  /** Negative: the hours missing. Positive: the hours ordered over what remains. */
  value: number
  /** The hours ordered that wait for an answer. */
  pending: number
}

/** I2: a day's Avvik over its competences. Hours missing in one competence are not made up for by hours over in another. */
export const deviation = (covers: Coverage[]): Deviation => {
  const pending = covers.reduce((sum, cover) => sum + cover.planned - cover.confirmed, 0)
  if (covers.every((cover) => cover.state === 'none')) return { state: 'none', value: 0, pending }
  const short = covers.reduce((sum, cover) => sum + (cover.state === 'short' ? cover.remaining : 0), 0)
  if (short > HOURS_NOISE) return { state: 'under', value: -short, pending }
  const over = covers.reduce((sum, cover) => sum + Math.max(0, -cover.remaining), 0)
  return { state: covers.some((cover) => cover.state === 'over') ? 'over' : 'ok', value: over > HOURS_NOISE ? over : 0, pending }
}

const newId = () => `hire-${crypto.randomUUID()}`

const sameOrder = (a: HireOrder, b: HireOrder) => a.supplierId === b.supplierId && a.competence === b.competence && a.date === b.date && a.start === b.start && a.end === b.end

/** I5: orders of the same supplier, competence, day and time are one: their people add up, and it waits while one of them does. */
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

const ordersOf = (orders: HireOrder[], competence: CompetenceKey, date: ISODate) => orders.filter((order) => order.competence === competence && order.date === date)

/**
 * I3: the orders a supplier is given for a competence over some days, each with the people that cover what is missing.
 * The shift is the supplier's first that it is not ordered for on those days already. Only the days that are short are
 * ordered; where none is and `strict` is not set, every day gets one person, as an extra supplier.
 * `restOf` gives the hours that remain of the competence on a day after the permanent staff.
 */
export const planOrders = (orders: HireOrder[], supplier: Supplier, competence: CompetenceKey, dates: ISODate[], restOf: (date: ISODate) => number, wd: WorkdaySettings, strict = false, makeId: () => string = newId): HireOrder[] => {
  if (!supplier.competences.includes(competence) || !supplier.shifts.length) return []
  const taken = new Set(orders.filter((order) => order.supplierId === supplier.id && order.competence === competence && dates.includes(order.date)).map((order) => shiftOf(order, wd)))
  const times = shiftTimes(supplier.shifts.find((shift) => !taken.has(shift)) ?? supplier.shifts[0], wd)
  const hours = hireHours(times, wd)
  const missing = new Map(dates.map((date) => [date, coverage(restOf(date), ordersOf(orders, competence, date), wd)]))
  const short = dates.filter((date) => missing.get(date)!.state === 'short')
  const days = short.length ? short : strict ? [] : dates
  return days.map((date) => ({ id: makeId(), supplierId: supplier.id, competence, date, fte: Math.max(1, Math.ceil(Math.max(0, missing.get(date)!.remaining) / hours - 1e-6)), ...times, conf: null }))
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

export const removeOrders = (orders: HireOrder[], ids: string[]): HireOrder[] => {
  const picked = new Set(ids)
  return orders.some((order) => picked.has(order.id)) ? orders.filter((order) => !picked.has(order.id)) : orders
}

/** I4: the orders without those of a competence on some days: of every supplier, or of the one given. */
export const eraseOrders = (orders: HireOrder[], competence: CompetenceKey, dates: ISODate[], supplierId?: string): HireOrder[] => {
  const days = new Set(dates)
  const gone = (order: HireOrder) => order.competence === competence && days.has(order.date) && (supplierId === undefined || order.supplierId === supplierId)
  return orders.some(gone) ? orders.filter((order) => !gone(order)) : orders
}

/** The orders of one supplier at one time, over the days that are picked: a line of the editor. */
export interface OrderGroup {
  key: string
  supplierId: string
  start: Minute
  end: Minute
  orders: HireOrder[]
}

/** What tells the lines of the editor apart: a supplier and a time. */
export const groupKey = (supplierId: string, times: Interval): string => `${supplierId}|${times.start}|${times.end}`

/** How late in the working day a time is, counted from six in the morning, so that a night shift comes last. */
const fromMorning = (minute: Minute) => (minute - 360 + DAY) % DAY

/** I8: the orders of a competence on the days that are picked, gathered by supplier and time, in the suppliers' order and then by time. */
export const orderGroups = (orders: HireOrder[], suppliers: Supplier[]): OrderGroup[] => {
  const groups = new Map<string, OrderGroup>()
  for (const order of orders) {
    const key = groupKey(order.supplierId, order)
    if (!groups.has(key)) groups.set(key, { key, supplierId: order.supplierId, start: order.start, end: order.end, orders: [] })
    groups.get(key)!.orders.push(order)
  }
  const place = (id: string) => suppliers.findIndex((supplier) => supplier.id === id)
  return [...groups.values()].sort((a, b) => place(a.supplierId) - place(b.supplierId) || fromMorning(a.start) - fromMorning(b.start))
}

/** A group waits while one of its orders does. */
export const groupWaits = (group: OrderGroup): boolean => group.orders.some(isWaiting)

/** I8, «Fyll»: the group's order on the days it lacks one, with the number of people it has on most of its days (the median). */
export const fillGroup = (group: OrderGroup, competence: CompetenceKey, dates: ISODate[], makeId: () => string = newId): HireOrder[] => {
  const counts = group.orders.map((order) => order.fte).sort((a, b) => a - b)
  const fte = counts[Math.floor(counts.length / 2)]
  const have = new Set(group.orders.map((order) => order.date))
  return dates.filter((date) => !have.has(date)).map((date) => ({ id: makeId(), supplierId: group.supplierId, competence, date, fte, start: group.start, end: group.end, conf: null }))
}

/** A supplier's orders as they are listed: by day, then in the planner's order of the competences, then by time. */
export const supplierOrders = (supplier: Supplier, orders: HireOrder[], competences: { key: CompetenceKey }[]): HireOrder[] => {
  const place = (key: CompetenceKey) => competences.findIndex((competence) => competence.key === key)
  return orders.filter((order) => order.supplierId === supplier.id).sort((a, b) => a.date.localeCompare(b.date) || place(a.competence) - place(b.competence) || fromMorning(a.start) - fromMorning(b.start))
}

/**
 * I9: a supplier's order as text, to send: a heading per day, and under it a line per competence and time.
 * `competences` are the competences in the planner's order, with their names.
 */
export const orderText = (supplier: Supplier, orders: HireOrder[], competences: { key: CompetenceKey; label: string }[]): string => {
  const lines = [`Bestilling – ${supplier.name}`]
  let day = ''
  for (const order of supplierOrders(supplier, orders, competences)) {
    if (order.date !== day) lines.push(`${WEEKDAYS_NB[weekdayIndex(order.date)].toLowerCase()} ${dayOfMonth(order.date)}. ${monthShort(order.date)}`)
    day = order.date
    lines.push(`  ${competences.find((competence) => competence.key === order.competence)?.label ?? order.competence}: ${order.fte} pers. ${timesText(order)}`)
  }
  return lines.join('\n')
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
  /** The days where hours are missing, in order. */
  underDays: ISODate[]
}

/** The key of a competence on a day, in the maps of the board. */
export const dayKey = (competence: CompetenceKey, date: ISODate): string => `${competence}|${date}`

/** The orders per competence and day, by `dayKey`. */
export const ordersByDay = (orders: HireOrder[]): Map<string, HireOrder[]> => {
  const map = new Map<string, HireOrder[]>()
  for (const order of orders) {
    const key = dayKey(order.competence, order.date)
    const list = map.get(key)
    if (list) list.push(order)
    else map.set(key, [order])
  }
  return map
}

const NO_COVER: Coverage = { rest: 0, planned: 0, confirmed: 0, remaining: 0, state: 'none' }

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
      perDay.set(date, [...(perDay.get(date) ?? []), cover])
    }
  }
  const deviations = new Map([...perDay].map(([date, list]) => [date, deviation(list)]))
  return {
    competences: competences.filter((competence) => active.has(competence)),
    cover: (competence, date) => covers.get(dayKey(competence, date)) ?? NO_COVER,
    deviations,
    underDays: dates.filter((date) => deviations.get(date)?.state === 'under'),
  }
}

/** What a day of a competence shows of its orders: a chip per supplier, or per supplier and time. */
export interface OrderChip {
  key: string
  supplierId: string
  /** The people of the chip's orders together. */
  fte: number
  waits: boolean
  orders: HireOrder[]
}

/**
 * The chips of one competence on one day, in the suppliers' order: a supplier's times merged into one chip, with
 * its people summed, or with `perTime` a chip per time, as the lines of the editor are.
 */
export const dayChips = (orders: HireOrder[], suppliers: Supplier[], perTime = false): OrderChip[] =>
  orderGroups(orders, suppliers).reduce<OrderChip[]>((chips, group) => {
    const last = chips[chips.length - 1]
    const fte = group.orders.reduce((sum, order) => sum + order.fte, 0)
    if (!perTime && last?.supplierId === group.supplierId) chips[chips.length - 1] = { ...last, fte: last.fte + fte, waits: last.waits || groupWaits(group), orders: [...last.orders, ...group.orders] }
    else chips.push({ key: perTime ? group.key : group.supplierId, supplierId: group.supplierId, fte, waits: groupWaits(group), orders: group.orders })
    return chips
  }, [])

/**
 * What a folded day shows in the compact line, on one line whatever it has of orders: nothing, the chip of its one
 * supplier, or one stacked chip for several, with their people together. It waits if any of them does.
 */
export type DayBlock = { kind: 'one'; chip: OrderChip } | { kind: 'stack'; fte: number; waits: boolean; chips: OrderChip[] }

export const dayBlock = (chips: OrderChip[]): DayBlock | null => {
  if (!chips.length) return null
  if (chips.length === 1) return { kind: 'one', chip: chips[0] }
  return { kind: 'stack', fte: chips.reduce((sum, chip) => sum + chip.fte, 0), waits: chips.some((chip) => chip.waits), chips }
}

/** The days picked on a competence, together: what remains, what is ordered, and what is still missing or over. */
export interface RangeSummary {
  rest: number
  planned: number
  /** The hours missing on the days that are short. */
  short: number
  /** The hours ordered over what remains, where no day is short. */
  over: number
  /** The people ordered, a person counted once per day. */
  people: number
  /** The people on a day shift that would cover what is missing. */
  peopleShort: number
}

export const rangeSummary = (covers: Coverage[], orders: HireOrder[], wd: WorkdaySettings): RangeSummary => {
  const short = covers.reduce((sum, cover) => sum + Math.max(0, cover.remaining), 0)
  return {
    rest: covers.reduce((sum, cover) => sum + cover.rest, 0),
    planned: covers.reduce((sum, cover) => sum + cover.planned, 0),
    short,
    over: short > HOURS_NOISE ? 0 : covers.reduce((sum, cover) => sum + Math.max(0, -cover.remaining), 0),
    people: orders.reduce((sum, order) => sum + order.fte, 0),
    peopleShort: Math.max(0, Math.ceil(short / hireHours(shiftTimes('dag', wd), wd) - 1e-6)),
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
export const HIRED_LINE_ID = 'hired:innleid'
export const hiredLine = (confirmed: DayValues): CapacityLine => ({ id: HIRED_LINE_ID, label: 'Innleid', group: 'added', values: confirmed })

/** What a supplier is ordered for, together: for the head of its order. */
export interface SupplierTotals {
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
