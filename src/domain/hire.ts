import { dayOfMonth, monthShort, weekdayIndex, WEEKDAYS_NB, type ISODate } from './dates'
import type { CompetenceKey, HireOrder, Interval, Minute, ShiftId, Supplier, WorkdaySettings } from './types'

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
export const shiftOf = (times: Interval, wd: WorkdaySettings, shifts: ShiftId[] = ['dag', 'kveld', 'natt']): ShiftId | null =>
  shifts.find((shift) => shiftTimes(shift, wd).start === times.start && shiftTimes(shift, wd).end === times.end) ?? null

/** The length of an order's time, which goes through the night where its end is not after its start. */
export const hireMinutes = ({ start, end }: Interval): Minute => (end > start ? end - start : end + DAY - start)

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

/** How late in the working day a time is, counted from six in the morning, so that a night shift comes last. */
const fromMorning = (minute: Minute) => (minute - 360 + DAY) % DAY

/** I8: the orders of a competence on the days that are picked, gathered by supplier and time, in the suppliers' order and then by time. */
export const orderGroups = (orders: HireOrder[], suppliers: Supplier[]): OrderGroup[] => {
  const groups = new Map<string, OrderGroup>()
  for (const order of orders) {
    const key = `${order.supplierId}|${order.start}|${order.end}`
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

const clock = (minute: Minute) => `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

/**
 * I9: a supplier's order as text, to send: a heading per day, and under it a line per competence and time.
 * `competences` are the competences in the planner's order, with their names.
 */
export const orderText = (supplier: Supplier, orders: HireOrder[], competences: { key: CompetenceKey; label: string }[]): string => {
  const place = (key: CompetenceKey) => competences.findIndex((competence) => competence.key === key)
  const own = orders.filter((order) => order.supplierId === supplier.id).sort((a, b) => a.date.localeCompare(b.date) || place(a.competence) - place(b.competence) || fromMorning(a.start) - fromMorning(b.start))
  const lines = [`Bestilling – ${supplier.name}`]
  let day = ''
  for (const order of own) {
    if (order.date !== day) lines.push(`${WEEKDAYS_NB[weekdayIndex(order.date)].toLowerCase()} ${dayOfMonth(order.date)}. ${monthShort(order.date)}`)
    day = order.date
    lines.push(`  ${competences[place(order.competence)]?.label ?? order.competence}: ${order.fte} pers. ${clock(order.start)}–${clock(order.end)}`)
  }
  return lines.join('\n')
}

/** I10: the hours ordered that wait for an answer. */
export const waitingHours = (orders: HireOrder[], wd: WorkdaySettings): number => orders.reduce((sum, order) => sum + (isWaiting(order) ? order.fte * hireHours(order, wd) : 0), 0)
