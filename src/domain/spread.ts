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
 * Shares FTE-days over a number of days in whole people, for demand drawn across days in the Kalender.
 * The whole FTE-days are shared evenly, with the ones that do not divide on the first days. The decimals
 * are kept for the last day of the work: the last day drawn, or, where there are fewer whole FTE-days
 * than days, the day after the last one that got a person. The total is rounded up to one decimal so
 * the demand is covered. Nothing to share gives no days.
 */
export const shareOverDays = (total: number, days: number): number[] => {
  if (days <= 0 || !(total > 1e-9)) return []
  const tenths = Math.ceil(total * 10 - 1e-9)
  const whole = Math.floor(tenths / 10)
  const rest = (tenths % 10) / 10
  const base = Math.floor(whole / days)
  const extra = whole % days
  const parts = Array.from({ length: days }, (_, i) => base + (i < extra ? 1 : 0))
  if (rest) parts[base > 0 ? days - 1 : Math.min(extra, days - 1)] += rest
  return parts
}

export interface FillInput {
  /** The cells from the first selected day to the last day involved: the selection, and the days dragged over. */
  values: (number | undefined)[]
  /** Whether each of those days is a working day. */
  workdays: boolean[]
  /** How many of the cells were selected when the drag started. */
  sourceLength: number
  /** How many cells the block covers after the drag: more than `sourceLength` drags out, fewer drags back in. */
  length: number
  mode: 'copy' | 'stretch'
}

/**
 * What dragging the fill handle of a selection sideways does to one line, cell by cell:
 * a number to put there, null to clear the cell, undefined to leave it alone.
 *
 * Copying repeats the selected values over the new days, as Excel does, but only on working days; weekends
 * and holidays in between are left alone unless the selection itself has no working day. Dragging back in
 * clears the days let go of.
 *
 * Stretching keeps the sum of the selection and shares it again over the working days of the new length,
 * see `shareOverDays`.
 */
export const fillAcross = ({ values, workdays, sourceLength, length, mode }: FillInput): (number | null | undefined)[] => {
  const span = Math.max(sourceLength, length)
  const out: (number | null | undefined)[] = Array.from({ length: span }, () => undefined)
  const indexes = (count: number) => {
    const all = Array.from({ length: count }, (_, i) => i)
    const working = all.filter((i) => workdays[i])
    return working.length ? working : all
  }
  if (mode === 'copy') {
    for (let i = length; i < sourceLength; i++) out[i] = values[i] === undefined ? undefined : null
    if (length <= sourceLength) return out
    const source = indexes(sourceLength)
    const skipsDaysOff = source.every((i) => workdays[i])
    let next = 0
    for (let i = sourceLength; i < length; i++) {
      if (skipsDaysOff && !workdays[i]) continue
      // An empty cell in the pattern empties the day it lands on; a day that is already empty is left alone.
      out[i] = values[source[next++ % source.length]] ?? (values[i] === undefined ? undefined : null)
    }
    return out
  }
  const total = values.slice(0, sourceLength).reduce<number>((sum, value) => sum + (value ?? 0), 0)
  const target = indexes(length)
  const parts = shareOverDays(total, target.length)
  if (!parts.length) return out
  for (let i = 0; i < span; i++) {
    const at = i < length ? target.indexOf(i) : -1
    if (at >= 0) out[i] = parts[at] || null
    else if (values[i] !== undefined) out[i] = null
  }
  return out
}

export interface SpanInput {
  /** What the line has on each of its days. */
  values: (number | undefined)[]
  /** Whether each of those days is a working day. */
  workdays: boolean[]
  /** The span: its first and its last day. Every day between them has FTE. */
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

export interface SpanStretch {
  /** What changes, by day: a number to put there, null to clear the day. */
  cells: Map<number, number | null>
  /** The end was stopped by the next planned day of the line. */
  blocked: boolean
  /** With `demand`: the demand is met, at the latest on the last day written. */
  met: boolean
}

const hundredths = (value: number) => Math.round(value * 100) / 100

/**
 * What pulling an end of a span along the days does to its line. A span is the days in a row that have FTE.
 *
 * Outward, the new working days get the crew of the span: what its end day has, or what the day inside it
 * has where the end day holds the decimals that were left over (a figure that is no whole number and lower
 * than its neighbour's); that day is then lifted to the crew too. Weekends and holidays are passed over,
 * unless the span has no working day itself. With `demand` the days are filled only until the row lacks
 * nothing: the last day gets what is left, rounded up to one decimal. The end never reaches into the next
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
    for (let i = reach + step; i !== tip + step; i += step) cells.set(i, null)
    return result()
  }

  let ownWorkday = false
  for (let i = from; i <= to; i++) ownWorkday ||= workdays[i]
  const fresh: number[] = []
  for (let i = tip + step; i !== reach + step; i += step) if (!ownWorkday || workdays[i]) fresh.push(i)
  const stops = mode === 'demand' && lacking !== null
  let left = stops ? Math.max(0, Math.ceil(lacking * 10 - 1e-9) / 10) : Infinity
  if (!fresh.length) return result(stops && left <= 1e-9)
  const tipValue = values[tip] ?? 0
  const inside = tip === hold ? 0 : (values[tip - step] ?? 0)
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
