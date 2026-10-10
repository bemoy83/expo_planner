import { buildDemandIndex, dataYear, requiredHours } from './calc'
import { productTypeKey } from './kpi'
import { PLANNED_BASIS, type AllocationRow, type DemandLine, type KpiConfig } from './types'

/**
 * Demand the planner has taken into the plan («Planlagt») shows in the Kalender by itself: one row per
 * project, phase, hall, competence and department that has hours. Such a row exists only as a suggestion until FTE is
 * typed into it; then it becomes an ordinary planning row.
 */

export const SUGGESTED_ROW_PREFIX = 'forslag|'

export const isSuggestedRow = (row: Pick<AllocationRow, 'id'>): boolean => row.id.startsWith(SUGGESTED_ROW_PREFIX)

const norm = (value: string) => value.trim().toLowerCase()

type Scope = Pick<AllocationRow, 'projectNo' | 'refYear' | 'competence' | 'phase' | 'basis' | 'hall' | 'avdeling'>

/** A row without a hall or department covers all of them; that is not the same as demand that has none. */
const ALL = '*'

/** What makes two rows the same line of work: project, year of the demand, competence, phase, basis, hall and department. */
export const rowScope = (row: Scope): string =>
  [row.projectNo, row.refYear, row.competence, row.phase, row.basis, row.hall ?? ALL, row.avdeling ?? ALL].map(norm).join('|')

/** The same line of work across every hall and department. */
const wideScope = (row: Scope): string => rowScope({ ...row, hall: undefined, avdeling: undefined })

/** Whether `row` already plans the demand of `other`: the same scope, or a wider one. */
const covers = (row: Scope, other: Scope): boolean =>
  (row.hall === undefined || norm(row.hall) === norm(other.hall ?? ALL)) && (row.avdeling === undefined || norm(row.avdeling) === norm(other.avdeling ?? ALL))

export const suggestedRows = (demand: DemandLine[], allocations: AllocationRow[]): AllocationRow[] => {
  const existing = new Map<string, AllocationRow[]>()
  for (const row of allocations) existing.set(wideScope(row), [...(existing.get(wideScope(row)) ?? []), row])
  const found = new Map<string, AllocationRow>()
  for (const line of demand) {
    if (norm(line.basis) !== norm(PLANNED_BASIS) || !line.projectNo.trim() || !line.competence.trim()) continue
    const phases = [
      ['Montering', line.assemblyHours],
      ['Demontering', line.dismantleHours],
    ] as const
    for (const [phase, hours] of phases) {
      if (!(hours > 0)) continue
      const row: AllocationRow = {
        id: '',
        order: Number.MAX_SAFE_INTEGER,
        projectName: line.projectName,
        projectNo: line.projectNo.trim(),
        refYear: dataYear(line.projectNo),
        competence: line.competence.trim(),
        phase,
        basis: PLANNED_BASIS,
        hall: line.hall.trim(),
        avdeling: (line.avdeling ?? '').trim(),
        fte: {},
        notes: {},
      }
      const scope = rowScope(row)
      // A row for all halls already holds this demand; a second row would count the hours twice.
      if (found.has(scope) || existing.get(wideScope(row))?.some((other) => covers(other, row))) continue
      found.set(scope, { ...row, id: `${SUGGESTED_ROW_PREFIX}${scope}` })
    }
  }
  return [...found.values()]
}

/**
 * When a product type is given another competence, its hours move to that competence, and the rows
 * already planned for them would be left with FTE and no demand. Those rows follow: a row moves when
 * all its demand went away with the change and there is demand for the same project, phase, hall and
 * department under exactly one of the competences its product types went to. A row that still has
 * demand stays, as does one whose new place is already planned by another row.
 * Returns the rows that move, as they are after the move.
 */
export const followCompetence = (rows: AllocationRow[], kpiBefore: KpiConfig, kpiAfter: KpiConfig, demandBefore: DemandLine[], demandAfter: DemandLine[]): AllocationRow[] => {
  const was = new Map(kpiBefore.workTypes.map((type) => [productTypeKey(type.productType), type.competence]))
  const wentTo = new Map<string, Set<string>>()
  for (const type of kpiAfter.workTypes) {
    const old = was.get(productTypeKey(type.productType))
    if (!old?.trim() || !type.competence.trim() || norm(old) === norm(type.competence)) continue
    wentTo.set(norm(old), (wentTo.get(norm(old)) ?? new Set()).add(type.competence.trim()))
  }
  if (!wentTo.size) return []
  const before = buildDemandIndex(demandBefore)
  const after = buildDemandIndex(demandAfter)
  const taken = new Set(rows.map(rowScope))
  const moved: AllocationRow[] = []
  for (const row of rows) {
    const targets = wentTo.get(norm(row.competence))
    if (!targets || norm(row.basis) !== norm(PLANNED_BASIS)) continue
    if (!((requiredHours(before, row) ?? 0) > 0) || (requiredHours(after, row) ?? 0) > 0) continue
    const withDemand = [...targets].filter((competence) => (requiredHours(after, { ...row, competence }) ?? 0) > 0)
    if (withDemand.length !== 1) continue
    const next = { ...row, competence: withDemand[0] }
    if (taken.has(rowScope(next))) continue
    taken.add(rowScope(next))
    moved.push(next)
  }
  return moved
}
