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
