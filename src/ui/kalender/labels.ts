import { WEEKDAYS_NB, weekdayIndex, type ISODate } from '../../domain/dates'
import type { AllocationRow } from '../../domain/types'
import { dimensionValue, type Dimension } from './rows'

/** A row described by the given properties, e.g. «Hall C · Avd. 64». */
export const describeRow = (row: AllocationRow, dimensions: Dimension[]): string =>
  dimensions.map((d) => (d === 'project' ? row.projectName : dimensionValue(row, d).label)).join(' · ')

export const fmtDate = (date: ISODate) => {
  const [y, m, d] = date.split('-')
  return `${WEEKDAYS_NB[weekdayIndex(date)].toLowerCase()} ${d}.${m}.${y}`
}

export const rowTitle = (row: AllocationRow) => `${describeRow(row, ['project', 'competence', 'hall', 'avdeling'])} · ${row.phase}`

export const deltaClass = (delta: number | null) => (delta === null ? '' : delta < -0.05 ? 'under' : delta > 0.05 ? 'over' : 'ok')
