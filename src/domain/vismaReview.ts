import { placeOf, UNRESOLVED_HALL } from './locations'
import type { KpiConfig, LineOverride, VismaImport } from './types'
import { buildVismaLines, type VismaLine } from './visma'

/** Going through the Visma lines after an import: what still needs the planner, per project and in all. */

/** Which Visma lines Behov shows: all, those not yet in the plan, those with no hall, or those that give no hours. */
export type LineFilter = 'all' | 'open' | 'unresolved' | 'issue'

type Aliases = Record<string, string> | undefined

/** A line whose Hall/Sted names no hall of the hall ledger counts under «Uavklart» in the Kalender. */
export const isUnplaced = (line: VismaLine, halls: string[], aliases: Aliases): boolean => placeOf(line.hall, halls, aliases).hall === UNRESOLVED_HALL

export const matchesFilter = (line: VismaLine, filter: LineFilter, halls: string[], aliases: Aliases): boolean =>
  filter === 'all' ? true : filter === 'open' ? !line.inPlan : filter === 'unresolved' ? isUnplaced(line, halls, aliases) : !!line.issue

export interface ProjectReview {
  projectNo: string
  lines: VismaLine[]
  /** Lines not in the plan. */
  open: number
  /** Of those, the ones that give hours and so can be taken in. */
  ready: number
  unresolved: number
  issues: number
}

/** The Visma lines of every project, sorted as Behov lists them, with the counts of what needs the planner. */
export const reviewVisma = (visma: VismaImport[], kpi: KpiConfig, overrides: Record<string, LineOverride>, halls: string[], aliases: Aliases): Map<string, ProjectReview> => {
  const review = new Map<string, ProjectReview>()
  for (const { projectNo, rows } of visma) {
    const lines = buildVismaLines(rows, kpi, overrides).sort(
      (a, b) => a.competence.localeCompare(b.competence, 'nb') || a.workType.localeCompare(b.workType, 'nb') || a.hall.localeCompare(b.hall, 'nb'),
    )
    review.set(projectNo, {
      projectNo,
      lines,
      open: lines.filter((line) => !line.inPlan).length,
      ready: lines.filter((line) => !line.inPlan && !line.issue).length,
      unresolved: lines.filter((line) => isUnplaced(line, halls, aliases)).length,
      issues: lines.filter((line) => line.issue).length,
    })
  }
  return review
}

/** How many lines match the filter in a project. */
export const countOf = (project: ProjectReview, filter: LineFilter): number =>
  filter === 'all' ? project.lines.length : filter === 'open' ? project.open : filter === 'unresolved' ? project.unresolved : project.issues
