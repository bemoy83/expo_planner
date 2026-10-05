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
 * Shares FTE-days evenly over a number of days, for demand drawn across days in the Kalender.
 * Each day gets a multiple of `step` (half a person by default). The total is rounded up to the next
 * step so the demand is covered, and what does not divide evenly goes to the first days.
 * Nothing to share gives no days.
 */
export const shareOverDays = (total: number, days: number, step = 0.5): number[] => {
  if (days <= 0 || !(total > 1e-9)) return []
  const steps = Math.ceil(total / step - 1e-9)
  const base = Math.floor(steps / days)
  const extra = steps % days
  return Array.from({ length: days }, (_, i) => (base + (i < extra ? 1 : 0)) * step)
}
