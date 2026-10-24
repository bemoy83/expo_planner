/**
 * Shares one number out over several rows, for FTE typed on a level of the Kalender's hierarchy.
 * Each row gets its part by weight (its required hours); without any weights the rows share alike.
 * The parts are rounded to the precision of the total (one decimal, or two where the total has two)
 * and always sum to the total: what rounding leaves over goes to the rows that were closest to more.
 */
export const spread = (total: number, weights: number[]): number[] => {
  if (!weights.length) return []
  const usable = weights.map((w) => (Number.isFinite(w) && w > 0 ? w : 0))
  const sum = usable.reduce((a, b) => a + b, 0)
  const shares = usable.map((w) => (sum > 0 ? w / sum : 1 / weights.length))
  // Work in whole steps so the parts cannot drift from the total.
  const scale = Math.abs(total * 10 - Math.round(total * 10)) < 1e-9 ? 10 : 100
  const steps = Math.round(Math.abs(total) * scale)
  const sign = total < 0 ? -1 : 1
  const exact = shares.map((share) => share * steps)
  const parts = exact.map(Math.floor)
  let left = steps - parts.reduce((a, b) => a + b, 0)
  const order = exact.map((value, i) => ({ i, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest || a.i - b.i)
  for (const { i } of order) {
    if (left <= 0) break
    parts[i] += 1
    left -= 1
  }
  return parts.map((part) => (sign * part) / scale)
}

/**
 * Shares a number typed on a level for one day over its rows, as `spread` does, but only over the rows that are
 * open that day: those whose window holds the day. The others get nothing. Where no row is open, all of them share.
 */
export const spreadOpen = (total: number, weights: number[], open: boolean[]): number[] => {
  const all = weights.map((_, i) => i)
  const some = all.filter((i) => open[i])
  const among = some.length ? some : all
  const parts = spread(total, among.map((i) => weights[i]))
  const out = weights.map(() => 0)
  among.forEach((i, at) => (out[i] = parts[at]))
  return out
}

/** FTE-days to the tenth, as the Kalender writes them: what reads «4,5» is shared as 4,5. */
const toTenths = (value: number): number => Math.round(value * 10 + 1e-9)

/**
 * Shares FTE-days over a number of days in whole people, for demand drawn across days in the Kalender.
 * The total, to the tenth as it is written, is counted in people, the last one a part of a person where it
 * has decimals, and the people are shared evenly with the ones that do not divide on the first days. The
 * part is the last person given, so the days never rise and the decimals end the work: 4,6 over three days
 * is 2, 2 and 0,6. Nothing to share gives no days.
 */
export const shareOverDays = (total: number, days: number): number[] => {
  const tenths = toTenths(total)
  if (days <= 0 || tenths <= 0) return []
  const people = Math.ceil(tenths / 10)
  const base = Math.floor(people / days)
  const extra = people % days
  const parts = Array.from({ length: days }, (_, i) => base + (i < extra ? 1 : 0))
  const last = base > 0 ? days - 1 : extra - 1
  parts[last] = (parts[last] * 10 - (people * 10 - tenths)) / 10
  return parts
}

export interface SpanInput {
  /** What the line has on each of its days. */
  values: (number | undefined)[]
  /** Whether each of those days is a working day. */
  workdays: boolean[]
  /** The span: its first and its last day. Every working day between them has FTE; a weekend or holiday may have none. */
  from: number
  to: number
  /** The end that is pulled, and the day it is pulled to. */
  end: 'start' | 'end'
  at: number
  /** `carry` takes the crew on, `demand` does so until the demand is met, `sum` shares the span's FTE-days again over its new length. */
  mode: 'carry' | 'demand' | 'sum'
  /** With `demand`: the FTE-days the row still lacks. Null where it has no demand or its demand is not known, and nothing stops the end. */
  lacking?: number | null
}

interface SpanStretch {
  /** What changes, by day: a number to put there, null to clear the day. */
  cells: Map<number, number | null>
  /** The end was stopped by the next planned day of the line. */
  blocked: boolean
  /** With `demand`: the demand is met, at the latest on the last day written. */
  met: boolean
}

const hundredths = (value: number) => Math.round(value * 100) / 100

/**
 * What pulling an end of a span along the days does to its line. A span is the days in a row that have FTE, over weekends and holidays without it: only an empty working day ends one.
 *
 * Outward, the new working days get the crew of the span: what its end day has, or what the day inside it
 * has where the end day holds the decimals that were left over (a figure that is no whole number and lower
 * than its neighbour's); that day is then lifted to the crew too. Weekends and holidays are passed over,
 * unless the span has no working day itself. With `demand` the days are filled only until the row lacks
 * nothing: the last day gets what is left, to the tenth as it is written. The end never reaches into the next
 * span: it stops on the day before the next planned day.
 *
 * Inward, the days let go of are cleared. The day at the other end always stays.
 *
 * With `sum` the FTE-days of the span are kept and shared again over the working days of its new length,
 * see `shareOverDays`.
 */
export const stretchSpan = ({ values, workdays, from, to, end, at, mode, lacking = null }: SpanInput): SpanStretch => {
  const cells = new Map<number, number | null>()
  const step = end === 'end' ? 1 : -1
  const tip = end === 'end' ? to : from
  const hold = end === 'end' ? from : to
  const outward = (at - tip) * step > 0
  let reach = tip
  let blocked = false
  if (outward) {
    for (let next = tip + step; reach !== at && next >= 0 && next < values.length; next += step) {
      blocked = !!values[next]
      if (blocked) break
      reach = next
    }
  } else reach = (at - hold) * step < 0 ? hold : at
  const result = (met = false): SpanStretch => ({ cells, blocked, met })
  if (reach === tip) return result(mode === 'demand' && lacking !== null && lacking <= 1e-9)

  if (mode === 'sum') {
    const first = Math.min(hold, reach)
    const last = Math.max(hold, reach)
    const days = Array.from({ length: last - first + 1 }, (_, i) => first + i)
    const working = days.filter((i) => workdays[i])
    const target = working.length ? working : days
    let total = 0
    for (let i = from; i <= to; i++) total += values[i] ?? 0
    const parts = shareOverDays(total, target.length)
    for (let i = Math.min(from, first); i <= Math.max(to, last); i++) {
      const part = (i >= first && i <= last && parts[target.indexOf(i)]) || null
      if (part !== (values[i] ?? null)) cells.set(i, part)
    }
    return result()
  }

  if (!outward) {
    for (let i = reach + step; i !== tip + step; i += step) if (values[i]) cells.set(i, null)
    return result()
  }

  let ownWorkday = false
  for (let i = from; i <= to; i++) ownWorkday ||= workdays[i]
  const fresh: number[] = []
  for (let i = tip + step; i !== reach + step; i += step) if (!ownWorkday || workdays[i]) fresh.push(i)
  const stops = mode === 'demand' && lacking !== null
  let left = stops ? Math.max(0, toTenths(lacking) / 10) : Infinity
  if (!fresh.length) return result(stops && left <= 1e-9)
  const tipValue = values[tip] ?? 0
  // The day before the end inside the span: a weekend without FTE between them is passed over.
  let inside = 0
  for (let i = tip - step; i !== hold - step && !inside; i -= step) inside = values[i] ?? 0
  const crew = !Number.isInteger(tipValue) && inside > tipValue ? inside : tipValue
  const give = (day: number, has: number) => {
    const more = Math.min(crew - has, left)
    if (more <= 1e-9) return
    cells.set(day, hundredths(has + more))
    left -= more
  }
  give(tip, tipValue)
  for (const day of fresh) give(day, 0)
  return result(stops && left <= 1e-9)
}
