import type { Minute } from '../domain/types'

/** How the app writes figures, hours and times of day: every page writes them with these. */

// A formatter per number of decimals, made once: `toLocaleString` with options makes one on every call, which a
// grid of a thousand figures redrawn as it scrolls cannot afford.
const formats = new Map<number, Intl.NumberFormat>()
const formatOf = (digits: number) => {
  let format = formats.get(digits)
  if (!format) formats.set(digits, (format = new Intl.NumberFormat('nb-NO', { maximumFractionDigits: digits, minimumFractionDigits: 0 })))
  return format
}

/** A figure with a decimal comma and at most `digits` decimals; nothing for none. */
export const formatFte = (value: number | null | undefined, digits = 1): string => (value === null || value === undefined || !Number.isFinite(value) ? '' : formatOf(digits).format(value))

/** A figure with its sign: «−» for what is missing, «+» for what is over, and nothing for zero, where the colour says it. */
export const signed = (figure: string): string => (/[1-9]/.test(figure) ? (figure.startsWith('−') || figure.startsWith('-') ? figure : `+${figure}`) : '')

/** Hours as Behov writes them: one decimal, with a comma. */
export const hours = (value: number) => formatFte(value, 1)

/** The same, with a dash for none, where a column of figures is read across. */
export const hoursOrDash = (value: number) => (value ? hours(value) : '–')

/** Hours with a decimal comma. Quarter hours keep both decimals: 2,75. */
export const hoursText = (value: number): string => formatFte(Math.round(value * 100) / 100, 2) || '0'

/** Hours with one decimal, where they are read at a glance and the exact figure is in the tooltip: a competence's line. 12,75 is 12,8. */
export const hoursShort = (value: number): string => formatFte(Math.round(value * 10) / 10, 1) || '0'

/** Hours with their sign, as Innleid writes them: «−» for what is missing, «+» for what is over, and nothing for none. */
export const signedHours = (value: number): string => signed(hoursShort(value))

/** Whole hours, «1 250». */
export const wholeHours = (value: number) => formatOf(0).format(Math.round(value))

/** A share as a percentage: «10 %», «12,5 %». */
export const percentText = (share: number): string => `${formatFte(Math.round(share * 1000) / 10)} %`

/** Hours with their sign, as an Avvik is written: «+12,5», «−9,5». Nothing where there is no budget, or nothing to say. */
export const deviationText = (deviation: number | null): string => {
  if (deviation === null) return ''
  const shown = hours(Math.abs(deviation))
  if (shown === '0') return '0'
  return `${deviation > 0 ? '+' : '−'}${shown}`
}

/** A share of the budget with its sign: «+12 %», «−4 %». */
export const shareText = (share: number | null): string => {
  if (share === null) return ''
  const pct = Math.round(share * 100)
  return pct === 0 ? '0 %' : `${pct > 0 ? '+' : '−'}${Math.abs(pct)} %`
}

/** A deviation from the budget as Resultat reads it, against the budget: «+12» is over it, «−9,5» under. The domain keeps budget less used. */
export const overText = (deviation: number | null): string => (deviation === null ? '' : deviationText(-deviation))

/** The same as a share of the budget: «+8 %» is over it. */
export const overShareText = (share: number | null): string => (share === null ? '' : shareText(-share))

/** A deviation from the budget in whole hours, against it: «+59», «−293». */
export const overHours = (deviation: number | null): string => overText(deviation === null ? null : Math.round(deviation))

/** Whole hours, or a dash for none. */
export const wholeOrDash = (value: number | null): string => (value === null ? '–' : wholeHours(value))

/** Hours that remain, with a minus where more is done than planned: «12,5», «−3». */
export const remainingText = (remaining: number): string => {
  const shown = hours(Math.abs(remaining))
  return shown === '0' ? '' : `${remaining < 0 ? '−' : ''}${shown}`
}

/** A time of day, «07:00». */
export const clock = (minute: Minute): string => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

/** A time of day, «07:00»; short, a whole hour loses its minutes: «07». */
export const clockText = (minute: Minute, short: boolean): string => (short && minute % 60 === 0 ? String(Math.floor(minute / 60)).padStart(2, '0') : clock(minute))

/** A stretch of time, «07:00–15:00». Short, whole hours lose their minutes: «07–15», «11:30–15». */
export const spanText = (start: Minute, end: Minute, short: boolean): string => `${clockText(start, short)}–${clockText(end, short)}`
