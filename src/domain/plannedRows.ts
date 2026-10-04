import { PLANNED_BASIS, type AllocationRow, type DemandLine } from './types'

/**
 * Demand the planner has taken into the plan («Planlagt») shows in the Kalender by itself: one row per
 * project, competence and phase that has hours. Such a row exists only as a suggestion until FTE is
 * typed into it; then it becomes an ordinary planning row.
 */

export const SUGGESTED_ROW_PREFIX = 'forslag|'

export const isSuggestedRow = (row: Pick<AllocationRow, 'id'>): boolean => row.id.startsWith(SUGGESTED_ROW_PREFIX)

const norm = (value: string) => value.trim().toLowerCase()

/** What makes two rows the same line of work: project, year of the demand, competence, phase and basis. */
export const rowScope = (row: Pick<AllocationRow, 'projectNo' | 'refYear' | 'competence' | 'phase' | 'basis'>): string =>
  [row.projectNo, row.refYear, row.competence, row.phase, row.basis].map(norm).join('|')

export const suggestedRows = (demand: DemandLine[], allocations: AllocationRow[]): AllocationRow[] => {
  const existing = new Set(allocations.map(rowScope))
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
        refYear: `20${line.projectNo.trim().slice(0, 2)}`,
        competence: line.competence.trim(),
        phase,
        basis: PLANNED_BASIS,
        importedHours: null,
        fte: {},
        notes: {},
      }
      const scope = rowScope(row)
      if (existing.has(scope) || found.has(scope)) continue
      found.set(scope, { ...row, id: `${SUGGESTED_ROW_PREFIX}${scope}` })
    }
  }
  return [...found.values()]
}
