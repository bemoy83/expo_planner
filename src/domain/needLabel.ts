/**
 * The label a day's demand is shown with in Bemanning, in Faste and in Innleid alike: the demand as a tint, filled
 * from the left by what covers it, in pieces, with what is still missing or over signed on it. Faste fills it with
 * the hours assigned to the permanent staff (`staffedLabel`), Innleid with the orders (`labelSegments` in `hire.ts`).
 */

/**
 * What a piece of the fill is: hours that cover the demand, hours that wait for an answer, hours past the demand
 * (the ochre tail, waiting or not), and hours the staff cannot cover in normal time (hatched at the end).
 */
type NeedSegmentKind = 'covered' | 'waiting' | 'surplus' | 'surplusWaiting' | 'uncoverable'

export interface NeedSegment {
  kind: NeedSegmentKind
  /** Where it starts and how wide it is, as shares of the label. */
  from: number
  width: number
}

export interface NeedLabelParts {
  segs: NeedSegment[]
  /** Where a rule sets one order from the next, as shares of the label. */
  rules: number[]
  /** The hours still missing as a negative number, those over as a positive one; `null` where the day is covered. */
  figure: number | null
  /** The figure stands on an alert's fill, the tail or the hatch, and takes the alerts' ink. */
  alert: boolean
  /** The hours that cover the day of the hours it needs, shown in their place on a label wide enough for them (2026-10-26); `null` where it needs none. */
  of: { done: number; need: number } | null
}

/** The demand of a competence on a day against the hours the permanent staff are assigned. */
interface StaffedDay {
  demand: number
  assigned: number
  /** Negative where more is assigned than is needed. */
  remaining: number
}

/**
 * Faste's label: filled from the left by the hours assigned (overtime as normal time: the people's lines show it),
 * then what is given beyond the demand, and at the end the hours that cannot be covered in normal time. A difference
 * of `noise` hours or less is none.
 */
export const staffedLabel = (day: StaffedDay, uncoverable: number, noise: number): NeedLabelParts => {
  const base = Math.max(day.demand, day.assigned) || 1
  const left = Math.max(0, day.remaining)
  const over = day.remaining < -noise
  const segs: NeedSegment[] = []
  const covered = Math.min(day.assigned, day.demand) / base
  if (covered > 0) segs.push({ kind: 'covered', from: 0, width: covered })
  if (day.assigned > day.demand) segs.push({ kind: 'surplus', from: covered, width: (day.assigned - day.demand) / base })
  if (uncoverable > noise) segs.push({ kind: 'uncoverable', from: 1 - uncoverable / base, width: uncoverable / base })
  const figure = over ? -day.remaining : left > noise ? -left : null
  return { segs, rules: [], figure, alert: over || (left > noise && uncoverable > noise), of: day.demand > noise ? { done: day.assigned, need: day.demand } : null }
}
