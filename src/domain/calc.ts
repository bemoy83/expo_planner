import type { ISODate } from './dates'
import { dayType } from './holidays'
import type { AllocationRow, CapacityLine, DayValues, DemandLine, Settings } from './types'

/** Excel's SUMIFS matches text case-insensitively; mirror that. */
const norm = (value: string): string => value.trim().toLowerCase()

/** `DATA FRA` year + project series, e.g. 2024 + 26970 → 24970 (`PROSJEKT_DATA`). */
export const referenceProjectNo = (projectNo: string, refYear: string): string => {
  const series = projectNo.trim().slice(-3)
  const yy = refYear.trim().slice(-2)
  return series.length === 3 && yy.length === 2 ? `${yy}${series}` : ''
}

export const seriesOf = (projectNo: string): string => projectNo.trim().slice(-3)

interface HourTotals {
  assembly: number
  dismantle: number
}

export interface DemandIndex {
  hours: Map<string, HourTotals>
  /** projectNo → competence → set of bases */
  options: Map<string, Map<string, Set<string>>>
}

const key = (projectNo: string, competence: string, basis: string) =>
  `${projectNo.trim()}|${norm(competence)}|${norm(basis)}`

export const buildDemandIndex = (demand: DemandLine[]): DemandIndex => {
  const hours = new Map<string, HourTotals>()
  const options = new Map<string, Map<string, Set<string>>>()
  for (const line of demand) {
    const k = key(line.projectNo, line.competence, line.basis)
    const totals = hours.get(k) ?? { assembly: 0, dismantle: 0 }
    totals.assembly += line.assemblyHours
    totals.dismantle += line.dismantleHours
    hours.set(k, totals)
    if (!line.competence.trim()) continue
    const byCompetence = options.get(line.projectNo.trim()) ?? new Map<string, Set<string>>()
    const bases = byCompetence.get(line.competence.trim()) ?? new Set<string>()
    bases.add(line.basis.trim())
    byCompetence.set(line.competence.trim(), bases)
    options.set(line.projectNo.trim(), byCompetence)
  }
  return { hours, options }
}

/** Required hours for a row, as the workbook's TIMER column computes them. */
export const requiredHours = (index: DemandIndex, row: Pick<AllocationRow, 'projectNo' | 'refYear' | 'competence' | 'basis' | 'phase'>): number | null => {
  const ref = referenceProjectNo(row.projectNo, row.refYear)
  if (!ref || !row.phase) return null
  const totals = index.hours.get(key(ref, row.competence, row.basis))
  if (!totals) return 0
  return row.phase === 'Montering' ? totals.assembly : totals.dismantle
}

/** Years with demand recorded for the same project series. */
export const availableYears = (index: DemandIndex, projectNo: string): string[] => {
  const series = seriesOf(projectNo)
  const years = new Set<string>()
  for (const ref of index.options.keys()) if (ref.length === 5 && ref.endsWith(series)) years.add(`20${ref.slice(0, 2)}`)
  return [...years].sort().reverse()
}

export const sumValues = (values: DayValues): number => Object.values(values).reduce((a, b) => a + b, 0)

export interface RowTotals {
  requiredHours: number | null
  requiredFte: number | null
  plannedFte: number
  deltaFte: number | null
  firstDate: ISODate | null
  lastDate: ISODate | null
}

export const rowTotals = (index: DemandIndex, row: AllocationRow, settings: Settings): RowTotals => {
  const hours = requiredHours(index, row)
  const requiredFte = hours === null ? null : hours / settings.hoursPerDay
  const plannedFte = sumValues(row.fte)
  const dates = Object.keys(row.fte).filter((d) => row.fte[d] !== 0).sort()
  return {
    requiredHours: hours,
    requiredFte,
    plannedFte,
    deltaFte: requiredFte === null ? null : plannedFte - requiredFte,
    firstDate: dates[0] ?? null,
    lastDate: dates.at(-1) ?? null,
  }
}

/** Sum of allocated FTE per date across the given rows (`Planlagt dagsbehov`). */
export const dailyNeed = (rows: AllocationRow[]): Map<ISODate, number> => {
  const need = new Map<ISODate, number>()
  for (const row of rows) for (const [date, fte] of Object.entries(row.fte)) need.set(date, (need.get(date) ?? 0) + fte)
  return need
}

export interface DayCapacity {
  base: number
  added: number
  overtime: number
  unavailable: number
  available: number
}

export const capacityForDate = (date: ISODate, lines: CapacityLine[], settings: Settings): DayCapacity => {
  const base = dayType(date) === 'arbeidsdag' ? settings.baseCrew : 0
  let added = 0
  let overtime = 0
  let unavailable = 0
  for (const line of lines) {
    const value = line.values[date] ?? 0
    if (line.group === 'added') added += value
    else if (line.group === 'unavailable') unavailable += value
    else overtime += (value * (line.hours?.[date] ?? 0)) / settings.hoursPerDay
  }
  return { base, added, overtime, unavailable, available: base + added + overtime - unavailable }
}

export const formatFte = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined || !Number.isFinite(value) ? '' : value.toLocaleString('nb-NO', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
