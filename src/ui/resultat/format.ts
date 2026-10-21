import { hours } from '../behov/format'

/** A share as a percentage: «10 %», «12,5 %». */
export const percentText = (share: number): string => `${(Math.round(share * 1000) / 10).toLocaleString('nb-NO')} %`

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

/** Hours that remain, with a minus where more is done than planned: «12,5», «−3». */
export const remainingText = (remaining: number): string => {
  const shown = hours(Math.abs(remaining))
  return shown === '0' ? '' : `${remaining < 0 ? '−' : ''}${shown}`
}
