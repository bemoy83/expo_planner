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

/** The hours of one key, split by where the work is and which department ordered it. */
interface HourPart extends HourTotals {
  hall: string
  avdeling: string
}

export interface DemandIndex {
  hours: Map<string, HourTotals>
  parts: Map<string, HourPart[]>
  /** projectNo → competence → set of bases */
  options: Map<string, Map<string, Set<string>>>
}

const key = (projectNo: string, competence: string, basis: string) =>
  `${projectNo.trim()}|${norm(competence)}|${norm(basis)}`

export const buildDemandIndex = (demand: DemandLine[]): DemandIndex => {
  const hours = new Map<string, HourTotals>()
  const parts = new Map<string, HourPart[]>()
  const options = new Map<string, Map<string, Set<string>>>()
  for (const line of demand) {
    const k = key(line.projectNo, line.competence, line.basis)
    const totals = hours.get(k) ?? { assembly: 0, dismantle: 0 }
    totals.assembly += line.assemblyHours
    totals.dismantle += line.dismantleHours
    hours.set(k, totals)
    const list = parts.get(k) ?? []
    list.push({ hall: line.hall.trim(), avdeling: (line.avdeling ?? '').trim(), assembly: line.assemblyHours, dismantle: line.dismantleHours })
    parts.set(k, list)
    if (!line.competence.trim()) continue
    const byCompetence = options.get(line.projectNo.trim()) ?? new Map<string, Set<string>>()
    const bases = byCompetence.get(line.competence.trim()) ?? new Set<string>()
    bases.add(line.basis.trim())
    byCompetence.set(line.competence.trim(), bases)
    options.set(line.projectNo.trim(), byCompetence)
  }
  return { hours, parts, options }
}

type RowScope = Pick<AllocationRow, 'projectNo' | 'refYear' | 'competence' | 'basis' | 'phase' | 'hall' | 'avdeling'>

/**
 * Required hours for a row, as the workbook's TIMER column computes them.
 * A row with a hall or a department counts only the demand lines for that hall and department.
 */
export const requiredHours = (index: DemandIndex, row: RowScope): number | null => {
  const ref = referenceProjectNo(row.projectNo, row.refYear)
  if (!ref || !row.phase) return null
  const k = key(ref, row.competence, row.basis)
  const phase = row.phase === 'Montering' ? 'assembly' : 'dismantle'
  if (row.hall === undefined && row.avdeling === undefined) return index.hours.get(k)?.[phase] ?? 0
  let sum = 0
  for (const part of index.parts.get(k) ?? []) {
    if (row.hall !== undefined && norm(part.hall) !== norm(row.hall)) continue
    if (row.avdeling !== undefined && norm(part.avdeling) !== norm(row.avdeling)) continue
    sum += part[phase]
  }
  return sum
}

/** Halls and departments with demand for a project, competence and basis, for choosing a row's scope. */
export const demandScopes = (index: DemandIndex, row: Pick<AllocationRow, 'projectNo' | 'refYear' | 'competence' | 'basis'>): { halls: string[]; avdelinger: string[] } => {
  const list = index.parts.get(key(referenceProjectNo(row.projectNo, row.refYear), row.competence, row.basis)) ?? []
  const sorted = (values: string[]) => [...new Set(values)].sort((a, b) => a.localeCompare(b, 'nb'))
  return { halls: sorted(list.map((p) => p.hall)), avdelinger: sorted(list.map((p) => p.avdeling)) }
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

/** A difference in FTE this small is rounding: nothing is left, nothing is over. */
export const FTE_NOISE = 0.05

export const formatFte = (value: number | null | undefined, digits = 1): string =>
  value === null || value === undefined || !Number.isFinite(value) ? '' : value.toLocaleString('nb-NO', { maximumFractionDigits: digits, minimumFractionDigits: 0 })
