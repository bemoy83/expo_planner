import { addDays, isoWeek, MONTHS_NB, WEEKDAYS_NB, weekdayIndex, type ISODate } from '../../domain/dates'
import type { AllocationRow } from '../../domain/types'
import { dimensionValue, type Dimension } from './rows'

/** A row described by the given properties, e.g. «Hall C · Avd. 64». */
export const describeRow = (row: AllocationRow, dimensions: Dimension[]): string =>
  dimensions.map((d) => (d === 'project' ? row.projectName : dimensionValue(row, d).label)).join(' · ')

export const fmtDate = (date: ISODate) => {
  const [y, m, d] = date.split('-')
  return `${WEEKDAYS_NB[weekdayIndex(date)].toLowerCase()} ${d}.${m}.${y}`
}

/** A day without its year, e.g. «man 5. okt». */
export const fmtDay = (date: ISODate) => `${WEEKDAYS_NB[weekdayIndex(date)].toLowerCase()} ${Number(date.slice(8))}. ${MONTHS_NB[Number(date.slice(5, 7)) - 1].toLowerCase()}`

export const rowTitle = (row: AllocationRow) => `${describeRow(row, ['project', 'competence', 'hall', 'avdeling'])} · ${row.phase}`

export const deltaClass = (delta: number | null) => (delta === null ? '' : delta < -0.05 ? 'under' : delta > 0.05 ? 'over' : 'ok')

/** Roughly the width of a month's name in the date header, «NOV 2026», with a little air after it. */
const MONTH_LABEL_W = 68

/**
 * What the week and month line of the date header says on a day: the month on the 1st, the week on a
 * Monday. A month's name is wider than a day, so a week that starts under it is written after the name,
 * «NOV 2026 · u45», and not on its own Monday.
 */
export const headLabel = (date: ISODate, colW: number): { month?: string; week?: string } => {
  const covered = Math.ceil(MONTH_LABEL_W / colW)
  const day = Number(date.slice(8))
  if (day === 1) {
    const toMonday = (7 - weekdayIndex(date)) % 7
    return { month: `${MONTHS_NB[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`, week: toMonday < covered ? `u${isoWeek(addDays(date, toMonday))}` : undefined }
  }
  return weekdayIndex(date) === 0 && day > covered ? { week: `u${isoWeek(date)}` } : {}
}
